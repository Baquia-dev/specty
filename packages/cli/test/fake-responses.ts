// SPDX-License-Identifier: Apache-2.0
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A fake of OpenAI's Responses API that plays a fixed script of tool calls, so Codex runs against
 * it for free and deterministically. It reads how far the conversation got from the tool results
 * Codex sends back (`function_call_output`, `custom_tool_call_output`), and keeps every request.
 */

/** A call of the script: a function with JSON arguments, or a free-form tool (`apply_patch`). */
export type CodexCall =
  | { readonly name: string; readonly arguments: Readonly<Record<string, unknown>> }
  | { readonly name: string; readonly input: string };

type Body = Readonly<Record<string, unknown>>;

/** One item of a request, reduced to who says it and its text: a tool's result is `tool`. */
interface Message {
  readonly role: string;
  readonly text: string;
}

export interface FakeResponses {
  /** For the provider's `base_url`. */
  readonly url: string;
  /** Each model call, as its items. */
  readonly requests: () => readonly (readonly Message[])[];
  /** The text of each tool result of the last request: the whole conversation's. */
  readonly results: () => readonly string[];
  readonly close: () => Promise<void>;
}

export async function fakeResponses(script: readonly CodexCall[]): Promise<FakeResponses> {
  const requests: Message[][] = [];
  const server = createServer((request, response) => {
    void read(request).then((text) => {
      if (request.method !== "POST" || !(request.url ?? "").includes("/responses")) {
        response.writeHead(404, { "content-type": "application/json" }).end("{}");
        return;
      }
      const messages = messagesOf(parse(text));
      requests.push(messages);
      const done = messages.filter((message) => message.role === "tool").length;
      answer(response, script[done], requests.length);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/v1`,
    requests: () => requests,
    results: () =>
      (requests.at(-1) ?? []).filter((message) => message.role === "tool").map(({ text }) => text),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/** The next tool call of the script, or a closing message once it ran out, as a stream. */
function answer(response: ServerResponse, step: CodexCall | undefined, index: number): void {
  const id = `resp_${index}`;
  const item = itemOf(step, index);
  const usage = {
    input_tokens: 100,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens: 10,
    output_tokens_details: { reasoning_tokens: 0 },
    total_tokens: 110,
  };
  const events = [
    { type: "response.created", response: { id, object: "response", status: "in_progress" } },
    { type: "response.output_item.added", output_index: 0, item },
    { type: "response.output_item.done", output_index: 0, item },
    {
      type: "response.completed",
      response: { id, object: "response", status: "completed", output: [item], usage },
    },
  ];
  response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  for (const event of events) {
    response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  }
  response.end();
}

function itemOf(step: CodexCall | undefined, index: number): Body {
  const call = { status: "completed", call_id: `call_${index}`, name: step?.name };
  if (step === undefined) {
    const content = [{ type: "output_text", text: "Hecho.", annotations: [] }];
    return { type: "message", id: `msg_${index}`, status: "completed", role: "assistant", content };
  }
  return "input" in step
    ? { type: "custom_tool_call", id: `ctc_${index}`, ...call, input: step.input }
    : {
        type: "function_call",
        id: `fc_${index}`,
        ...call,
        arguments: JSON.stringify(step.arguments),
      };
}

function messagesOf(body: Body): Message[] {
  const items = Array.isArray(body.input) ? body.input : [];
  return items.flatMap((item: unknown): Message[] => {
    if (!isBody(item)) return [];
    if (item.type === "function_call_output" || item.type === "custom_tool_call_output") {
      return [{ role: "tool", text: textOf(item.output) }];
    }
    return item.type === "message" ? [{ role: String(item.role), text: textOf(item.content) }] : [];
  });
}

/** Every text in an item, whatever shape Codex gives it: a string, or parts with `text`. */
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
