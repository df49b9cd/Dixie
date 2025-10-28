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
  "attributes.cs": `using System;
using System.Collections.Generic;

[Flags]
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Struct)]
public sealed class SampleAttribute : Attribute
{
  public SampleAttribute(string name, int value = 0)
  {
    Name = name;
    Value = value;
  }

  public string Name { get; }

  public int Value { get; }
}

[Sample("demo", Value = 10)]
public sealed class Annotated
{
  public Annotated(string name, params int[] items)
  {
    Name = name?.Trim() ?? throw new ArgumentNullException(nameof(name));
    Items = items ?? Array.Empty<int>();
  }

  public string Name { get; }

  public IReadOnlyList<int> Items { get; }
}
`,
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
        parser: "dixie-csharp",
        plugins: [plugin],
        printWidth: 100
      });

      expect(result).toBe(expectedOutputs[file]);
    });
  }
});
