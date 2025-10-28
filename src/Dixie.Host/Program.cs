using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Threading;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.Formatting;
using Microsoft.CodeAnalysis.Text;
using Microsoft.CodeAnalysis.CSharp.Formatting;
using Microsoft.CodeAnalysis.Options;
using Dixie.Host;

const int ProtocolVersion = 1;
const double DefaultMemoryBudgetMb = 512;

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
                HandleInitialize(stdout, utf8WithoutBom, requestId, hostVersion, payload);
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

static void HandleInitialize(Stream stdout, Encoding encoding, string? requestId, string hostVersion, JsonElement payload)
{
    var responsePayload = new
    {
        ok = true,
        hostVersion,
        roslynLanguageVersion = "preview",
        capabilities = new
        {
            supportsRangeFormatting = true,
            supportsDiagnostics = true,
            supportsTelemetry = false
        }
    };

    SendResponse(stdout, encoding, requestId, "initialize", responsePayload);

    var clientVersion = payload.TryGetProperty("clientVersion", out var clientVersionElement)
        ? clientVersionElement.GetString()
        : null;

    var platform = payload.TryGetProperty("platform", out var platformElement)
        ? platformElement.GetString()
        : null;

    SendLogNotification(stdout, encoding, "info", "initialize completed", new
    {
        clientVersion,
        platform,
        hostVersion
    });
}

static void HandleFormat(Stream stdout, Encoding encoding, string? requestId, JsonElement payload)
{
    string content = string.Empty;
    string endOfLine = "lf";
    int tabWidth = 2;
    int printWidth = 80;
    bool useTabs = false;

    if (payload.ValueKind == JsonValueKind.Object)
    {
        if (payload.TryGetProperty("content", out var contentElement))
        {
            content = contentElement.GetString() ?? string.Empty;
        }

        if (payload.TryGetProperty("options", out var optionsElement) &&
            optionsElement.ValueKind == JsonValueKind.Object)
        {
            if (optionsElement.TryGetProperty("endOfLine", out var endOfLineElement))
            {
                endOfLine = endOfLineElement.GetString() ?? "lf";
            }

            if (optionsElement.TryGetProperty("tabWidth", out var tabWidthElement) &&
                tabWidthElement.TryGetInt32(out var parsedTabWidth))
            {
                tabWidth = Math.Clamp(parsedTabWidth, 1, 16);
            }

            if (optionsElement.TryGetProperty("printWidth", out var printWidthElement) &&
                printWidthElement.TryGetInt32(out var parsedPrintWidth))
            {
                printWidth = Math.Clamp(parsedPrintWidth, 40, 240);
            }

            if (optionsElement.TryGetProperty("useTabs", out var useTabsElement))
            {
                useTabs = useTabsElement.ValueKind == JsonValueKind.True;
            }
        }
    }

    TextSpan? range = null;
    if (payload.ValueKind == JsonValueKind.Object &&
        payload.TryGetProperty("range", out var rangeElement) &&
        rangeElement.ValueKind == JsonValueKind.Object &&
        rangeElement.TryGetProperty("start", out var rangeStartElement) &&
        rangeElement.TryGetProperty("end", out var rangeEndElement) &&
        rangeStartElement.TryGetInt32(out var rangeStart) &&
        rangeEndElement.TryGetInt32(out var rangeEnd) &&
        rangeStart >= 0 &&
        rangeEnd > rangeStart &&
        rangeEnd <= content.Length)
    {
        range = TextSpan.FromBounds(rangeStart, rangeEnd);
    }

    var requestOptions = new FormattingRequestOptions(printWidth, tabWidth, useTabs, endOfLine);
    var workingSetBeforeMb = GetWorkingSetUsageMb();
    var formatResult = FormatWithRoslyn(content, requestOptions, range);

    var workingSetAfterMb = formatResult.WorkingSetMb;
    var managedMemoryMb = formatResult.ManagedMemoryMb;
    var workingSetDeltaMb = Math.Max(0, workingSetAfterMb - workingSetBeforeMb);
    var memoryBudgetMb = GetMemoryBudgetMb();

    if (workingSetAfterMb > memoryBudgetMb)
    {
        var message = $"Host memory usage {workingSetAfterMb:F1} MB exceeded budget {memoryBudgetMb:F1} MB.";
        var details = new
        {
            managedMemoryMb = Math.Round(managedMemoryMb, 2),
            workingSetMb = Math.Round(workingSetAfterMb, 2),
            workingSetDeltaMb = Math.Round(workingSetDeltaMb, 2),
            budgetMb = Math.Round(memoryBudgetMb, 2)
        };

        SendErrorResponse(stdout, encoding, requestId, "format", "MEMORY_BUDGET_EXCEEDED", message, details);
        SendErrorNotification(stdout, encoding, "fatal", "MEMORY_BUDGET_EXCEEDED", message, details);

        GC.Collect();
        GC.WaitForPendingFinalizers();
        GC.Collect();

        var postCollectWorkingSet = GetWorkingSetUsageMb();
        if (postCollectWorkingSet > memoryBudgetMb * 0.9)
        {
            Environment.Exit(86);
        }

        return;
    }

    var responsePayload = new
    {
        ok = true,
        formatted = formatResult.FormattedText,
        diagnostics = formatResult.Diagnostics,
        metrics = new
        {
            elapsedMs = formatResult.ElapsedMilliseconds,
            parseDiagnostics = formatResult.ParseDiagnostics,
            managedMemoryMb = Math.Round(managedMemoryMb, 2),
            workingSetMb = Math.Round(workingSetAfterMb, 2),
            workingSetDeltaMb = Math.Round(workingSetDeltaMb, 2)
        }
    };

    SendResponse(stdout, encoding, requestId, "format", responsePayload);

    SendLogNotification(stdout, encoding, "debug", "format completed", new
    {
        elapsedMs = formatResult.ElapsedMilliseconds,
        originalLength = content.Length,
        normalizedLength = formatResult.FormattedText.Length,
        diagnostics = formatResult.Diagnostics.Count,
        parseDiagnostics = formatResult.ParseDiagnostics,
        managedMemoryMb = Math.Round(managedMemoryMb, 2),
        workingSetMb = Math.Round(workingSetAfterMb, 2),
        workingSetDeltaMb = Math.Round(workingSetDeltaMb, 2),
        memoryBudgetMb = Math.Round(memoryBudgetMb, 2)
    });
}

