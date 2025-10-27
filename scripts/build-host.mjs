#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, existsSync, readdirSync, readFileSync, statSync, copyFileSync, writeFileSync, chmodSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = resolve(__dirname, "..");
const pluginRoot = resolve(projectRoot, "packages/prettier-plugin-nika");
const hostProject = resolve(projectRoot, "src/Nika.Host/Nika.Host.csproj");

const targets = [
  { rid: "osx-arm64", output: "artifacts/osx-arm64" },
  { rid: "osx-x64", output: "artifacts/osx-x64" },
  { rid: "linux-x64", output: "artifacts/linux-x64" },
  { rid: "linux-arm64", output: "artifacts/linux-arm64" },
  { rid: "win-x64", output: "artifacts/win-x64" }
];

async function main() {
  const manifest = { version: getPluginVersion(), binaries: {} };
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
    const binaryPath = locateBinary(outDir);
    const stats = statSync(binaryPath);
    const sha = checksum(binaryPath);

    const binDir = resolve(pluginRoot, "bin", target.rid);
    mkdirSync(binDir, { recursive: true });
    const destName = process.platform === "win32" && target.rid.startsWith("win") ? "nika-host.exe" : "nika-host";
    const destPath = join(binDir, destName);
    copyFileSync(binaryPath, destPath);
    if (!target.rid.startsWith("win")) {
      chmodSync(destPath, 0o755);
    }

    const manifestPath = relative(pluginRoot, destPath).replace(/\\/g, "/");
    manifest.binaries[target.rid] = {
      path: manifestPath,
      sha256: sha,
      size: stats.size
    };
  }

  const manifestFile = join(pluginRoot, "manifest.json");
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");

  console.log("Host artifacts ready under ./artifacts and bin/. Manifest updated.");
}

function getPluginVersion() {
  const pkg = JSON.parse(readFileSync(join(pluginRoot, "package.json"), "utf8"));
  return pkg.version;
}

function locateBinary(directory) {
  const files = readdirSync(directory);
  const candidate = files.find((file) => file === "Nika.Host" || file === "Nika.Host.exe");
  if (!candidate) {
    throw new Error(`Could not locate host binary in ${directory}`);
  }
  return join(directory, candidate);
}

function checksum(filePath) {
  const hash = createHash("sha256");
  hash.update(readFileSync(filePath));
  return hash.digest("hex");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
