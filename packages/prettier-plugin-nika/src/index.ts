import type { Plugin, Printer, SupportLanguage } from "prettier";
import { hostClient } from "./host-client";

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
  print(path) {
    const node = path.getValue();
    if (!node) {
      return "";
    }

    return hostClient.format(node.originalText);
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
