import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync } from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";
import packageJson from "../package.json";
import { encodeMessage, parseEnvelopes } from "./ipc";

const CLIENT_VERSION = typeof packageJson.version === "string" ? packageJson.version : "0.0.0";
const DEFAULT_HANDSHAKE_TIMEOUT_MS = getNumberEnv("NIKA_HANDSHAKE_TIMEOUT_MS", 5_000);
const DEFAULT_REQUEST_TIMEOUT_MS = getNumberEnv("NIKA_REQUEST_TIMEOUT_MS", 8_000);
const DEFAULT_RESTART_ATTEMPTS = getNumberEnv("NIKA_HOST_RETRIES", 2);
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

const CURRENT_LOG_LEVEL = normalizeLogLevel(process.env.NIKA_LOG_LEVEL ?? "warn");

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
            `[nika] Host format attempt ${attempt}/${this.restartAttempts} failed: ${formatError(error)}`
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

      recordTelemetry({
        success: true,
        elapsedMs,
        diagnostics: diagnostics.length,
        options: formatting,
        range: range ?? null,
        error: null,
        managedMemoryMb,
        workingSetMb,
        workingSetDeltaMb
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
            log("warn", `[nika host][${severity}] ${message}`);
          }
        }
      }

      return formatted;
    }

    if (payload.status === "error") {
      recordTelemetry({
        success: false,
        elapsedMs: null,
        diagnostics: undefined,
        error: payload.message ?? "Host request failed.",
        options: formatting,
        range: range ?? null,
        managedMemoryMb: null,
        workingSetMb: null,
        workingSetDeltaMb: null
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
        logLevel: process.env.NIKA_LOG_LEVEL ?? "warn"
      }
    });

    worker.once("error", (error) => {
      log("error", `[nika] Host worker error: ${formatError(error)}`);
      this.disposeWorker();
    });

    worker.once("exit", (code) => {
      log("debug", `[nika] Host worker exited with code ${code}`);
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
      log("debug", `[nika] Failed to send shutdown message to worker: ${formatError(error)}`);
    }

    this.worker.terminate().catch((error) => {
      log("debug", `[nika] Failed to terminate worker: ${formatError(error)}`);
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
    if (process.env.NIKA_STRICT_HOST === "1") {
      throw cause instanceof Error ? cause : new Error(String(cause));
    }

    if (!this.warned) {
      log("warn", `[nika] Falling back to original text: ${formatError(cause)}`);
      this.warned = true;
    }

    return source;
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
  const explicitPath = process.env.NIKA_HOST_PATH;
  if (explicitPath) {
    return createLaunchSpec(explicitPath);
  }

  const packageRoot = path.resolve(__dirname, "..");
  const repoRoot = path.resolve(packageRoot, "..", "..");
  const configurations = ["Debug", "Release"];
  const frameworks = ["net9.0", "net8.0"];
  const binaries = ["Nika.Host", "Nika.Host.dll"];

  for (const configuration of configurations) {
    for (const framework of frameworks) {
      const directory = path.join(repoRoot, "src", "Nika.Host", "bin", configuration, framework);

      for (const binary of binaries) {
        const candidate = path.join(directory, binary);
        if (existsSync(candidate)) {
          return createLaunchSpec(candidate);
        }
      }
    }
  }

  throw new Error("Unable to locate Nika host binary. Set NIKA_HOST_PATH to override detection.");
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
};

function recordTelemetry(payload: TelemetryPayload): void {
  const telemetryFile = process.env.NIKA_TELEMETRY_FILE;
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
    workingSetDeltaMb: payload.workingSetDeltaMb
  };

  try {
    appendFileSync(telemetryFile, `${JSON.stringify(entry)}\n`, { encoding: "utf8" });
  } catch (error) {
    log("debug", `[nika] telemetry write failed: ${formatError(error)}`);
  }
}

export const hostClient = new HostClient();
export const _encodeMessageForTests = encodeMessage;
export const _parseEnvelopesForTests = parseEnvelopes;
