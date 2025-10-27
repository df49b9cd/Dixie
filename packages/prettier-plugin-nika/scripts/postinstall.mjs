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
  darwin: process.arch === "arm64" ? "osx-arm64" : "osx-x64",
  linux: process.arch === "arm64" ? "linux-arm64" : "linux-x64",
  win32: "win-x64"
};

const PROTOCOL_VERSION = 1;
const SMOKE_TEST_TIMEOUT_MS = 8_000;
const SMOKE_TEST_SHUTDOWN_TIMEOUT_MS = 4_000;

async function main() {
  const platformKey = hostPlatformMap[process.platform];
  if (!platformKey) {
    console.warn(`[nika] Unsupported platform ${process.platform}; skipping host download.`);
    return;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const manifestVersion =
    typeof manifest.version === "string" ? manifest.version : String(manifest.version ?? "0.0.0");
  const entry = manifest.binaries?.[platformKey];
  if (!entry) {
    console.warn(`[nika] No manifest entry for ${platformKey}; install the host manually (set NIKA_HOST_PATH).`);
    return;
  }

  const hostPath = path.join(packageRoot, entry.path);
  let hostReady = false;

  if (await verifyChecksum(hostPath, entry.sha256)) {
    console.log(`[nika] Host binary already present for ${platformKey}.`);
    hostReady = true;
  }

  const cacheHome = path.join(
    process.env.NIKA_HOST_CACHE ?? path.join(process.env.HOME ?? process.cwd(), ".cache/nika"),
    manifestVersion,
    platformKey
  );
  const cachedPath = path.join(cacheHome, path.basename(entry.path));

  if (!hostReady) {
    if (await verifyChecksum(cachedPath, entry.sha256)) {
      copyFile(cachedPath, hostPath);
      hostReady = await verifyChecksum(hostPath, entry.sha256);
    } else {
      if (!entry.url) {
        console.warn(
          `[nika] Host binary is missing and manifest lacks download url. Run npm run build:host.`
        );
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
      hostReady = await verifyChecksum(hostPath, entry.sha256);
    }
  }

  if (!hostReady) {
    console.warn(`[nika] Unable to prepare host binary for ${platformKey}; skipping smoke test.`);
    return;
  }

  await runSmokeTest(hostPath, manifestVersion, platformKey);
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

async function runSmokeTest(hostPath, manifestVersion, platformKey) {
  let child;

  try {
    console.log(`[nika] Running host smoke test for ${platformKey}.`);
    child = execa(hostPath, [], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      windowsHide: true,
      reject: false
    });

    const { stdin, stdout, stderr } = child;
    if (!stdin || !stdout) {
      throw new Error("Host process failed to expose stdio streams.");
    }

    stdout.setEncoding("utf8");
    stderr?.setEncoding("utf8");
    if (process.env.NIKA_POSTINSTALL_DEBUG === "1") {
      stderr?.on("data", (chunk) => {
        process.stderr.write(`[nika host stderr] ${chunk}`);
      });
    }

    const initializeRequestId = `postinstall-init-${Date.now()}`;
    const initializePayload = {
      clientVersion: manifestVersion,
      hostBinaryVersion: manifestVersion,
      platform: `${process.platform}-${process.arch}`,
      options: {
        roslynLanguageVersion: "preview",
        msbuildSdksPath: null
      }
    };

    await writeEnvelope(stdin, {
      version: PROTOCOL_VERSION,
      type: "request",
      requestId: initializeRequestId,
      command: "initialize",
      payload: initializePayload
    });

    const initializeResponse = await waitForResponse(
      child,
      initializeRequestId,
      "initialize",
      SMOKE_TEST_TIMEOUT_MS
    );

    const payload = initializeResponse.payload ?? {};
    if (!payload.ok) {
      const reason = payload.reason ?? payload.message ?? "Host refused initialization.";
      throw new Error(reason);
    }

    const hostVersion =
      typeof payload.hostVersion === "string" && payload.hostVersion.length > 0
        ? payload.hostVersion
        : "unknown";

    console.log(`[nika] Host responded with version ${hostVersion}.`);

    const shutdownRequestId = `${initializeRequestId}-shutdown`;
    await writeEnvelope(stdin, {
      version: PROTOCOL_VERSION,
      type: "request",
      requestId: shutdownRequestId,
      command: "shutdown",
      payload: {
        reason: "postinstall smoke test"
      }
    });

    stdin.end();

    const exitResult = await Promise.race([
      child,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Host did not exit after smoke test.")), SMOKE_TEST_SHUTDOWN_TIMEOUT_MS)
      )
    ]);

    if (!exitResult || exitResult.exitCode !== 0) {
      const code = exitResult?.exitCode ?? "unknown";
      throw new Error(`Host exited with non-zero code ${code}.`);
    }

    console.log("[nika] Host smoke test completed successfully.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[nika] Host smoke test failed: ${message}`);
    if (process.env.NIKA_POSTINSTALL_STRICT === "1") {
      throw error instanceof Error ? error : new Error(message);
    }
  } finally {
    if (child && child.kill && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
    }
  }
}

function waitForResponse(child, expectedRequestId, expectedCommand, timeoutMs) {
  const stdout = child.stdout;
  if (!stdout) {
    return Promise.reject(new Error("Host stdout is unavailable."));
  }

  return new Promise((resolve, reject) => {
    let buffer = "";
    let finished = false;

    const cleanup = () => {
      if (finished) {
        return;
      }

      finished = true;
      clearTimeout(timer);
      stdout.off("data", handleData);
      stdout.off("error", handleStreamError);
      child.off("exit", handleExit);
    };

    const fail = (error) => {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    const timer = setTimeout(() => {
      fail(new Error(`Timed out waiting for '${expectedCommand}' response.`));
    }, timeoutMs);

    const handleExit = (code, signal) => {
      fail(new Error(`Host exited before smoke test completed (code=${code ?? "null"} signal=${signal ?? "null"}).`));
    };

    const handleStreamError = (error) => {
      fail(error instanceof Error ? error : new Error(String(error)));
    };

    const handleData = (chunk) => {
      buffer += chunk;

      try {
        while (true) {
          const parsed = extractFrame(buffer);
          if (!parsed) {
            break;
          }

          buffer = parsed.buffer;
          const envelope = parsed.envelope;
          if (!envelope || typeof envelope !== "object") {
            continue;
          }

          if (envelope.type === "notification" && envelope.command === "error") {
            const details = JSON.stringify(envelope.payload ?? {});
            fail(new Error(`Host error during smoke test: ${details}`));
            return;
          }

          if (
            envelope.type === "response" &&
            envelope.requestId === expectedRequestId &&
            envelope.command === expectedCommand
          ) {
            cleanup();
            resolve(envelope);
            return;
          }
        }
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    };

    stdout.on("data", handleData);
    stdout.once("error", handleStreamError);
    child.once("exit", handleExit);
  });
}

function encodeEnvelope(envelope) {
  const json = JSON.stringify(envelope);
  const header = `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n`;
  return header + json;
}

function writeEnvelope(stream, envelope) {
  const frame = encodeEnvelope(envelope);
  return new Promise((resolve, reject) => {
    stream.write(frame, "utf8", (error) => {
      if (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      } else {
        resolve();
      }
    });
  });
}

function extractFrame(buffer) {
  const headerEnd = buffer.indexOf("\r\n\r\n");
  if (headerEnd === -1) {
    return null;
  }

  const headerBlock = buffer.slice(0, headerEnd).split("\r\n");
  let contentLength = null;

  for (const line of headerBlock) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const name = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();

    if (name === "content-length") {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed >= 0) {
        contentLength = parsed;
      }
    }
  }

  if (!Number.isFinite(contentLength) || contentLength === null) {
    throw new Error("Host frame missing Content-Length header.");
  }

  const totalLength = headerEnd + 4 + contentLength;
  if (buffer.length < totalLength) {
    return null;
  }

  const body = buffer.slice(headerEnd + 4, totalLength);
  let envelope;
  try {
    envelope = JSON.parse(body);
  } catch (error) {
    throw new Error(
      `Failed to parse host response JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const remaining = buffer.slice(totalLength);
  return { envelope, buffer: remaining };
}

main().catch((error) => {
  console.warn(`[nika] postinstall warning: ${error instanceof Error ? error.message : String(error)}`);
});
