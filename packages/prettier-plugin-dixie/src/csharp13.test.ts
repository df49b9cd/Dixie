import prettier from "prettier";
import plugin from "./index";

describe("C# 13 syntax", () => {
  it("formats partial properties and params spans", async () => {
    const source = `class Aggregator
{
    public static int Sum(params ReadOnlySpan<int> values)
    {
        var total = 0;
        foreach (var value in values)
        {
            total += value;
        }
        return total;
    }
}

partial class Person
{
    partial string DisplayName { get; set; }
}

partial class Person
{
    private string? _displayName;
    partial string DisplayName
    {
        get => _displayName ??= "unknown";
        set => _displayName = value.Trim();
    }
}`;

    const result = await prettier.format(source, {
      parser: "dixie-csharp",
      plugins: [plugin],
      printWidth: 80
    });

    const expected = `class Aggregator
{
  public static int Sum(params ReadOnlySpan<int> values)
  {
    var total = 0;
    foreach (var value in values)
    {
      total += value;
    }
    return total;
  }
}

partial class Person
{
  partial string DisplayName { get; set; }
}

partial class Person
{
  private string? _displayName;
  partial string DisplayName
  {
    get => _displayName ??= "unknown";
    set => _displayName = value.Trim();
  }
}`;

    expect(result.trim()).toBe(expected);
  });
});
