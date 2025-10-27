import fs from "node:fs";
import path from "node:path";
import prettier from "prettier";
import plugin from "./index";

const fixturesDir = path.resolve(__dirname, "../fixtures");

const fixtureFiles = fs
  .readdirSync(fixturesDir)
  .filter((file) => file.endsWith(".cs"))
  .sort();

const expectedOutputs: Record<string, string> = {
  "class.cs": `class Greeter
{
  private readonly string _name;

  public Greeter(string name)
  {
    _name = name;
  }

  public string SayHello()
  {
    return $"Hello, {_name}!";
  }
}
`,
  "patterns.cs": `static class PatternSample
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
`
};

describe("fixtures", () => {
  for (const file of fixtureFiles) {
    it(`formats ${file} deterministically`, async () => {
      const source = fs.readFileSync(path.join(fixturesDir, file), "utf8");
      const result = await prettier.format(source, {
        parser: "nika-csharp",
        plugins: [plugin],
        printWidth: 100
      });

      expect(result).toBe(expectedOutputs[file]);
    });
  }
});
