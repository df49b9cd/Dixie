import { describe, expect, it } from "vitest";
import { _encodeMessageForTests, _parseEnvelopesForTests } from "./host-client";

describe("host-client helpers", () => {
  it("encodes messages with correct content length framing", () => {
    const message = {
      version: 1,
      type: "request" as const,
      requestId: "abc",
      command: "ping",
      payload: { ok: true }
    };

    const encoded = _encodeMessageForTests(message);
    const expectedJson = JSON.stringify(message);
    const expectedLength = Buffer.byteLength(expectedJson, "utf8");

    expect(encoded.startsWith(`Content-Length: ${expectedLength}\r\n\r\n`)).toBe(true);
    expect(encoded.endsWith(expectedJson)).toBe(true);
  });

  it("parses multiple envelopes from concatenated output", () => {
    const payload = { ok: true };
    const first = _encodeMessageForTests({
      version: 1,
      type: "response",
      requestId: "a",
      command: "initialize",
      payload
    });
    const second = _encodeMessageForTests({
      version: 1,
      type: "response",
      requestId: "b",
      command: "format",
      payload
    });

    const envelopes = _parseEnvelopesForTests(`${first}${second}`);

    expect(envelopes).toHaveLength(2);
    expect(envelopes[0]).toMatchObject({
      type: "response",
      requestId: "a",
      command: "initialize",
      payload
    });
    expect(envelopes[1]).toMatchObject({
      type: "response",
      requestId: "b",
      command: "format",
      payload
    });
  });
});
