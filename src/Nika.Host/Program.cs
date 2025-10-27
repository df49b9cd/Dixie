using System;
using System.Text;
using System.Text.Json;

Console.OutputEncoding = Encoding.UTF8;

while (true)
{
    var line = Console.ReadLine();
    if (line is null)
    {
        break;
    }

    if (string.IsNullOrWhiteSpace(line))
    {
        continue;
    }

    if (string.Equals(line, "__shutdown__", StringComparison.Ordinal))
    {
        Console.WriteLine("shutting down");
        break;
    }

    try
    {
        using var doc = JsonDocument.Parse(line);
        var root = doc.RootElement;
        var command = root.GetProperty("command").GetString();

        if (string.Equals(command, "format", StringComparison.Ordinal))
        {
            var source = root.GetProperty("source").GetString() ?? string.Empty;
            var payload = JsonSerializer.Serialize(new
            {
                ok = true,
                formatted = source,
                diagnostics = Array.Empty<string>()
            });

            Console.WriteLine(payload);
        }
        else if (string.Equals(command, "ping", StringComparison.Ordinal))
        {
            var payload = JsonSerializer.Serialize(new
            {
                ok = true,
                pong = true
            });

            Console.WriteLine(payload);
        }
        else
        {
            var payload = JsonSerializer.Serialize(new
            {
                ok = false,
                error = $"Unknown command '{command}'"
            });

            Console.WriteLine(payload);
        }
    }
    catch (Exception ex)
    {
        var payload = JsonSerializer.Serialize(new
        {
            ok = false,
            error = ex.Message
        });

        Console.WriteLine(payload);
    }
}
