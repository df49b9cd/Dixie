import prettier from "prettier";
import plugin from "./index";

describe("C# modern syntax", () => {
  it("formats raw strings, primary constructors, and collection expressions", async () => {
    const source = `file class Person(string Name,int Age)
{
    private readonly string _name = Name;

    string Describe()
    {
        var raw = """\n            line1\n            line2\n            """;
        var numbers = [1,2,3,4];
        var result = numbers switch
        {
            [1, .. var rest] => rest.Count,
            _ => 0
        };
        return $"{_name}:{result}";
    }

#if DEBUG
    [System.Obsolete]
    string DebugInfo()=> $"{_name}:{Age}";
#endif
}`;

    const result = await prettier.format(source, {
      parser: "dixie-csharp",
      plugins: [plugin],
      printWidth: 60
    });

    const expected = `file class Person(string Name, int Age)
{
  private readonly string _name = Name;

  string Describe()
  {
    var raw = """
            line1
            line2
            """;
    var numbers = [1, 2, 3, 4];
    var result = numbers switch
    {
    [1, .. var rest] => rest.Count,
      _ => 0
    };
    return $"{_name}:{result}";
  }

#if DEBUG
    [System.Obsolete]
    string DebugInfo()=> $"{_name}:{Age}";
#endif
}`;

    expect(result.trim()).toBe(expected);
  });
});
