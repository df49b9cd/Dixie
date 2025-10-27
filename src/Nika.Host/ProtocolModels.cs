using System.Text.Json;
using System.Text.Json.Serialization;

namespace Nika.Host;

public static class ProtocolModels
{
    public const int Version = 1;

    public sealed record MessageEnvelope(
        [property: JsonPropertyName("version")] int Version,
        [property: JsonPropertyName("type")] string Type,
        [property: JsonPropertyName("requestId")] string? RequestId,
        [property: JsonPropertyName("command")] string Command,
        [property: JsonPropertyName("payload")] JsonElement Payload
    );

    public sealed record InitializeRequestPayload(
        [property: JsonPropertyName("clientVersion")] string ClientVersion,
        [property: JsonPropertyName("hostBinaryVersion")] string HostBinaryVersion,
        [property: JsonPropertyName("platform")] string Platform,
        [property: JsonPropertyName("options")] InitializeOptions Options
    );

    public sealed record InitializeOptions(
        [property: JsonPropertyName("roslynLanguageVersion")] string RoslynLanguageVersion,
        [property: JsonPropertyName("msbuildSdksPath")] string? MsbuildSdksPath
    );

    public sealed record InitializeResponsePayload(
        [property: JsonPropertyName("ok")] bool Ok,
        [property: JsonPropertyName("hostVersion")] string? HostVersion,
        [property: JsonPropertyName("roslynLanguageVersion")] string? RoslynLanguageVersion,
        [property: JsonPropertyName("capabilities")] HostCapabilities? Capabilities,
        [property: JsonPropertyName("reason")] string? Reason
    );

    public sealed record HostCapabilities(
        [property: JsonPropertyName("supportsRangeFormatting")] bool? SupportsRangeFormatting,
        [property: JsonPropertyName("supportsDiagnostics")] bool? SupportsDiagnostics,
        [property: JsonPropertyName("supportsTelemetry")] bool? SupportsTelemetry
    );

    public sealed record FormatRequestPayload(
        [property: JsonPropertyName("filePath")] string? FilePath,
        [property: JsonPropertyName("content")] string Content,
        [property: JsonPropertyName("range")] FormatRange? Range,
        [property: JsonPropertyName("options")] FormatOptions Options,
        [property: JsonPropertyName("sessionId")] string SessionId,
        [property: JsonPropertyName("traceToken")] string? TraceToken
    );

    public sealed record FormatRange(
        [property: JsonPropertyName("start")] int Start,
        [property: JsonPropertyName("end")] int End
    );

    public sealed record FormatOptions(
        [property: JsonPropertyName("printWidth")] int PrintWidth,
        [property: JsonPropertyName("tabWidth")] int TabWidth,
        [property: JsonPropertyName("useTabs")] bool UseTabs,
        [property: JsonPropertyName("endOfLine")] string EndOfLine
    );

    public sealed record FormatResponsePayload(
        [property: JsonPropertyName("ok")] bool Ok,
        [property: JsonPropertyName("formatted")] string? Formatted,
        [property: JsonPropertyName("diagnostics")] IReadOnlyList<DiagnosticPayload>? Diagnostics,
        [property: JsonPropertyName("metrics")] FormatMetrics? Metrics,
        [property: JsonPropertyName("errorCode")] string? ErrorCode,
        [property: JsonPropertyName("message")] string? Message,
        [property: JsonPropertyName("details")] JsonElement? Details
    );

    public sealed record DiagnosticPayload(
        [property: JsonPropertyName("severity")] string? Severity,
        [property: JsonPropertyName("message")] string Message,
        [property: JsonPropertyName("start")] int? Start,
        [property: JsonPropertyName("end")] int? End
    );

    public sealed record FormatMetrics(
        [property: JsonPropertyName("elapsedMs")] long? ElapsedMs,
        [property: JsonPropertyName("parseDiagnostics")] int? ParseDiagnostics
    );

    public sealed record PingRequestPayload(
        [property: JsonPropertyName("timestamp")] long? Timestamp
    );

    public sealed record PingResponsePayload(
        [property: JsonPropertyName("ok")] bool Ok,
        [property: JsonPropertyName("timestamp")] long Timestamp,
        [property: JsonPropertyName("uptimeMs")] long UptimeMs,
        [property: JsonPropertyName("activeRequests")] int ActiveRequests
    );

    public sealed record ShutdownRequestPayload(
        [property: JsonPropertyName("reason")] string? Reason
    );

    public sealed record ShutdownResponsePayload(
        [property: JsonPropertyName("ok")] bool Ok
    );

    public sealed record ErrorNotificationPayload(
        [property: JsonPropertyName("severity")] string? Severity,
        [property: JsonPropertyName("errorCode")] string? ErrorCode,
        [property: JsonPropertyName("message")] string Message,
        [property: JsonPropertyName("details")] JsonElement? Details
    );

    public sealed record LogNotificationPayload(
        [property: JsonPropertyName("level")] string Level,
        [property: JsonPropertyName("message")] string Message,
        [property: JsonPropertyName("traceToken")] string? TraceToken,
        [property: JsonPropertyName("context")] JsonElement? Context
    );
}
