import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";
import packageJson from "../package.json";
import { encodeMessage, parseEnvelopes } from "./ipc";

const CLIENT_VERSION = typeof packageJson.version === "string" ? packageJson.version : "0.0.0";
const DEFAULT_HANDSHAKE_TIMEOUT_MS = getNumberEnv("DIXIE_HANDSHAKE_TIMEOUT_MS", 5_000);
const DEFAULT_REQUEST_TIMEOUT_MS = getNumberEnv("DIXIE_REQUEST_TIMEOUT_MS", 8_000);
const DEFAULT_RESTART_ATTEMPTS = getNumberEnv("DIXIE_HOST_RETRIES", 2);
const MIN_RESPONSE_CAPACITY = 64 * 1024;

type HostLaunchSpec = {
  command: string;
  args: string[];
};

type WorkerMessage =
  | {
      type: "format";
      id: string;
      source: string;
      sharedBuffer: SharedArrayBuffer;
      options: FormattingOptions;
      range: FormatRange | null;
    }
  | {
      type: "shutdown";
    };

type SharedStateView = {
  state: Int32Array;
  payload: Uint8Array;
};

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};
const HOST_PLATFORM_MAP: Record<NodeJS.Platform, string | null> = {
  aix: null,
  android: null,
  darwin: process.arch === "arm64" ? "osx-arm64" : "osx-x64",
  freebsd: null,
  haiku: null,
  linux: process.arch === "arm64" ? "linux-arm64" : "linux-x64",
  openbsd: null,
  sunos: null,
  win32: "win-x64",
  cygwin: "win-x64",
  netbsd: null
};

const CURRENT_LOG_LEVEL = normalizeLogLevel(process.env.DIXIE_LOG_LEVEL ?? "warn");

type FormatRange = {
  start: number;
  end: number;
};

export type FormattingOptions = {
  printWidth: number;
  tabWidth: number;
  useTabs: boolean;
  endOfLine: "lf" | "crlf";
};

export class HostClient {
  private launchSpec: HostLaunchSpec | null;
  private worker: Worker | null = null;
  private warned = false;
  private readonly handshakeTimeoutMs = DEFAULT_HANDSHAKE_TIMEOUT_MS;
  private readonly requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS;
  private readonly restartAttempts = Math.max(1, DEFAULT_RESTART_ATTEMPTS);
  private readonly memoryBudgetMb = getNumberEnv("DIXIE_HOST_MEMORY_BUDGET_MB", 512);
  private memoryPressureHits = 0;
  private memoryPressureWarned = false;
  private memoryGuardHits = 0;
  private memoryGuardWarned = false;

  constructor(launchSpec?: HostLaunchSpec) {
    this.launchSpec = launchSpec ?? null;
  }

  format(source: string, options: FormattingOptions, range?: FormatRange | null): string {
    try {
      let attempt = 0;
      let lastError: unknown;

      while (attempt < this.restartAttempts) {
        try {
          return this.sendFormatRequest(source, options, range ?? null);
        } catch (error) {
          lastError = error;
          attempt += 1;
          log(
            "warn",
            `[dixie] Host format attempt ${attempt}/${this.restartAttempts} failed: ${formatError(error)}`
          );
          this.disposeWorker();
        }
      }

      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    } catch (error) {
      return this.handleFailure(source, error);
    }
  }

