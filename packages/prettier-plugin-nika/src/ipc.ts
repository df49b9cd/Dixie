import { randomUUID } from "node:crypto";
import {
  ProtocolVersion,
  messageEnvelopeSchema,
  type Command,
  type MessageEnvelope
} from "./protocol";

export type RequestEnvelope<TPayload> = {
  version: number;
  type: "request";
  requestId: string;
  command: Command;
  payload: TPayload;
};

export function createRequest<TPayload>(
  command: Command,
  payload: TPayload
): RequestEnvelope<TPayload> {
  return {
    version: ProtocolVersion,
    type: "request",
    requestId: randomUUID(),
    command,
    payload
  };
}

export function encodeMessage(message: RequestEnvelope<unknown>): string {
  const json = JSON.stringify(message);
  const bytes = Buffer.byteLength(json, "utf8");
  return `Content-Length: ${bytes}\r\n\r\n${json}`;
}

export function parseEnvelopes(output: string): MessageEnvelope[] {
  const envelopes: MessageEnvelope[] = [];
  let cursor = 0;

  while (cursor < output.length) {
    const headerEnd = output.indexOf("\r\n\r\n", cursor);
    if (headerEnd === -1) {
      break;
    }

    const headerBlock = output.slice(cursor, headerEnd);
    const headers = headerBlock.split("\r\n");
    const contentLengthLine = headers.find((line) =>
      line.toLowerCase().startsWith("content-length")
    );

    if (!contentLengthLine) {
      break;
    }

    const value = contentLengthLine.split(":")[1];
    const length = Number.parseInt(value?.trim() ?? "", 10);

    if (!Number.isFinite(length) || length < 0) {
      break;
    }

    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;

    if (bodyEnd > output.length) {
      break;
    }

    const rawEnvelope = JSON.parse(output.slice(bodyStart, bodyEnd)) as unknown;
    const envelope = messageEnvelopeSchema.parse(rawEnvelope);
    envelopes.push(envelope);

    cursor = bodyEnd;

    while (cursor < output.length && (output[cursor] === "\r" || output[cursor] === "\n")) {
      cursor += 1;
    }
  }

  return envelopes;
}
