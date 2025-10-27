using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text;
using System.Text.Json;

const int ProtocolVersion = 1;

var stdin = Console.OpenStandardInput();
var stdout = Console.OpenStandardOutput();
var utf8WithoutBom = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false);
Console.OutputEncoding = utf8WithoutBom;

var startTime = Stopwatch.StartNew();
var hostVersion = Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "0.0.0";

while (true)
{
    Dictionary<string, string>? headers;

    try
    {
        headers = ReadHeaders(stdin);
    }
    catch (Exception ex)
    {
        SendErrorNotification(stdout, utf8WithoutBom, "fatal", "INVALID_HEADERS", $"Failed to read headers: {ex.Message}");
        break;
    }

    if (headers is null)
    {
        // End of input stream.
        break;
    }

    if (!headers.TryGetValue("Content-Length", out var contentLengthValue) ||
        !int.TryParse(contentLengthValue, out var contentLength) ||
        contentLength < 0)
    {
        SendErrorResponse(stdout, utf8WithoutBom, null, "unknown", "INVALID_HEADERS", "Missing or invalid Content-Length header.");
        continue;
    }

    string body;

    try
    {
        body = ReadBody(stdin, contentLength, utf8WithoutBom);
    }
    catch (EndOfStreamException)
    {
        break;
    }
    catch (Exception ex)
    {
        SendErrorNotification(stdout, utf8WithoutBom, "fatal", "READ_FAILED", $"Failed to read body: {ex.Message}");
        break;
    }

    JsonDocument? document = null;
    string? requestId = null;
    string? command = null;

    try
    {
        document = JsonDocument.Parse(body);
        var root = document.RootElement;

        requestId = root.TryGetProperty("requestId", out var requestIdElement)
            ? requestIdElement.GetString()
            : null;

        command = root.TryGetProperty("command", out var commandElement)
            ? commandElement.GetString()
            : null;

        var messageType = root.TryGetProperty("type", out var typeElement)
            ? typeElement.GetString()
            : "request";

        if (!string.Equals(messageType, "request", StringComparison.OrdinalIgnoreCase))
        {
            SendErrorResponse(stdout, utf8WithoutBom, requestId, command ?? "unknown", "INVALID_MESSAGE", $"Unsupported message type '{messageType ?? "null"}'.");
            continue;
        }

        if (string.IsNullOrWhiteSpace(command))
        {
            SendErrorResponse(stdout, utf8WithoutBom, requestId, command ?? "unknown", "INVALID_MESSAGE", "Request missing 'command' property.");
            continue;
        }

        var payload = root.TryGetProperty("payload", out var payloadElement)
            ? payloadElement
            : default;

        switch (command)
        {
            case "initialize":
                HandleInitialize(stdout, utf8WithoutBom, requestId, hostVersion);
                break;

            case "format":
                HandleFormat(stdout, utf8WithoutBom, requestId, payload);
                break;

            case "ping":
                HandlePing(stdout, utf8WithoutBom, requestId, payload, startTime.ElapsedMilliseconds);
                break;

            case "shutdown":
                HandleShutdown(stdout, utf8WithoutBom, requestId);
                document.Dispose();
                startTime.Stop();
                return;

            default:
                SendErrorResponse(stdout, utf8WithoutBom, requestId, command, "UNKNOWN_COMMAND", $"Unknown command '{command}'.");
                break;
        }
    }
    catch (JsonException ex)
    {
        SendErrorResponse(stdout, utf8WithoutBom, requestId, command ?? "unknown", "INVALID_JSON", $"Failed to parse request JSON: {ex.Message}");
    }
    catch (Exception ex)
    {
        SendErrorNotification(stdout, utf8WithoutBom, "fatal", "INTERNAL_ERROR", ex.ToString());
        break;
    }
    finally
    {
        document?.Dispose();
    }
}

static Dictionary<string, string>? ReadHeaders(Stream stream)
{
    var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

    while (true)
    {
        var line = ReadLine(stream);
        if (line is null)
        {
            return headers.Count == 0 ? null : headers;
        }

        if (line.Length == 0)
        {
            return headers;
        }

        var separatorIndex = line.IndexOf(':');
        if (separatorIndex <= 0)
        {
            continue;
        }

        var name = line[..separatorIndex].Trim();
        var value = line[(separatorIndex + 1)..].Trim();
        headers[name] = value;
    }
}

static string? ReadLine(Stream stream)
{
    var builder = new StringBuilder();

    while (true)
    {
        var next = stream.ReadByte();
        if (next == -1)
        {
            return builder.Length == 0 ? null : builder.ToString();
        }

        if (next == '\r')
        {
            var peek = stream.ReadByte();
            if (peek == -1)
            {
                return builder.ToString();
            }

            if (peek != '\n')
            {
                builder.Append((char)next);
                builder.Append((char)peek);
                continue;
            }

            return builder.ToString();
        }

        if (next == '\n')
        {
            return builder.ToString();
        }

        builder.Append((char)next);
    }
}

