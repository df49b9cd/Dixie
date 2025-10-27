#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, "../fixtures");
const outputDir = path.resolve(__dirname, "../demo-output");

const timeoutMs = Number.parseInt(process.env.NIKA_DEMO_TIMEOUT_MS ?? "15000", 10);
const files = fs
  .readdirSync(fixturesDir)
  .filter((file) => file.endsWith(".cs"))
  .sort();

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const start = Date.now();
console.log(`Formatting ${files.length} fixture(s) with timeout ${timeoutMs}ms...`);

for (const file of files) {
  const sourcePath = path.join(fixturesDir, file);
  const outputPath = path.join(outputDir, file);
  const source = fs.readFileSync(sourcePath, "utf8");

  try {
    const formatted = await Promise.race([
      prettier.format(source, {
        parser: "nika-csharp",
        plugins: [path.resolve(__dirname, "../dist/index.js")],
        printWidth: 100
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);

    fs.writeFileSync(outputPath, formatted, "utf8");
    console.log(`✔ ${file}`);
  } catch (error) {
    console.error(`✖ ${file}`);
    console.error(error instanceof Error ? error.message : String(error));
  }
}

console.log(`Done in ${(Date.now() - start) / 1000}s. Output written to ${outputDir}`);
