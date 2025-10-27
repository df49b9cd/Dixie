import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { execa } from "execa";
import path from "node:path";
import { existsSync } from "node:fs";
import { HostClient } from "./host-client";

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const hostProjectPath = path.resolve(repoRoot, "src", "Nika.Host");

describe("HostClient integration", () => {
  let originalHostPath: string | undefined;
  let resolvedHostPath: string;

  beforeAll(async () => {
    originalHostPath = process.env.NIKA_HOST_PATH;

    await execa("dotnet", ["build", hostProjectPath], {
      cwd: repoRoot,
      env: process.env
    });

    const buildRoot = path.resolve(hostProjectPath, "bin", "Debug", "net9.0");

    const candidates = [
      path.join(buildRoot, "Nika.Host"),
      path.join(buildRoot, "Nika.Host.exe"),
      path.join(buildRoot, "Nika.Host.dll")
    ];

    const found = candidates.find((candidate) => existsSync(candidate));
    if (!found) {
      throw new Error("Failed to locate built Nika host binary.");
    }

    resolvedHostPath = found;
    process.env.NIKA_HOST_PATH = resolvedHostPath;
  }, 120_000);

  afterAll(() => {
    if (originalHostPath === undefined) {
      delete process.env.NIKA_HOST_PATH;
    } else {
      process.env.NIKA_HOST_PATH = originalHostPath;
    }
  });

  it("formats content via the Roslyn host handshake", () => {
    const client = new HostClient();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {
      /* suppress */
    });

    const source = "class Foo { // TODO fix }";
    const result = client.format(source, {
      printWidth: 100,
      tabWidth: 2,
      useTabs: false,
      endOfLine: "lf"
    });

    expect(result.trim()).toBe(source);
    expect(result.endsWith("\n")).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("TODO comment detected."));

    warnSpy.mockRestore();
  }, 10_000);
});
