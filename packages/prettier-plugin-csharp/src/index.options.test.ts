import { describe, expect, it } from "vitest";
import plugin, { __testing } from "./index";

const { resolveFormattingOptions, resolveRange } = __testing;

describe("resolveFormattingOptions", () => {
  it("clamps non-positive widths to safe defaults", () => {
    const options = resolveFormattingOptions({
      printWidth: -10,
      tabWidth: 0,
      useTabs: false,
      endOfLine: "lf"
    } as Parameters<(typeof plugin)["printers"]["dixie-csharp"]["print"]>[1]);

    expect(options.printWidth).toBe(40);
    expect(options.tabWidth).toBe(1);
  });

  it("coerces large values by truncating", () => {
    const options = resolveFormattingOptions({
      printWidth: 120.75,
      tabWidth: 2.9,
      useTabs: true,
      endOfLine: "crlf"
    } as Parameters<(typeof plugin)["printers"]["dixie-csharp"]["print"]>[1]);

    expect(options.printWidth).toBe(120);
    expect(options.tabWidth).toBe(2);
    expect(options.endOfLine).toBe("crlf");
  });
});

describe("resolveRange", () => {
  const printerOptions = {
    printWidth: 80,
    tabWidth: 2,
    useTabs: false,
    endOfLine: "lf" as const
  };

  it("returns null when the provided range covers the full document", () => {
    const result = resolveRange("abcd", {
      ...printerOptions,
      rangeStart: 0,
      rangeEnd: 4
    } as Parameters<(typeof plugin)["printers"]["dixie-csharp"]["print"]>[1]);

    expect(result).toBeNull();
  });

  it("clamps the end of the requested range to the document boundary", () => {
    const result = resolveRange("abcd", {
      ...printerOptions,
      rangeStart: 2,
      rangeEnd: 10
    } as Parameters<(typeof plugin)["printers"]["dixie-csharp"]["print"]>[1]);

    expect(result).toEqual({ start: 2, end: 4 });
  });

  it("returns null when rangeEnd is before rangeStart", () => {
    const result = resolveRange("abcd", {
      ...printerOptions,
      rangeStart: 3,
      rangeEnd: 2
    } as Parameters<(typeof plugin)["printers"]["dixie-csharp"]["print"]>[1]);

    expect(result).toBeNull();
  });

  it("returns null when both range boundaries are missing", () => {
    const result = resolveRange("abcd", {
      ...printerOptions,
      rangeStart: undefined,
      rangeEnd: undefined
    } as Parameters<(typeof plugin)["printers"]["dixie-csharp"]["print"]>[1]);

    expect(result).toBeNull();
  });
});