  private sendFormatRequest(
    source: string,
    formatting: FormattingOptions,
    range: FormatRange | null
  ): string {
    const worker = this.ensureWorker();
    const responseCapacity = computeResponseCapacity(source);
    const sharedBuffer = new SharedArrayBuffer(8 + responseCapacity);
    const view = createSharedView(sharedBuffer);
    const requestId = randomUUID();

    view.state[0] = 0; // status
    view.state[1] = 0; // length

    const message: WorkerMessage = {
      type: "format",
      id: requestId,
      source,
      sharedBuffer,
      options: formatting,
      range
    };

    worker.postMessage(message);

    const overallTimeout = this.requestTimeoutMs + this.handshakeTimeoutMs + 1_000;
    const status = Atomics.wait(view.state, 0, 0, overallTimeout);

    if (status === "timed-out") {
      throw new Error(`Host request timed out after ${overallTimeout}ms.`);
    }

    const finalStatus = Atomics.load(view.state, 0);
    const length = Atomics.load(view.state, 1);

    if (length <= 0) {
      throw new Error("Host worker returned an empty response.");
    }

    const json = new TextDecoder().decode(view.payload.subarray(0, length));
    const payload = JSON.parse(json) as WorkerResponse;

    if (finalStatus === 1 && payload.status === "ok") {
      const formatted = typeof payload.formatted === "string" ? payload.formatted : source;
      const diagnostics = Array.isArray(payload.diagnostics) ? payload.diagnostics : [];
      const metrics = payload.metrics ?? {};
      const elapsedMs = typeof metrics.elapsedMs === "number" ? metrics.elapsedMs : null;
      const managedMemoryMb =
        typeof metrics.managedMemoryMb === "number" ? metrics.managedMemoryMb : null;
      const workingSetMb = typeof metrics.workingSetMb === "number" ? metrics.workingSetMb : null;
      const workingSetDeltaMb =
        typeof metrics.workingSetDeltaMb === "number" ? metrics.workingSetDeltaMb : null;

      this.observeMemoryPressure(workingSetMb);
      this.memoryGuardHits = 0;

      recordTelemetry({
        success: true,
        elapsedMs,
        diagnostics: diagnostics.length,
        options: formatting,
        range: range ?? null,
        error: null,
        managedMemoryMb,
        workingSetMb,
        workingSetDeltaMb,
        errorCode: null,
        memoryBudgetMb: this.memoryBudgetMb
      });

      if (diagnostics.length > 0) {
        for (const diagnostic of diagnostics) {
          if (diagnostic && typeof diagnostic === "object") {
            const severity = typeof (diagnostic as { severity?: string }).severity === "string"
              ? (diagnostic as { severity?: string }).severity
              : "info";
            const message = typeof (diagnostic as { message?: string }).message === "string"
              ? (diagnostic as { message?: string }).message
              : "Host emitted diagnostic.";
            log("warn", `[dixie host][${severity}] ${message}`);
          }
        }
      }

      return formatted;
    }

    if (payload.status === "error") {
      const errorCode =
        typeof payload.errorCode === "string" && payload.errorCode.length > 0
          ? payload.errorCode
          : null;

      this.observeMemoryGuardTrip(errorCode);

      recordTelemetry({
        success: false,
        elapsedMs: null,
        diagnostics: undefined,
        error: payload.message ?? "Host request failed.",
        options: formatting,
        range: range ?? null,
        managedMemoryMb: null,
        workingSetMb: null,
        workingSetDeltaMb: null,
        errorCode,
        memoryBudgetMb: this.memoryBudgetMb
      });
      throw new Error(payload.message ?? "Host request failed.");
    }

    throw new Error("Host worker returned an unexpected response.");
  }

  private ensureWorker(): Worker {
    if (this.worker) {
      return this.worker;
    }

    const spec = this.resolveLaunchSpec();
    const workerPath = findWorkerScript();

    const worker = new Worker(workerPath, {
      workerData: {
        spec,
        clientVersion: CLIENT_VERSION,
        handshakeTimeoutMs: this.handshakeTimeoutMs,
        requestTimeoutMs: this.requestTimeoutMs,
        restartAttempts: this.restartAttempts,
        logLevel: process.env.DIXIE_LOG_LEVEL ?? "warn"
      }
    });

    worker.once("error", (error) => {
      log("error", `[dixie] Host worker error: ${formatError(error)}`);
      this.disposeWorker();
    });

    worker.once("exit", (code) => {
      log("debug", `[dixie] Host worker exited with code ${code}`);
      this.worker = null;
    });

    this.worker = worker;
    return worker;
  }

