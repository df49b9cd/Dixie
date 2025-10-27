#!/usr/bin/env node
import { mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = resolve(__dirname, "..");
const hostProject = resolve(projectRoot, "src/Nika.Host/Nika.Host.csproj");

const targets = [
  { rid: "osx-arm64", output: "artifacts/osx-arm64" },
  { rid: "osx-x64", output: "artifacts/osx-x64" },
  { rid: "linux-x64", output: "artifacts/linux-x64" },
  { rid: "linux-arm64", output: "artifacts/linux-arm64" },
  { rid: "win-x64", output: "artifacts/win-x64" }
];

async function main() {
  for (const target of targets) {
    const outDir = resolve(projectRoot, target.output);
    if (!existsSync(outDir)) {
      mkdirSync(outDir, { recursive: true });
    }

    console.log(`Publishing ${target.rid} -> ${outDir}`);
    await execa(
      "dotnet",
      [
        "publish",
        hostProject,
        "-c",
        "Release",
        "-r",
        target.rid,
        "--self-contained",
        "true",
        "-p:PublishSingleFile=true",
        "-p:PublishReadyToRun=true",
        "-p:InvariantGlobalization=true",
        "--output",
        outDir
      ],
      { stdio: "inherit", cwd: projectRoot }
    );
  }

  console.log("Host artifacts ready under ./artifacts");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
