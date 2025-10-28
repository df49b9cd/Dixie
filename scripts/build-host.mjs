#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  mkdirSync,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  copyFileSync,
  writeFileSync,
  chmodSync,
  rmSync,
  createReadStream,
  createWriteStream
} from "node:fs";
import { join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = resolve(__dirname, "..");
const pluginRoot = resolve(projectRoot, "packages/prettier-plugin-csharp");
const hostProject = resolve(projectRoot, "src/Dixie.Host/Dixie.Host.csproj");

const targets = [
  { rid: "osx-arm64", output: "artifacts/osx-arm64" },
  { rid: "osx-x64", output: "artifacts/osx-x64" },
  { rid: "linux-x64", output: "artifacts/linux-x64" },
  { rid: "linux-arm64", output: "artifacts/linux-arm64" },
  { rid: "win-x64", output: "artifacts/win-x64" }
];

async function main() {
  const archiveRoot = resolve(pluginRoot, "host-archives");
  ensureCleanDir(archiveRoot);
  const pluginVersion = getPluginVersion();
  const manifest = { version: pluginVersion, binaries: {} };
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
        `-p:Version=${pluginVersion}`,
        "--output",
        outDir
      ],
      { stdio: "inherit", cwd: projectRoot }
    );
    const binaryPath = locateBinary(outDir);
    const stats = statSync(binaryPath);
    const sha = checksum(binaryPath);

    const binDir = resolve(pluginRoot, "bin", target.rid);
    ensureCleanDir(binDir);
    const destName = process.platform === "win32" && target.rid.startsWith("win") ? "dixie-host.exe" : "dixie-host";
    const destPath = join(binDir, destName);
    copyFileSync(binaryPath, destPath);
    if (!target.rid.startsWith("win")) {
      chmodSync(destPath, 0o755);
    }

    const archiveDir = resolve(archiveRoot, target.rid);
    ensureCleanDir(archiveDir);
    const archiveName = `${destName}.gz`;
    const archivePath = join(archiveDir, archiveName);
    await gzipBinary(binaryPath, archivePath);
    const archiveStats = statSync(archivePath);
    const archiveSha = checksum(archivePath);

    const manifestPath = relative(pluginRoot, destPath).replace(/\\/g, "/");
    manifest.binaries[target.rid] = {
      path: manifestPath,
      sha256: sha,
      size: stats.size,
      archivePath: relative(pluginRoot, archivePath).replace(/\\/g, "/"),
      archiveSha256: archiveSha,
      archiveSize: archiveStats.size
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
  const candidate = files.find((file) => file === "Dixie.Host" || file === "Dixie.Host.exe");
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

function ensureCleanDir(directory) {
  if (existsSync(directory)) {
    rmSync(directory, { recursive: true, force: true });
  }
  mkdirSync(directory, { recursive: true });
}

async function gzipBinary(src, dest) {
  const gzip = createGzip({ level: 9, mtime: 0 });
  await pipeline(createReadStream(src), gzip, createWriteStream(dest));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
