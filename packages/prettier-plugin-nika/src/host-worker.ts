import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { parentPort, workerData } from "node:worker_threads";
import {
  errorNotificationPayloadSchema,
  formatRequestPayloadSchema,
  formatResponsePayloadSchema,
  initializeRequestPayloadSchema,
  initializeResponsePayloadSchema,
  logNotificationPayloadSchema,
  messageEnvelopeSchema,
  type MessageEnvelope
} from "./protocol";
import { createRequest, encodeMessage, type RequestEnvelope } from "./ipc";

type HostLaunchSpec = {
  command: string;
  args: string[];
};

type WorkerData = {
  spec: HostLaunchSpec;
  clientVersion: string;
  handshakeTimeoutMs: number;
  requestTimeoutMs: number;
  restartAttempts: number;
  logLevel: string;
};

type FormatRange = {
  start: number;
  end: number;
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

type WorkerMetrics = {
  elapsedMs?: number;
  parseDiagnostics?: number;
  managedMemoryMb?: number;
  workingSetMb?: number;
  workingSetDeltaMb?: number;
};

type WorkerResponsePayload =
  | {
      status: "ok";
      formatted: string;
      diagnostics?: unknown[];
      metrics?: WorkerMetrics;
    }
  | {
      status: "error";
      message?: string;
    };

type PendingRequest = {
  command: string;
  resolve: (envelope: MessageEnvelope) => void;
  reject: (error: unknown) => void;
  timer: NodeJS.Timeout;
};

type LogLevel = "debug" | "info" | "warn" | "error";

type FormattingOptions = {
  printWidth: number;
  tabWidth: number;
  useTabs: boolean;
  endOfLine: "lf" | "crlf";
};

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const data = workerData as WorkerData;
const currentLogLevel = normalizeLogLevel(data.logLevel ?? "warn");

if (!parentPort) {
  throw new Error("Host worker must have a parent port.");
}

class WorkerHostClient {
  private readonly spec: HostLaunchSpec;
  private readonly clientVersion: string;
  private readonly handshakeTimeoutMs: number;
  private readonly requestTimeoutMs: number;
  private readonly restartAttempts: number;

  private host: HostProcess | null = null;
  private isInitialized = false;
  private sessionId = randomUUID();

  constructor(input: WorkerData) {
    this.spec = input.spec;
    this.clientVersion = input.clientVersion;
    this.handshakeTimeoutMs = input.handshakeTimeoutMs;
    this.requestTimeoutMs = input.requestTimeoutMs;
    this.restartAttempts = Math.max(1, input.restartAttempts);
  }

  async format(
    source: string,
    options: FormattingOptions,
    range: FormatRange | null
  ): Promise<{ formatted: string; diagnostics: unknown[]; metrics?: WorkerMetrics }> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt < this.restartAttempts) {
      try {
        const host = await this.ensureHost();
        const normalizedOptions = normalizeFormattingOptions(options);
        const normalizedRange = normalizeRange(range, source.length);

        const formatPayload = formatRequestPayloadSchema.parse({
          filePath: null as string | null,
          content: source,
          range: normalizedRange,
          options: normalizedOptions,
          sessionId: this.sessionId,
          traceToken: randomUUID()
        });

        const formatRequest = createRequest("format", formatPayload);
        const response = await host.request(formatRequest, this.requestTimeoutMs);
        const payload = formatResponsePayloadSchema.parse(response.payload);

        if (!payload.ok) {
          const prefix = payload.errorCode ? `${payload.errorCode}: ` : "";
          throw new Error(`${prefix}${payload.message ?? "Formatting failed."}`);
        }

        const formatted = typeof payload.formatted === "string" ? payload.formatted : source;
        const diagnostics = Array.isArray(payload.diagnostics) ? payload.diagnostics : [];
        const metrics = payload.metrics ?? undefined;
        return { formatted, diagnostics, metrics };
      } catch (error) {
        lastError = error;
        attempt += 1;
        log(
          "warn",
          `[worker] Host request failed (attempt ${attempt}/${this.restartAttempts}): ${formatError(error)}`
        );
        await this.invalidateHost();
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  async dispose(): Promise<void> {
    if (!this.host) {
      return;
    }

    await this.host.dispose();
    this.host = null;
    this.isInitialized = false;
    this.sessionId = randomUUID();
  }

  private async ensureHost(): Promise<HostProcess> {
    if (!this.host) {
      this.host = new HostProcess(this.spec, this.handleNotification, this.handleExit);
    }

    await this.host.start();

    if (!this.isInitialized) {
      const initializePayload = initializeRequestPayloadSchema.parse({
        clientVersion: this.clientVersion,
        hostBinaryVersion: this.clientVersion,
        platform: `${process.platform}-${process.arch}`,
        options: {
          roslynLanguageVersion: "preview",
          msbuildSdksPath: null as string | null
        }
      });

      const initializeRequest = createRequest("initialize", initializePayload);
      const response = await this.host.request(initializeRequest, this.handshakeTimeoutMs);
      const payload = initializeResponsePayloadSchema.parse(response.payload);

      if (!payload.ok) {
        const reason = payload.reason ?? "Host refused initialize request.";
        throw new Error(reason);
      }

      this.isInitialized = true;
    }

    return this.host;
  }

  private async invalidateHost(): Promise<void> {
    if (this.host) {
      await this.host.dispose();
    }

    this.host = null;
    this.isInitialized = false;
    this.sessionId = randomUUID();
  }

  private readonly handleNotification = (envelope: MessageEnvelope): void => {
    if (envelope.command === "error") {
      const parsed = errorNotificationPayloadSchema.safeParse(envelope.payload);
      if (!parsed.success) {
        log("warn", "[worker] Received malformed error notification.");
        return;
      }

      const { severity = "recoverable", errorCode, message, details } = parsed.data;
      const prefix = errorCode ? `${errorCode}: ` : "";
      const suffix = details ? ` ${JSON.stringify(details)}` : "";
      const composed = `[nika host] ${prefix}${message}${suffix}`;

      log(severity === "fatal" ? "error" : "warn", composed);

      if (severity === "fatal") {
        const error = new Error(composed);
        this.host?.rejectAll(error);
        void this.invalidateHost();
      }

      return;
    }

    if (envelope.command === "log") {
      const parsed = logNotificationPayloadSchema.safeParse(envelope.payload);
      if (!parsed.success) {
        log("warn", "[worker] Received malformed log notification.");
        return;
      }

      const level = normalizeLogLevel(parsed.data.level ?? "info");
      const context = parsed.data.context ? ` ${JSON.stringify(parsed.data.context)}` : "";
      log(level, `[nika host] ${parsed.data.message}${context}`);
    }
  };

  private readonly handleExit = (): void => {
    this.host = null;
    this.isInitialized = false;
    this.sessionId = randomUUID();
  };
}

class HostProcess {
  private child: ChildProcessWithoutNullStreams | null = null;
  private stdoutBuffer = "";
  private readonly pending = new Map<string, PendingRequest>();

  constructor(
    private readonly spec: HostLaunchSpec,
    private readonly notificationHandler: (envelope: MessageEnvelope) => void,
    private readonly exitHandler: (code: number | null, signal: NodeJS.Signals | null) => void
  ) {}

  async start(): Promise<void> {
    if (this.child) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const child = spawn(this.spec.command, this.spec.args, {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        env: process.env
      });

      const handleError = (error: Error) => {
        child.removeListener("spawn", handleSpawn);
        reject(error);
      };

      const handleSpawn = () => {
        child.removeListener("error", handleError);
        this.child = child;
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", this.handleStdoutChunk);
        child.stderr.on("data", this.handleStderrChunk);
        child.on("exit", this.handleExitEvent);
        resolve();
      };

      child.once("error", handleError);
      child.once("spawn", handleSpawn);
    });
  }

  isRunning(): boolean {
    return this.child !== null;
  }

  async request<TPayload>(
    request: RequestEnvelope<TPayload>,
    timeoutMs: number
  ): Promise<MessageEnvelope> {
    await this.start();

    const child = this.child;
    if (!child?.stdin) {
      throw new Error("Host stdin is not available.");
    }

    const frame = encodeMessage(request);

    return new Promise<MessageEnvelope>((resolve, reject) => {
      let settled = false;

      const pending: PendingRequest = {
        command: request.command,
        resolve: () => undefined,
        reject: () => undefined,
        timer: setTimeout(() => undefined, 0)
      };

      pending.resolve = (envelope) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(pending.timer);
        this.pending.delete(request.requestId);
        resolve(envelope);
      };

      pending.reject = (error) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(pending.timer);
        this.pending.delete(request.requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      };

      clearTimeout(pending.timer);
      pending.timer = setTimeout(() => {
        pending.reject(
          new Error(`Host request '${request.command}' timed out after ${timeoutMs}ms.`)
        );
      }, timeoutMs);

      this.pending.set(request.requestId, pending);

      child.stdin.write(frame, (error) => {
        if (error) {
          pending.reject(error);
        }
      });
    });
  }

  async dispose(): Promise<void> {
    if (!this.child) {
      return;
    }

    const child = this.child;
    this.rejectAll(new Error("Host process disposed."));
    this.detachChild();

    try {
      child.stdin?.end();
    } catch (error) {
      log("debug", `[worker] Failed to close host stdin: ${formatError(error)}`);
    }

    const shouldAwaitExit = child.exitCode === null && child.signalCode === null;
    const exitPromise = shouldAwaitExit ? once(child, "exit").catch(() => undefined) : null;

    child.kill();

    if (exitPromise) {
      await exitPromise;
    }
  }

  rejectAll(error: Error): void {
    for (const requestId of [...this.pending.keys()]) {
      const pending = this.pending.get(requestId);
      if (pending) {
        pending.reject(error);
      }
    }
  }

  private readonly handleStdoutChunk = (chunk: string): void => {
    this.stdoutBuffer += chunk;

    while (true) {
      const headerEnd = this.stdoutBuffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) {
        break;
      }

      const headerBlock = this.stdoutBuffer.slice(0, headerEnd);
      const headers = headerBlock.split("\r\n");
      const contentLengthLine = headers.find((line) =>
        line.toLowerCase().startsWith("content-length")
      );
      if (!contentLengthLine) {
        log("warn", "[worker] Host emitted frame without Content-Length header.");
        this.stdoutBuffer = this.stdoutBuffer.slice(headerEnd + 4);
        continue;
      }

      const lengthValue = contentLengthLine.split(":")[1]?.trim();
      const length = Number.parseInt(lengthValue ?? "", 10);
      if (!Number.isFinite(length) || length < 0) {
        log("warn", `[worker] Host emitted invalid Content-Length '${lengthValue ?? "unknown"}'.`);
        this.stdoutBuffer = this.stdoutBuffer.slice(headerEnd + 4);
        continue;
      }

      const totalFrameLength = headerEnd + 4 + length;
      if (this.stdoutBuffer.length < totalFrameLength) {
        break;
      }

      const body = this.stdoutBuffer.slice(headerEnd + 4, totalFrameLength);
      this.stdoutBuffer = this.stdoutBuffer.slice(totalFrameLength);
      this.handleEnvelope(body);
    }
  };

  private handleEnvelope(body: string): void {
    try {
      const rawEnvelope = JSON.parse(body) as unknown;
      const envelope = messageEnvelopeSchema.parse(rawEnvelope);

      if (envelope.type === "response") {
        const requestId = envelope.requestId;
        if (!requestId) {
          log("warn", "[worker] Received response without requestId.");
          return;
        }

        const pending = this.pending.get(requestId);
        if (!pending) {
          log("warn", `[worker] No pending request for response '${requestId}'.`);
          return;
        }

        pending.resolve(envelope);
      } else if (envelope.type === "notification") {
        this.notificationHandler(envelope);
      } else {
        log("warn", `[worker] Unsupported host message type '${envelope.type}'.`);
      }
    } catch (error) {
      log("error", `[worker] Failed to process host message: ${formatError(error)}`);
    }
  }

  private readonly handleStderrChunk = (chunk: string): void => {
    const lines = chunk.trim().split(/\r?\n/);
    for (const line of lines) {
      if (line.length === 0) {
        continue;
      }

      log("debug", `[host stderr] ${line}`);
    }
  };

  private readonly handleExitEvent = (code: number | null, signal: NodeJS.Signals | null): void => {
    const description = `code=${code ?? "null"}${signal ? ` signal=${signal}` : ""}`;
    log("warn", `[worker] Host process exited: ${description}`);

    const error = new Error(`Host process exited unexpectedly (${description}).`);
    this.rejectAll(error);
    this.pending.clear();
    this.detachChild();
    this.exitHandler(code, signal);
  };

  private detachChild(): void {
    if (!this.child) {
      return;
    }

    this.child.stdout.off("data", this.handleStdoutChunk);
    this.child.stderr.off("data", this.handleStderrChunk);
    this.child.off("exit", this.handleExitEvent);
    this.child = null;
    this.stdoutBuffer = "";
  }
}