  private disposeWorker(): void {
    if (!this.worker) {
      return;
    }

    try {
      const shutdownMessage: WorkerMessage = { type: "shutdown" };
      this.worker.postMessage(shutdownMessage);
    } catch (error) {
      log("debug", `[dixie] Failed to send shutdown message to worker: ${formatError(error)}`);
    }

    this.worker.terminate().catch((error) => {
      log("debug", `[dixie] Failed to terminate worker: ${formatError(error)}`);
    });

    this.worker = null;
  }

  private resolveLaunchSpec(): HostLaunchSpec {
    if (this.launchSpec) {
      return this.launchSpec;
    }

    this.launchSpec = resolveHostLaunchSpec();
    return this.launchSpec;
  }

  private handleFailure(source: string, cause: unknown): string {
    if (process.env.DIXIE_STRICT_HOST === "1") {
      throw cause instanceof Error ? cause : new Error(String(cause));
    }

    if (!this.warned) {
      log("warn", `[dixie] Falling back to original text: ${formatError(cause)}`);
      this.warned = true;
    }

    return source;
  }

  private observeMemoryPressure(workingSetMb: number | null): void {
    if (workingSetMb === null || !Number.isFinite(workingSetMb)) {
      this.memoryPressureHits = 0;
      return;
    }

    const threshold = this.memoryBudgetMb * 0.85;
    if (workingSetMb >= threshold) {
      this.memoryPressureHits += 1;
      if (!this.memoryPressureWarned && this.memoryPressureHits >= 3) {
        const guidance = [
          `[dixie] Host working set peaked at ${workingSetMb.toFixed(1)} MB (budget ${this.memoryBudgetMb} MB).`,
          "Consider increasing DIXIE_HOST_MEMORY_BUDGET_MB or sharing telemetry via `npm run telemetry:report`."
        ].join(" ");
        log("warn", guidance);
        this.memoryPressureWarned = true;
      }
    } else {
      this.memoryPressureHits = 0;
    }
  }

  private observeMemoryGuardTrip(errorCode: string | null): void {
    if (errorCode !== "MEMORY_BUDGET_EXCEEDED") {
      return;
    }

    this.memoryGuardHits += 1;
    if (!this.memoryGuardWarned && this.memoryGuardHits >= 3) {
      const message = [
        "[dixie] Host exceeded its memory budget multiple times.",
        "Raise DIXIE_HOST_MEMORY_BUDGET_MB or capture telemetry (npm run telemetry:report) and open an issue."
      ].join(" ");
      log("warn", message);
      this.memoryGuardWarned = true;
    }
  }
}

type WorkerResponse =
  | {
      status: "ok";
      formatted: string;
      diagnostics?: unknown[];
      metrics?: {
        elapsedMs?: number;
        parseDiagnostics?: number;
        managedMemoryMb?: number;
        workingSetMb?: number;
        workingSetDeltaMb?: number;
      };
    }
  | {
      status: "error";
      message?: string;
      errorCode?: string | null;
      details?: unknown;
    };

function createSharedView(sharedBuffer: SharedArrayBuffer): SharedStateView {
  const state = new Int32Array(sharedBuffer, 0, 2);
  const payload = new Uint8Array(sharedBuffer, 8);
  return { state, payload };
}

function computeResponseCapacity(source: string): number {
  const estimated = Buffer.byteLength(source, "utf8") * 2 + 4_096;
  return Math.max(MIN_RESPONSE_CAPACITY, estimated);
}

function findWorkerScript(): string {
  const candidates = [
    path.resolve(__dirname, "host-worker.js"),
    path.resolve(__dirname, "../dist/host-worker.js")
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    "Unable to locate host worker module. Run `npm run build` to generate artifacts."
  );
}

