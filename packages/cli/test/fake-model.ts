// SPDX-License-Identifier: Apache-2.0
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A fake of Anthropic's Messages API that plays a fixed script of tool calls, so a real agent
 * (Claude Code, headless) runs against it for free and deterministically. It reads how far the
 * conversation got from the tool results the agent sends back, and keeps every request.
 */

export interface ToolUse {
  readonly name: string;
  readonly input: Readonly<Record<string, unknown>>;
}

/** What the agent sent back for one tool call: Specty's guard answers there when it blocks. */
export interface ToolResult {
  readonly id: string;
  readonly isError: boolean;
  readonly text: string;
}

export interface FakeModel {
  /** For `ANTHROPIC_BASE_URL`. */
  readonly url: string;
  /** The `POST /v1/messages` requests that carried tools, in order. */
  readonly turns: () => number;
  /** The tool results of the last request: the whole conversation's. */
  readonly results: () => readonly ToolResult[];
  readonly close: () => Promise<void>;
}

type Body = Readonly<Record<string, unknown>>;

export async function fakeModel(script: readonly ToolUse[]): Promise<FakeModel> {
  const bodies: Body[] = [];
  const server = createServer((request, response) => {
    void read(request).then((text) => {
      const body = parse(text);
      const url = request.url ?? "";
      if (request.method !== "POST" || !url.includes("/v1/messages")) {
        json(response, {}, 404);
      } else if (url.includes("/v1/messages/count_tokens")) {
        json(response, { input_tokens: 1 });
      } else {
        // Requests without tools (titles, summaries) get the closing text and leave the script.
        const tools = Array.isArray(body.tools) && body.tools.length > 0;
        if (tools) bodies.push(body);
        const done = resultsOf(body).length;
        answer(response, body, tools ? script[done] : undefined, done);
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    turns: () => bodies.length,
    results: () => {
      const last = bodies.at(-1);
      return last === undefined ? [] : resultsOf(last);
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/** The next tool call of the script, or a closing text once it ran out. */
function answer(
  response: ServerResponse,
  body: Body,
  step: ToolUse | undefined,
  index: number,
): void {
  const id = `toolu_${index}`;
  const stop = step === undefined ? "end_turn" : "tool_use";
  const message = {
    id: `msg_${index}`,
    type: "message",
    role: "assistant",
    model: body.model,
    content: [],
    stop_reason: null,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  };
  if (body.stream !== true) {
    const content =
      step === undefined
        ? [{ type: "text", text: "Fin." }]
        : [{ type: "tool_use", id, name: step.name, input: step.input }];
    json(response, { ...message, content, stop_reason: stop });
    return;
  }
  const [start, delta] =
    step === undefined
      ? [
          { type: "text", text: "" },
          { type: "text_delta", text: "Fin." },
        ]
      : [
          { type: "tool_use", id, name: step.name, input: {} },
          { type: "input_json_delta", partial_json: JSON.stringify(step.input) },
        ];
  const events: [string, Body][] = [
    ["message_start", { type: "message_start", message }],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: start }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    [
      "message_delta",
      {
        type: "message_delta",
        delta: { stop_reason: stop, stop_sequence: null },
        usage: { output_tokens: 1 },
      },
    ],
    ["message_stop", { type: "message_stop" }],
  ];
  response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  for (const [event, data] of events) {
    response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
  response.end();
}

/** Every tool result of the conversation in `body`, in order. */
function resultsOf(body: Body): ToolResult[] {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  return messages.flatMap((message: unknown) => {
    const content = isBody(message) && Array.isArray(message.content) ? message.content : [];
    return content.flatMap((block: unknown): ToolResult[] =>
      isBody(block) && block.type === "tool_result"
        ? [
            {
              id: String(block.tool_use_id),
              isError: block.is_error === true,
              text: textOf(block.content),
            },
          ]
        : [],
    );
  });
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part: unknown) => (isBody(part) ? String(part.text ?? "") : "")).join("");
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

function json(response: ServerResponse, value: unknown, status = 200): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}
