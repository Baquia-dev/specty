// SPDX-License-Identifier: Apache-2.0
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A fake of the Gemini API that plays a fixed script of tool calls, so Gemini CLI runs against it
 * for free and deterministically (`GOOGLE_GEMINI_BASE_URL`). It reads how far the conversation
 * got from the tool results (`functionResponse`) Gemini CLI sends back, and keeps every request.
 */

export interface GeminiCall {
  readonly name: string;
  readonly args: Readonly<Record<string, unknown>>;
}

type Body = Readonly<Record<string, unknown>>;

/** One part of a request, reduced to who says it and its text: a tool's result is `tool`. */
interface Message {
  readonly role: string;
  readonly text: string;
}

export interface FakeGemini {
  /** For `GOOGLE_GEMINI_BASE_URL`. */
  readonly url: string;
  /** Each model call, as its parts. */
  readonly requests: () => readonly (readonly Message[])[];
  /** The text of each tool result of the last request: the whole conversation's. */
  readonly results: () => readonly string[];
  readonly close: () => Promise<void>;
}

export async function fakeGemini(script: readonly GeminiCall[]): Promise<FakeGemini> {
  const requests: Message[][] = [];
  const server = createServer((request, response) => {
    void read(request).then((text) => {
      const url = request.url ?? "";
      if (request.method !== "POST") {
        response.writeHead(404, { "content-type": "application/json" }).end("{}");
        return;
      }
      if (url.includes(":countTokens")) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ totalTokens: 100 }));
        return;
      }
      const messages = messagesOf(parse(text));
      requests.push(messages);
      const done = messages.filter((message) => message.role === "tool").length;
      answer(response, script[done], url.includes("alt=sse"));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests: () => requests,
    results: () =>
      (requests.at(-1) ?? []).filter((message) => message.role === "tool").map(({ text }) => text),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/** The next tool call of the script, or a closing text once it ran out. */
function answer(response: ServerResponse, step: GeminiCall | undefined, stream: boolean): void {
  const parts =
    step === undefined
      ? [{ text: "Fin." }]
      : [{ functionCall: { name: step.name, args: step.args } }];
  const reply = {
    candidates: [{ content: { role: "model", parts }, finishReason: "STOP", index: 0 }],
    usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 10, totalTokenCount: 110 },
  };
  if (stream) {
    response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    response.end(`data: ${JSON.stringify(reply)}\r\n\r\n`);
  } else {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(reply));
  }
}

function messagesOf(body: Body): Message[] {
  const contents = Array.isArray(body.contents) ? body.contents : [];
  return contents.flatMap((content: unknown) => {
    if (!isBody(content) || !Array.isArray(content.parts)) return [];
    const role = String(content.role);
    return content.parts.flatMap((part: unknown): Message[] => {
      if (!isBody(part)) return [];
      if (isBody(part.functionResponse)) {
        return [{ role: "tool", text: textOf(part.functionResponse.response) }];
      }
      return typeof part.text === "string" ? [{ role, text: part.text }] : [];
    });
  });
}

/** Every text in a tool's response, whatever field Gemini CLI puts it in (`output`, `error`). */
function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textOf).join("\n");
  return isBody(value) ? Object.values(value).map(textOf).join("\n") : "";
}

function isBody(value: unknown): value is Body {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parse(text: string): Body {
  try {
    const value: unknown = JSON.parse(text);
    return isBody(value) ? value : {};
  } catch {
    return {};
  }
}

function read(request: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let text = "";
    request.on("data", (chunk: Buffer) => {
      text += chunk.toString("utf8");
    });
    request.on("end", () => resolve(text));
  });
}
