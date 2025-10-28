import prettier from "prettier";
import plugin from "./index";

describe("prettier-plugin-c-sharp", () => {
  it("returns the original text until Roslyn host integration is ready", async () => {
    const source = "class Foo { }";
    const output = await prettier.format(source, {
      parser: "dixie-csharp",
      plugins: [plugin]
    });

    expect(output.trim()).toBe(source);
  });
});
