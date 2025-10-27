import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import packageJson from "../package.json";

const PROTOCOL_VERSION = 1;
const CLIENT_VERSION =
  typeof packageJson.version === "string" ? packageJson.version : "0.0.0";

const envelopeSchema = z.object({
  version: z.number(),
  type: z.union([z.literal("response"), z.literal("notification")]),
  requestId: z.string().optional(),
  command: z.string(),
  payload: z.unknown()
});

const initializePayloadSchema = z.object({
  ok: z.boolean(),
  hostVersion: z.string().optional(),
  roslynLanguageVersion: z.string().optional(),
  capabilities: z
    .object({
      supportsRangeFormatting: z.boolean().optional(),
      supportsDiagnostics: z.boolean().optional(),
      supportsTelemetry: z.boolean().optional()
    })
    .optional(),
  reason: z.string().optional()
});

const formatPayloadSchema = z.object({
  ok: z.boolean(),
  formatted: z.string().optional(),
  diagnostics: z.array(z.unknown()).optional(),
  metrics: z.record(z.string(), z.unknown()).optional(),
  errorCode: z.string().optional(),
  message: z.string().optional(),
  details: z.unknown().optional()
});

const errorNotificationSchema = z.object({
  severity: z.enum(["fatal", "recoverable"]).optional(),
  errorCode: z.string().optional(),
  message: z.string(),
  details: z.unknown().optional()
});

type HostLaunchSpec = {
  command: string;
  args: string[];
};

type MessageEnvelope = z.infer<typeof envelopeSchema>;
export class HostClient {
  private launchSpec: HostLaunchSpec | null;
  private readonly sessionId = randomUUID();
  private warned = false;

  constructor(launchSpec?: HostLaunchSpec) {
    this.launchSpec = launchSpec ?? null;
  }

  format(source: string): string {
    let spec: HostLaunchSpec;

    try {
      spec = this.resolveLaunchSpec();
    } catch (error) {
      return this.handleFailure(source, error);
    }

    const initializeRequest = createRequest("initialize", {
      clientVersion: CLIENT_VERSION,
      hostBinaryVersion: CLIENT_VERSION,
      platform: `${process.platform}-${process.arch}`,
      options: {
        roslynLanguageVersion: "preview",
        msbuildSdksPath: null as string | null
      }
    });

    const formatRequest = createRequest("format", {
      filePath: null as string | null,
      content: source,
      range: null as { start: number; end: number } | null,
      options: defaultFormattingOptions(),
      sessionId: this.sessionId,
      traceToken: randomUUID()
    });

    const shutdownRequest = createRequest("shutdown", {
      reason: "request-complete"
    });

    const input = [
      encodeMessage(initializeRequest),
      encodeMessage(formatRequest),
      encodeMessage(shutdownRequest)
    ].join("");

    let result: SpawnSyncReturns<string>;

    try {
      result = spawnSync(spec.command, spec.args, {
        input,
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024
      });
    } catch (error) {
      return this.handleFailure(source, error);
    }

    if (result.error) {
      return this.handleFailure(source, result.error);
    }

    if (result.status !== null && result.status !== 0) {
      const message = `Host exited with code ${result.status}${result.signal ? ` (signal ${result.signal})` : ""}.`;
      return this.handleFailure(source, new Error(message));
    }

    if (typeof result.stdout !== "string") {
      return this.handleFailure(source, new Error("Host produced no output."));
    }

    try {
      const envelopes = parseEnvelopes(result.stdout);
      this.validateInitializeResponse(envelopes, initializeRequest.requestId);
      this.inspectNotifications(envelopes);

      const formatResponse = envelopes.find(
        (message) =>
          message.type === "response" &&
          message.command === "format" &&
          message.requestId === formatRequest.requestId
      );

      if (!formatResponse) {
        throw new Error("Host did not return a format response.");
      }

      const payload = formatPayloadSchema.parse(formatResponse.payload);

      if (!payload.ok) {
        const label = payload.errorCode ? `${payload.errorCode}: ` : "";
        throw new Error(`${label}${payload.message ?? "Formatting failed."}`);
      }

      return typeof payload.formatted === "string" ? payload.formatted : source;
    } catch (error) {
      return this.handleFailure(source, error);
    }
  }

