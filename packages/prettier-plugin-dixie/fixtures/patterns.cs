static class PatternSample
{
    internal static string Describe(object? value)
    {
        return value switch
        {
            null => "null",
            int { } i and > 10 => $"int:{i}",
            string { Length: > 5 } s => $"string:{s.ToUpperInvariant()}",
            { } when DateTime.TryParse(value.ToString(), out var parsed) => parsed.ToLongDateString(),
            _ => value.ToString() ?? string.Empty
        };
    }
}
