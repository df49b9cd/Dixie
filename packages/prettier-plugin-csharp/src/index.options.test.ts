import { describe, expect, it } from "vitest";
import { __testing } from "./index";

const { resolveFormattingOptions, resolveRange } = __testing;
type PrinterOptions = Parameters<typeof resolveRange>[1];

const makePrinterOptions = (overrides: Partial<PrinterOptions> = {}): PrinterOptions => ({
  printWidth: 80,
  tabWidth: 2,
  useTabs: false,
  endOfLine: "lf",
  ...overrides
});

describe("resolveFormattingOptions", () => {
  it("clamps non-positive widths to safe defaults", () => {
    const options = resolveFormattingOptions(makePrinterOptions({ printWidth: -10, tabWidth: 0 }));

    expect(options.printWidth).toBe(40);
    expect(options.tabWidth).toBe(1);
  });

  it("coerces large values by truncating", () => {
    const options = resolveFormattingOptions(
      makePrinterOptions({ printWidth: 120.75, tabWidth: 2.9, useTabs: true, endOfLine: "crlf" })
    );

    expect(options.printWidth).toBe(120);
    expect(options.tabWidth).toBe(2);
    expect(options.endOfLine).toBe("crlf");
  });
});

describe("resolveRange", () => {
  it("returns null when the provided range covers the full document", () => {
    const result = resolveRange("abcd", makePrinterOptions({ rangeStart: 0, rangeEnd: 4 }));

    expect(result).toBeNull();
  });

  it("clamps the end of the requested range to the document boundary", () => {
    const result = resolveRange("abcd", makePrinterOptions({ rangeStart: 2, rangeEnd: 10 }));

    expect(result).toEqual({ start: 2, end: 4 });
  });

  it("returns null when rangeEnd is before rangeStart", () => {
    const result = resolveRange("abcd", makePrinterOptions({ rangeStart: 3, rangeEnd: 2 }));

    expect(result).toBeNull();
  });

  it("returns null when both range boundaries are missing", () => {
    const result = resolveRange("abcd", makePrinterOptions());

    expect(result).toBeNull();
  });
});
