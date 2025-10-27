import prettier from "prettier";
import plugin from "./index";

describe("prettier-plugin-nika", () => {
  it("returns the original text until Roslyn host integration is ready", async () => {
    const source = "class Foo { }";
    const output = await prettier.format(source, {
      parser: "nika-csharp",
      plugins: [plugin]
    });

    expect(output.trim()).toBe(source);
  });
});
