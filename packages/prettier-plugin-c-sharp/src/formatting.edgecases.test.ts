import prettier from "prettier";
import plugin from "./index";

describe("Formatting edge cases", () => {
  it("formats nested interpolated strings and switch expressions", async () => {
    const source = `namespace Formatting;

public static class InterpolatedStrings {
    public static string BuildMessage(string name, int count){
        return $"Hello, {name ?? "unknown"}, you have {count switch { 0 => "no", 1 => "one", _ => count.ToString() }} notifications.";
    }
}
`;

    const result = await prettier.format(source, {
      parser: "dixie-csharp",
      plugins: [plugin],
      printWidth: 100
    });

    const expected = `namespace Formatting;

public static class InterpolatedStrings
{
  public static string BuildMessage(string name, int count)
  {
    return $"Hello, {name ?? "unknown"}, you have {count switch { 0 => "no", 1 => "one", _ => count.ToString() }} notifications.";
  }
}
`;

    expect(result).toBe(expected);
  });

  it("preserves preprocessor directive indentation and accessibility modifiers", async () => {
    const source = `#nullable enable
public partial class Demo{
#if DEBUG
    internal void Trace(){
        System.Console.WriteLine("debug");
    }
#endif
}
`;

    const result = await prettier.format(source, {
      parser: "dixie-csharp",
      plugins: [plugin],
      printWidth: 80
    });

const expected = `#nullable enable
public partial class Demo
{
#if DEBUG
    internal void Trace(){
        System.Console.WriteLine("debug");
    }
#endif
}
`;

    expect(result).toBe(expected);
  });
});
