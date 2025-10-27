import { z } from "zod";

export const ProtocolVersion = 1;

export const commandSchema = z.enum(["initialize", "format", "ping", "shutdown", "log", "error"]);

export const messageTypeSchema = z.enum(["request", "response", "notification"]);

export const initializeRequestPayloadSchema = z.object({
  clientVersion: z.string(),
  hostBinaryVersion: z.string(),
  platform: z.string(),
  options: z.object({
    roslynLanguageVersion: z.string(),
    msbuildSdksPath: z.string().nullable()
  })
});

export const initializeResponsePayloadSchema = z.object({
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

export const formatRequestPayloadSchema = z.object({
  filePath: z.string().nullable(),
  content: z.string(),
  range: z
    .object({
      start: z.number().int().nonnegative(),
      end: z.number().int().nonnegative()
    })
    .nullable(),
  options: z.object({
    printWidth: z.number().int().positive(),
    tabWidth: z.number().int().positive(),
    useTabs: z.boolean(),
    endOfLine: z.enum(["lf", "crlf"])
  }),
  sessionId: z.string(),
  traceToken: z.string().optional()
});

export const formatResponsePayloadSchema = z.object({
  ok: z.boolean(),
  formatted: z.string().optional(),
  diagnostics: z
    .array(
      z.object({
        severity: z.enum(["info", "warning", "error"]).optional(),
        message: z.string(),
        start: z.number().int().nonnegative().optional(),
        end: z.number().int().nonnegative().optional()
      })
    )
    .optional(),
  metrics: z
    .object({
      elapsedMs: z.number().nonnegative().optional(),
      parseDiagnostics: z.number().nonnegative().optional()
    })
    .optional(),
  errorCode: z.string().optional(),
  message: z.string().optional(),
  details: z.unknown().optional()
});

export const pingRequestPayloadSchema = z.object({
  timestamp: z.number().int().nonnegative().optional()
});

export const pingResponsePayloadSchema = z.object({
  ok: z.boolean(),
  timestamp: z.number().int().nonnegative(),
  uptimeMs: z.number().int().nonnegative(),
  activeRequests: z.number().int().nonnegative()
});

export const shutdownRequestPayloadSchema = z.object({
  reason: z.string().optional()
});

export const shutdownResponsePayloadSchema = z.object({
  ok: z.boolean()
});

export const errorNotificationPayloadSchema = z.object({
  severity: z.enum(["fatal", "recoverable"]).optional(),
  errorCode: z.string().optional(),
  message: z.string(),
  details: z.unknown().optional()
});

export const logNotificationPayloadSchema = z.object({
  level: z.enum(["info", "warn", "error", "debug"]),
  message: z.string(),
  traceToken: z.string().optional(),
  context: z.record(z.string(), z.unknown()).optional()
});

export const messageEnvelopeSchema = z.object({
  version: z.number(),
  type: messageTypeSchema,
  requestId: z.string().optional(),
  command: commandSchema,
  payload: z.unknown()
});

export type Command = z.infer<typeof commandSchema>;
export type MessageType = z.infer<typeof messageTypeSchema>;

export type MessageEnvelope = z.infer<typeof messageEnvelopeSchema>;
export type InitializeRequestPayload = z.infer<typeof initializeRequestPayloadSchema>;
export type InitializeResponsePayload = z.infer<typeof initializeResponsePayloadSchema>;
export type FormatRequestPayload = z.infer<typeof formatRequestPayloadSchema>;
export type FormatResponsePayload = z.infer<typeof formatResponsePayloadSchema>;
export type PingRequestPayload = z.infer<typeof pingRequestPayloadSchema>;
export type PingResponsePayload = z.infer<typeof pingResponsePayloadSchema>;
export type ShutdownRequestPayload = z.infer<typeof shutdownRequestPayloadSchema>;
export type ShutdownResponsePayload = z.infer<typeof shutdownResponsePayloadSchema>;
export type ErrorNotificationPayload = z.infer<typeof errorNotificationPayloadSchema>;
export type LogNotificationPayload = z.infer<typeof logNotificationPayloadSchema>;
