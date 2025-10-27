#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, createReadStream } from "node:fs";
import { chmodSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execa } from "execa";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const manifestPath = path.join(packageRoot, "manifest.json");

const hostPlatformMap = {
  darwin: process.arch === "arm64" ? "darwin-arm64" : "darwin-x64",
  linux: process.arch === "arm64" ? "linux-arm64" : "linux-x64",
  win32: "win-x64"
};

async function main() {
  const platformKey = hostPlatformMap[process.platform];
  if (!platformKey) {
    console.warn(`[nika] Unsupported platform ${process.platform}; skipping host download.`);
    return;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const entry = manifest.binaries?.[platformKey];
  if (!entry) {
    console.warn(`[nika] No manifest entry for ${platformKey}; install the host manually (set NIKA_HOST_PATH).`);
    return;
  }

  const hostPath = path.join(packageRoot, entry.path);
  if (await verifyChecksum(hostPath, entry.sha256)) {
    console.log(`[nika] Host binary already present for ${platformKey}.`);
    return;
  }

  const cacheHome = path.join(
    process.env.NIKA_HOST_CACHE ?? path.join(process.env.HOME ?? process.cwd(), ".cache/nika"),
    manifest.version,
    platformKey
  );
  const cachedPath = path.join(cacheHome, path.basename(entry.path));

  if (await verifyChecksum(cachedPath, entry.sha256)) {
    copyFile(cachedPath, hostPath);
    return;
  }

  if (!entry.url) {
    console.warn(`[nika] Host binary is missing and manifest lacks download url. Run npm run build:host.`);
    return;
  }

  mkdirSync(cacheHome, { recursive: true });
  console.log(`[nika] Downloading host from ${entry.url}`);
  const { stdout } = await execa("curl", ["-sSL", entry.url, "-o", cachedPath]);
  if (stdout) {
    console.log(stdout);
  }

  if (!(await verifyChecksum(cachedPath, entry.sha256))) {
    throw new Error(`[nika] Downloaded binary failed checksum for ${platformKey}.`);
  }

  copyFile(cachedPath, hostPath);
}

async function verifyChecksum(filePath, expected) {
  if (!filePath || !existsSync(filePath)) {
    return false;
  }

  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  const digest = hash.digest("hex");
  return digest === expected;
}

function copyFile(src, dest) {
  mkdirSync(path.dirname(dest), { recursive: true });
  const data = readFileSync(src);
  writeFileSync(dest, data, { mode: 0o755 });
  chmodSync(dest, 0o755);
  console.log(`[nika] Host ready at ${dest}`);
}

main().catch((error) => {
  console.warn(`[nika] postinstall warning: ${error instanceof Error ? error.message : String(error)}`);
});