static FormatResult FormatWithRoslyn(string content, FormattingRequestOptions options, TextSpan? range)
{
    var formatStopwatch = Stopwatch.StartNew();
    var diagnostics = new List<object>();
    var newline = options.EndOfLine == "crlf" ? "\r\n" : "\n";

    using var workspace = new AdhocWorkspace();

    var parseOptions = new CSharpParseOptions(languageVersion: LanguageVersion.Preview);

    var projectId = ProjectId.CreateNewId();
    var documentId = DocumentId.CreateNewId(projectId);
    var solution = workspace.CurrentSolution
        .AddProject(projectId, "Dixie.Format", "Dixie.Format", LanguageNames.CSharp)
        .WithProjectCompilationOptions(projectId, new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary))
        .WithProjectParseOptions(projectId, parseOptions)
        .AddDocument(documentId, "dixie.cs", SourceText.From(content, Encoding.UTF8));

    var document = solution.GetDocument(documentId) ?? throw new InvalidOperationException("Failed to create Roslyn document.");

    var workspaceOptions = workspace.Options
        .WithChangedOption(FormattingOptions.UseTabs, LanguageNames.CSharp, options.UseTabs)
        .WithChangedOption(FormattingOptions.TabSize, LanguageNames.CSharp, options.TabWidth)
        .WithChangedOption(FormattingOptions.IndentationSize, LanguageNames.CSharp, options.TabWidth)
        .WithChangedOption(FormattingOptions.NewLine, LanguageNames.CSharp, newline);

    var syntaxTree = document.GetSyntaxTreeAsync(CancellationToken.None).GetAwaiter().GetResult();
    var parseDiagnostics = 0;

    if (syntaxTree is not null)
    {
        foreach (var diagnostic in syntaxTree.GetDiagnostics())
        {
            parseDiagnostics++;
            diagnostics.Add(ConvertDiagnostic(diagnostic));
        }
    }

    Document formattedDocument;
    if (range is { } span)
    {
        formattedDocument = Formatter.FormatAsync(document, span, workspaceOptions, CancellationToken.None)
            .GetAwaiter().GetResult();
    }
    else
    {
        formattedDocument = Formatter.FormatAsync(document, workspaceOptions, CancellationToken.None)
            .GetAwaiter().GetResult();
    }
    var formattedText = formattedDocument.GetTextAsync(CancellationToken.None)
        .GetAwaiter().GetResult()
        .ToString();

    formatStopwatch.Stop();
    var managedMemoryMb = GC.GetTotalMemory(false) / (1024d * 1024d);
    var workingSetMb = GetWorkingSetUsageMb();

    var todoIndex = content.IndexOf("TODO", StringComparison.Ordinal);
    if (todoIndex >= 0)
    {
        diagnostics.Add(new
        {
            severity = "warning",
            message = "TODO comment detected.",
            start = todoIndex,
            end = todoIndex + 4
        });
    }

    var normalizedText = EnsureTrailingNewline(formattedText, newline);

    return new FormatResult(
        normalizedText,
        diagnostics,
        formatStopwatch.ElapsedMilliseconds,
        parseDiagnostics,
        managedMemoryMb,
        workingSetMb);
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

