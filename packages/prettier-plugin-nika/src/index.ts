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
    return hostClient.format(node.originalText, formattingOptions);
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
    : 2;

  const useTabs = Boolean(options.useTabs);
  const endOfLine = options.endOfLine === "crlf" ? "crlf" : "lf";

  return { printWidth, tabWidth, useTabs, endOfLine };
}
