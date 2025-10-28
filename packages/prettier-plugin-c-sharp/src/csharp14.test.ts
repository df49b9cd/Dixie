import prettier from "prettier";
import plugin from "./index";

describe("C# 14 syntax (preview)", () => {
  it("formats enhanced pattern-based code and inline lambdas", async () => {
    const source = `file static class Pipeline
{
    static readonly Func<int, int> Map = (int value = 0) => value switch
    {
        0 => 42,
        > 10 and < 100 => value * 2,
        _ => value + 1
    };

    static readonly Func<int, int> Reduce = delegate(int value)
    {
        if (value is 0)
        {
            return 0;
        }

        return value - 1;
    };

    public static int Execute(scoped Span<int> values)
    {
        var total = 0;
        foreach (var value in values)
        {
            total += Reduce(Map(value));
        }

        return total;
    }
}`;

    const result = await prettier.format(source, {
      parser: "dixie-csharp",
      plugins: [plugin],
      printWidth: 70
    });

    const expected = `file static class Pipeline
{
  static readonly Func<int, int> Map = (int value = 0) => value switch
  {
    0 => 42,
    > 10 and < 100 => value * 2,
    _ => value + 1
  };

  static readonly Func<int, int> Reduce = delegate (int value)
  {
    if (value is 0)
    {
      return 0;
    }

    return value - 1;
  };

  public static int Execute(scoped Span<int> values)
  {
    var total = 0;
    foreach (var value in values)
    {
      total += Reduce(Map(value));
    }

    return total;
  }
}`;

    expect(result.trim()).toBe(expected);
  });
});