static string ReadBody(Stream stream, int length, Encoding encoding)
{
    var buffer = new byte[length];
    var read = 0;

    while (read < length)
    {
        var chunk = stream.Read(buffer, read, length - read);
        if (chunk == 0)
        {
            throw new EndOfStreamException("Unexpected end of stream while reading message body.");
        }

        read += chunk;
    }

    return encoding.GetString(buffer, 0, read);
}

static void HandleInitialize(Stream stdout, Encoding encoding, string? requestId, string hostVersion)
{
    var payload = new
    {
        ok = true,
        hostVersion,
        roslynLanguageVersion = "preview",
        capabilities = new
        {
            supportsRangeFormatting = false,
            supportsDiagnostics = true,
            supportsTelemetry = false
        }
    };

    SendResponse(stdout, encoding, requestId, "initialize", payload);
}

static void HandleFormat(Stream stdout, Encoding encoding, string? requestId, JsonElement payload)
{
    string content = string.Empty;
    string endOfLine = "lf";

    if (payload.ValueKind == JsonValueKind.Object)
    {
        if (payload.TryGetProperty("content", out var contentElement))
        {
            content = contentElement.GetString() ?? string.Empty;
        }

        if (payload.TryGetProperty("options", out var optionsElement) &&
            optionsElement.ValueKind == JsonValueKind.Object &&
            optionsElement.TryGetProperty("endOfLine", out var endOfLineElement))
        {
            endOfLine = endOfLineElement.GetString() ?? "lf";
        }
    }

    var normalized = NormalizeLineEndings(content, endOfLine);
    normalized = EnsureTrailingNewline(normalized);

    var responsePayload = new
    {
        ok = true,
        formatted = normalized,
        diagnostics = Array.Empty<object>(),
        metrics = new
        {
            elapsedMs = 0,
            parseDiagnostics = 0
        }
    };

    SendResponse(stdout, encoding, requestId, "format", responsePayload);
}

static void HandlePing(Stream stdout, Encoding encoding, string? requestId, JsonElement payload, long uptimeMs)
{
    long timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    if (payload.ValueKind == JsonValueKind.Object &&
        payload.TryGetProperty("timestamp", out var timestampElement) &&
        timestampElement.ValueKind == JsonValueKind.Number &&
        timestampElement.TryGetInt64(out var providedTimestamp))
    {
        timestamp = providedTimestamp;
    }

    var responsePayload = new
    {
        ok = true,
        timestamp,
        uptimeMs,
        activeRequests = 0
    };

    SendResponse(stdout, encoding, requestId, "ping", responsePayload);
}

static void HandleShutdown(Stream stdout, Encoding encoding, string? requestId)
{
    var payload = new
    {
        ok = true
    };

    SendResponse(stdout, encoding, requestId, "shutdown", payload);
}

static void SendResponse(Stream stdout, Encoding encoding, string? requestId, string command, object payload)
{
    var envelope = new
    {
        version = ProtocolVersion,
        type = "response",
        requestId,
        command,
        payload
    };

    WriteMessage(stdout, encoding, envelope);
}

static void SendErrorResponse(Stream stdout, Encoding encoding, string? requestId, string command, string errorCode, string message)
{
    var envelope = new
    {
        version = ProtocolVersion,
        type = "response",
        requestId,
        command,
        payload = new
        {
            ok = false,
            errorCode,
            message
        }
    };

    WriteMessage(stdout, encoding, envelope);
}

static void SendErrorNotification(Stream stdout, Encoding encoding, string severity, string errorCode, string message)
{
    var envelope = new
    {
        version = ProtocolVersion,
        type = "notification",
        command = "error",
        payload = new
        {
            severity,
            errorCode,
            message
        }
    };

    WriteMessage(stdout, encoding, envelope);
}

static void WriteMessage(Stream stdout, Encoding encoding, object message)
{
    var json = JsonSerializer.Serialize(message);
    var payloadBytes = encoding.GetBytes(json);
    var header = $"Content-Length: {payloadBytes.Length}\r\n\r\n";
    var headerBytes = Encoding.ASCII.GetBytes(header);

    stdout.Write(headerBytes, 0, headerBytes.Length);
    stdout.Write(payloadBytes, 0, payloadBytes.Length);
    stdout.Flush();
}

static string NormalizeLineEndings(string text, string endOfLine)
{
    var normalized = text
        .Replace("\r\n", "\n", StringComparison.Ordinal)
        .Replace('\r', '\n');

    return endOfLine switch
    {
        "crlf" => normalized.Replace("\n", "\r\n", StringComparison.Ordinal),
        _ => normalized
    };
}

static string EnsureTrailingNewline(string text)
{
    if (string.IsNullOrEmpty(text))
    {
        return "\n";
    }

    if (text.EndsWith("\n", StringComparison.Ordinal))
    {
        return text;
    }

    if (text.EndsWith("\r", StringComparison.Ordinal))
    {
        return text + "\n";
    }

    return text + "\n";
}
