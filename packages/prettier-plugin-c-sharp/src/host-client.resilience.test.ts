import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HostClient } from "./host-client";

const source = "class Foo { }";
const formattingOptions = {
  printWidth: 80,
  tabWidth: 2,
  useTabs: false,
  endOfLine: "lf" as const
};

describe("HostClient resilience", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete process.env.DIXIE_STRICT_HOST;
  });

  it("retries once after a transient failure", () => {
    const client = new HostClient();
    const sendSpy = vi
      .spyOn(client as unknown as { sendFormatRequest: () => string }, "sendFormatRequest")
      .mockImplementationOnce(() => {
        throw new Error("transient");
      })
      .mockImplementationOnce(() => "formatted text");
    const disposeSpy = vi
      .spyOn(client as unknown as { disposeWorker: () => void }, "disposeWorker")
      .mockImplementation(() => {});

    const result = client.format(source, formattingOptions);

    expect(result).toBe("formatted text");
    expect(sendSpy).toHaveBeenCalledTimes(2);
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back to the original text when retries are exhausted", () => {
    const client = new HostClient();
    vi.spyOn(client as unknown as { sendFormatRequest: () => string }, "sendFormatRequest").mockImplementation(
      () => {
        throw new Error("fatal");
      }
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = client.format(source, formattingOptions);

    expect(result).toBe(source);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[dixie] Falling back to original text"));
  });

  it("propagates failures when strict mode is enabled", () => {
    process.env.DIXIE_STRICT_HOST = "1";
    const client = new HostClient();
    vi.spyOn(client as unknown as { sendFormatRequest: () => string }, "sendFormatRequest").mockImplementation(
      () => {
        throw new Error("strict failure");
      }
    );

    expect(() => client.format(source, formattingOptions)).toThrow(/strict failure/);
  });
});
