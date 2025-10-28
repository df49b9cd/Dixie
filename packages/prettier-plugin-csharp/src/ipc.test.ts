import { describe, expect, it } from "vitest";
import { createRequest, encodeMessage, parseEnvelopes } from "./ipc";

describe("ipc framing", () => {
  it("encodes messages with accurate content length headers", () => {
    const request = createRequest("format", { hello: "world" });
    const frame = encodeMessage(request);
    const [, header, json] = frame.match(/^(Content-Length: \d+)\r\n\r\n(.+)$/) ?? [];

    expect(header).toBe(`Content-Length: ${Buffer.byteLength(json, "utf8")}`);
    expect(JSON.parse(json)).toMatchObject({
      type: "request",
      command: "format",
      payload: { hello: "world" }
    });
  });

  it("drops trailing partial frames", () => {
    const request = createRequest("format", { ok: true });
    const frame = encodeMessage(request);
    const truncated = `${frame}${frame.slice(0, frame.length - 5)}`;

    const envelopes = parseEnvelopes(truncated);

    expect(envelopes).toHaveLength(1);
    expect(envelopes[0]).toMatchObject({ command: "format" });
  });

  it("aborts parsing when headers are invalid", () => {
    const invalid = "Content-Length: nope\r\n\r\n{}";
    const envelopes = parseEnvelopes(invalid);
    expect(envelopes).toHaveLength(0);
  });
});