function resolveHostLaunchSpec(): HostLaunchSpec {
  const explicitPath = process.env.DIXIE_HOST_PATH;
  if (explicitPath) {
    return createLaunchSpec(explicitPath);
  }

  const packageRoot = path.resolve(__dirname, "..");
  const manifestSpec = resolveManifestLaunchSpec(packageRoot);
  if (manifestSpec) {
    return manifestSpec;
  }

  const repoRoot = path.resolve(packageRoot, "..", "..");
  const configurations = ["Debug", "Release"];
  const frameworks = ["net9.0", "net8.0"];
  const binaries = ["Dixie.Host", "Dixie.Host.dll"];

  for (const configuration of configurations) {
    for (const framework of frameworks) {
      const directory = path.join(repoRoot, "src", "Dixie.Host", "bin", configuration, framework);

      for (const binary of binaries) {
        const candidate = path.join(directory, binary);
        if (existsSync(candidate)) {
          return createLaunchSpec(candidate);
        }
      }
    }
  }

  throw new Error("Unable to locate Dixie host binary. Set DIXIE_HOST_PATH to override detection.");
}

function resolveManifestLaunchSpec(packageRoot: string): HostLaunchSpec | null {
  const platformKey = HOST_PLATFORM_MAP[process.platform] ?? null;
  if (!platformKey) {
    return null;
  }

  const manifestPath = path.join(packageRoot, "manifest.json");
  if (!existsSync(manifestPath)) {
    return null;
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return null;
  }

  if (!manifest || typeof manifest !== "object") {
    return null;
  }

  const binaries = (manifest as { binaries?: Record<string, unknown> }).binaries;
  if (!binaries || typeof binaries !== "object") {
    return null;
  }

  const entry = binaries[platformKey] as { path?: unknown } | undefined;
  const relativePath = entry && typeof entry.path === "string" ? entry.path : null;
  if (!relativePath) {
    return null;
  }

  const candidate = path.resolve(packageRoot, relativePath);
  if (!existsSync(candidate)) {
    return null;
  }

  try {
    return createLaunchSpec(candidate);
  } catch {
    return null;
  }
}

function createLaunchSpec(filePath: string): HostLaunchSpec {
  const resolved = path.resolve(filePath);

  if (!existsSync(resolved)) {
    throw new Error(`Host binary not found: ${resolved}`);
  }

  if (resolved.endsWith(".dll")) {
    return { command: "dotnet", args: [resolved] };
  }

  return { command: resolved, args: [] };
}

function getNumberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeLogLevel(level: string): LogLevel {
  if (level in LOG_LEVEL_ORDER) {
    return level as LogLevel;
  }

  return "warn";
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[CURRENT_LOG_LEVEL];
}

function log(level: LogLevel, message: string): void {
  if (!shouldLog(level)) {
    return;
  }

  if (level === "error") {
    console.error(message);
  } else if (level === "warn") {
    console.warn(message);
  } else {
    console.log(message);
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

type TelemetryPayload = {
  success: boolean;
  elapsedMs: number | null;
  diagnostics?: number;
  error: string | null;
  options: FormattingOptions;
  range: FormatRange | null;
  managedMemoryMb: number | null;
  workingSetMb: number | null;
  workingSetDeltaMb: number | null;
  errorCode: string | null;
  memoryBudgetMb: number;
};

function recordTelemetry(payload: TelemetryPayload): void {
  const telemetryFile = process.env.DIXIE_TELEMETRY_FILE;
  if (!telemetryFile) {
    return;
  }

  const entry = {
    timestamp: new Date().toISOString(),
    success: payload.success,
    elapsedMs: payload.elapsedMs,
    diagnostics: payload.diagnostics,
    error: payload.error,
    options: payload.options,
    range: payload.range ?? undefined,
    managedMemoryMb: payload.managedMemoryMb,
    workingSetMb: payload.workingSetMb,
    workingSetDeltaMb: payload.workingSetDeltaMb,
    errorCode: payload.errorCode,
    memoryBudgetMb: payload.memoryBudgetMb
  };

  try {
    appendFileSync(telemetryFile, `${JSON.stringify(entry)}\n`, { encoding: "utf8" });
  } catch (error) {
    log("debug", `[dixie] telemetry write failed: ${formatError(error)}`);
  }
}

export const hostClient = new HostClient();
export const _encodeMessageForTests = encodeMessage;
export const _parseEnvelopesForTests = parseEnvelopes;
