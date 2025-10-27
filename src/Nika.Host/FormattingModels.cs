using System.Collections.Generic;

namespace Nika.Host;

internal readonly record struct FormattingRequestOptions(int PrintWidth, int TabWidth, bool UseTabs, string EndOfLine);

internal sealed record FormatResult(string FormattedText, List<object> Diagnostics, long ElapsedMilliseconds, int ParseDiagnostics);