const hostClient = new WorkerHostClient(data);

parentPort.on("message", (message: WorkerMessage) => {
  void handleMessage(message);
});

async function handleMessage(message: WorkerMessage): Promise<void> {
  if (message.type === "shutdown") {
    await hostClient.dispose();
    return;
  }

  const { source, options, sharedBuffer, range } = message;
  const stateView = createSharedView(sharedBuffer);

  try {
    const result = await hostClient.format(source, options, range);
    writeResponse(stateView, 1, {
      status: "ok",
      formatted: result.formatted,
      diagnostics: result.diagnostics,
      metrics: result.metrics
    });
  } catch (error) {
    writeResponse(stateView, 2, {
      status: "error",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

function createSharedView(sharedBuffer: SharedArrayBuffer) {
  return {
    state: new Int32Array(sharedBuffer, 0, 2),
    payload: new Uint8Array(sharedBuffer, 8)
  };
}

function writeResponse(
  view: { state: Int32Array; payload: Uint8Array },
  statusCode: number,
  payload: WorkerResponsePayload
): void {
  const encoded = new TextEncoder().encode(JSON.stringify(payload));

  if (encoded.length > view.payload.length) {
    const fallback = new TextEncoder().encode(
      JSON.stringify({ status: "error", message: "Host response exceeded buffer capacity." })
    );

    const length = Math.min(fallback.length, view.payload.length);
    view.payload.set(fallback.subarray(0, length));
    Atomics.store(view.state, 1, length);
    Atomics.store(view.state, 0, 2);
    Atomics.notify(view.state, 0);
    return;
  }

  view.payload.set(encoded.subarray(0, encoded.length));
  Atomics.store(view.state, 1, encoded.length);
  Atomics.store(view.state, 0, statusCode);
  Atomics.notify(view.state, 0);
}

function normalizeFormattingOptions(options: FormattingOptions) {
  return {
    printWidth: Number.isFinite(options.printWidth) ? Math.max(40, Math.trunc(options.printWidth)) : 80,
    tabWidth: Number.isFinite(options.tabWidth) ? Math.max(1, Math.trunc(options.tabWidth)) : 4,
    useTabs: options.useTabs ?? false,
    endOfLine: options.endOfLine === "crlf" ? "crlf" : "lf"
  } as const;
}

function normalizeRange(range: FormatRange | null, sourceLength: number): FormatRange | null {
  if (!range) {
    return null;
  }

  const start = Math.max(0, Math.trunc(range.start));
  const end = Math.min(sourceLength, Math.max(start, Math.trunc(range.end)));

  if (end <= start || start === 0 && end >= sourceLength) {
    return null;
  }

  return { start, end };
}

function normalizeLogLevel(level: string): LogLevel {
  if (level in LOG_LEVEL_ORDER) {
    return level as LogLevel;
  }

  return "warn";
}

function log(level: LogLevel, message: string): void {
  if (LOG_LEVEL_ORDER[level] < LOG_LEVEL_ORDER[currentLogLevel]) {
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