static void SendErrorResponse(
    Stream stdout,
    Encoding encoding,
    string? requestId,
    string command,
    string errorCode,
    string message,
    object? details = null)
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
            message,
            details
        }
    };

    WriteMessage(stdout, encoding, envelope);
}

static void SendErrorNotification(
    Stream stdout,
    Encoding encoding,
    string severity,
    string errorCode,
    string message,
    object? details = null)
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
            message,
            details
        }
    };

    WriteMessage(stdout, encoding, envelope);
}

static void SendLogNotification(Stream stdout, Encoding encoding, string level, string message, object? context)
{
    object payload = context is null
        ? new { level, message }
        : new { level, message, context };

    var envelope = new
    {
        version = ProtocolVersion,
        type = "notification",
        command = "log",
        payload
    };

    WriteMessage(stdout, encoding, envelope);
}

static double GetMemoryBudgetMb()
{
    var value = Environment.GetEnvironmentVariable("DIXIE_HOST_MEMORY_BUDGET_MB");
    if (double.TryParse(value, out var parsed) && parsed > 0)
    {
        return parsed;
    }

    return DefaultMemoryBudgetMb;
}

static double GetWorkingSetUsageMb()
{
    using var process = Process.GetCurrentProcess();
    return process.WorkingSet64 / (1024d * 1024d);
}

static object ConvertDiagnostic(Diagnostic diagnostic)
{
    var severity = diagnostic.Severity switch
    {
        DiagnosticSeverity.Error => "error",
        DiagnosticSeverity.Warning => "warning",
        DiagnosticSeverity.Info => "info",
        DiagnosticSeverity.Hidden => "info",
        _ => "info"
    };

    var hasLocation = diagnostic.Location != Location.None && diagnostic.Location.IsInSource;
    var span = hasLocation ? diagnostic.Location.SourceSpan : default;

    return new
    {
        severity,
        message = diagnostic.GetMessage(),
        start = hasLocation ? span.Start : 0,
        end = hasLocation ? span.End : 0
    };
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

static string EnsureTrailingNewline(string text, string endOfLine)
{
    if (string.IsNullOrEmpty(text))
    {
        return endOfLine;
    }

    if (text.EndsWith(endOfLine, StringComparison.Ordinal))
    {
        return text;
    }

    if (endOfLine == "\r\n")
    {
        if (text.EndsWith("\r", StringComparison.Ordinal))
        {
            return text + "\n";
        }

        return text + endOfLine;
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