  private resolveLaunchSpec(): HostLaunchSpec {
    if (this.launchSpec) {
      return this.launchSpec;
    }

    this.launchSpec = resolveHostLaunchSpec();
    return this.launchSpec;
  }

  private validateInitializeResponse(
    envelopes: MessageEnvelope[],
    requestId: string
  ): void {
    const response = envelopes.find(
      (message) =>
        message.type === "response" &&
        message.command === "initialize" &&
        message.requestId === requestId
    );

    if (!response) {
      throw new Error("Host did not respond to initialize request.");
    }

    const payload = initializePayloadSchema.parse(response.payload);
    if (!payload.ok) {
      const reason = payload.reason ?? "No reason provided.";
      throw new Error(`Host rejected initialize request. ${reason}`);
    }
  }

  private inspectNotifications(envelopes: MessageEnvelope[]): void {
    const errorNotifications = envelopes.filter(
      (message) => message.type === "notification" && message.command === "error"
    );

    for (const notification of errorNotifications) {
      const parsed = errorNotificationSchema.safeParse(notification.payload);
      if (!parsed.success) {
        continue;
      }

      const { severity = "recoverable", errorCode, message } = parsed.data;
      const label = errorCode ? `${errorCode}: ` : "";
      const composed = `[nika host] ${label}${message}`;

      if (severity === "fatal") {
        throw new Error(composed);
      }

      if (process.env.NIKA_LOG_LEVEL === "debug") {
        console.warn(composed);
      }
    }
  }

  private handleFailure(source: string, cause: unknown): string {
    if (process.env.NIKA_STRICT_HOST === "1") {
      throw cause instanceof Error ? cause : new Error(String(cause));
    }

    if (!this.warned) {
      const message = cause instanceof Error ? cause.message : String(cause);
      console.warn(`[nika] Falling back to original text: ${message}`);
      this.warned = true;
    }

    return source;
  }
}

export const hostClient = new HostClient();

function createRequest<TPayload>(command: string, payload: TPayload) {
  return {
    version: PROTOCOL_VERSION,
    type: "request" as const,
    requestId: randomUUID(),
    command,
    payload
  };
}

function defaultFormattingOptions() {
  return {
    printWidth: 80,
    tabWidth: 2,
    useTabs: false,
    endOfLine: "lf" as const
  };
}

function encodeMessage(message: {
  version: number;
  type: "request";
  requestId: string;
  command: string;
  payload: unknown;
}) {
  const json = JSON.stringify(message);
  const bytes = Buffer.byteLength(json, "utf8");
  return `Content-Length: ${bytes}\r\n\r\n${json}`;
}

function parseEnvelopes(output: string): MessageEnvelope[] {
  const envelopes: MessageEnvelope[] = [];
  let cursor = 0;

  while (cursor < output.length) {
    const headerEnd = output.indexOf("\r\n\r\n", cursor);
    if (headerEnd === -1) {
      break;
    }

    const headerBlock = output.slice(cursor, headerEnd);
    const headers = headerBlock.split("\r\n");
    const contentLengthLine = headers.find((line) =>
      line.toLowerCase().startsWith("content-length")
    );

    if (!contentLengthLine) {
      break;
    }

    const value = contentLengthLine.split(":")[1];
    const length = Number.parseInt(value?.trim() ?? "", 10);

    if (!Number.isFinite(length) || length < 0) {
      break;
    }

    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;

    if (bodyEnd > output.length) {
      break;
    }

    const body = output.slice(bodyStart, bodyEnd);
    const envelope = JSON.parse(body);
    envelopes.push(envelopeSchema.parse(envelope));

    cursor = bodyEnd;

    while (
      cursor < output.length &&
      (output[cursor] === "\r" || output[cursor] === "\n")
    ) {
      cursor += 1;
    }
  }

  return envelopes;
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
      const directory = path.join(
        repoRoot,
        "src",
        "Nika.Host",
        "bin",
        configuration,
        framework
      );

      for (const binary of binaries) {
        const candidate = path.join(directory, binary);
        if (existsSync(candidate)) {
          return createLaunchSpec(candidate);
        }
      }
    }
  }

  throw new Error(
    "Unable to locate Nika host binary. Set NIKA_HOST_PATH to override detection."
  );
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
