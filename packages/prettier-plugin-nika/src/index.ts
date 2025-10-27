import type { Plugin, Printer, SupportLanguage } from "prettier";
import { hostClient, type FormattingOptions } from "./host-client";

type NikaAst = {
  kind: "nika-placeholder";
  originalText: string;
};

const languages: SupportLanguage[] = [
  {
    name: "C#",
    parsers: ["nika-csharp"],
    extensions: [".cs"],
    linguistLanguageId: 101,
    vscodeLanguageIds: ["csharp"]
  }
];

const printer: Printer<NikaAst> = {
  print(path, options) {
    const node = path.getValue();
    if (!node) {
      return "";
    }

    const formattingOptions = resolveFormattingOptions(options);
    const range = resolveRange(node.originalText, options);
    return hostClient.format(node.originalText, formattingOptions, range);
  }
};

const plugin: Plugin<NikaAst> = {
  languages,
  parsers: {
    "nika-csharp": {
      parse(text) {
        return {
          kind: "nika-placeholder",
          originalText: text
        } satisfies NikaAst;
      },
      astFormat: "nika-csharp",
      locStart: () => 0,
      locEnd: (node) => node.originalText.length
    }
  },
  printers: {
    "nika-csharp": printer
  }
};

export default plugin;

function resolveFormattingOptions(options: Parameters<Printer<NikaAst>["print"]>[1]): FormattingOptions {
  const printWidth = typeof options.printWidth === "number" && Number.isFinite(options.printWidth)
    ? Math.max(40, Math.trunc(options.printWidth))
    : 80;

  const tabWidth = typeof options.tabWidth === "number" && Number.isFinite(options.tabWidth)
    ? Math.max(1, Math.trunc(options.tabWidth))
    : 4;

  const useTabs = Boolean(options.useTabs);
  const endOfLine = options.endOfLine === "crlf" ? "crlf" : "lf";

  return { printWidth, tabWidth, useTabs, endOfLine };
}

function resolveRange(text: string, options: Parameters<Printer<NikaAst>["print"]>[1]) {
  const rawStart = typeof options.rangeStart === "number" && Number.isFinite(options.rangeStart)
    ? Math.max(0, Math.trunc(options.rangeStart))
    : 0;

  const hasExplicitEnd = typeof options.rangeEnd === "number" && Number.isFinite(options.rangeEnd);
  const rawEnd = hasExplicitEnd ? Math.trunc(options.rangeEnd) : text.length;
  const clampedEnd = Math.min(text.length, Math.max(rawStart, rawEnd));

  if (rawStart <= 0 && (!hasExplicitEnd || clampedEnd >= text.length)) {
    return null;
  }

  if (clampedEnd <= rawStart) {
    return null;
  }

  return {
    start: rawStart,
    end: clampedEnd
  };
}
