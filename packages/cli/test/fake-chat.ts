// SPDX-License-Identifier: Apache-2.0
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A fake of OpenAI's chat completions API that plays a fixed script of tool calls, so a real agent
 * that speaks it (OpenCode, through `@ai-sdk/openai-compatible`) runs against it for free and
 * deterministically. It reads how far each conversation got from the `tool` messages the agent
 * sends back, and keeps every request. A subagent gets a script of its own (`fakeChat`).
 */

export interface ToolCall {
  readonly name: string;
  readonly arguments: Readonly<Record<string, unknown>>;
}

type Body = Readonly<Record<string, unknown>>;

/** One message of a request, reduced to its role and its text. */
interface Message {
  readonly role: string;
  readonly text: string;
}

export interface FakeChat {
  /** For the provider's `baseURL`. */
  readonly url: string;
  /** Each request that carried tools, as its messages: the main conversation's and its subagents'. */
  readonly requests: () => readonly (readonly Message[])[];
  /** The text of each tool result of the main conversation's last request: the whole conversation's. */
  readonly results: () => readonly string[];
  /** The same, for the subagent whose task carries `mark`. */
  readonly subagentResults: (mark: string) => readonly string[];
  readonly close: () => Promise<void>;
}

/**
 * Plays `script` to the main conversation and, to a subagent whose task (its first user message)
 * carries one of the marks of `subagents`, that mark's script, each conversation on its own.
 */
export async function fakeChat(
  script: readonly ToolCall[],
  subagents: Readonly<Record<string, readonly ToolCall[]>> = {},
): Promise<FakeChat> {
  const requests: Message[][] = [];
  // Each conversation's last request that carried tools, by its mark: "" for the main one.
  const last = new Map<string, readonly Message[]>();
  const marks = Object.keys(subagents);
  const server = createServer((request, response) => {
    void read(request).then((text) => {
      const body = parse(text);
      if (request.method !== "POST" || !(request.url ?? "").includes("/chat/completions")) {
        response.writeHead(404, { "content-type": "application/json" }).end("{}");
        return;
      }
      // Requests without tools (titles, summaries) get the closing text and leave the script; a
      // summary asked with a template, which OpenCode 2.2 sends with tools, gets the template.
      const messages = messagesOf(body);
      const summary = summaryOf(messages);
      const tools = summary === undefined && Array.isArray(body.tools) && body.tools.length > 0;
      const task = messages.find((message) => message.role === "user")?.text ?? "";
      const mark = marks.find((candidate) => task.includes(candidate));
      if (tools) {
        requests.push(messages);
        last.set(mark ?? "", messages);
      }
      const steps = mark === undefined ? script : (subagents[mark] ?? []);
      const done = messages.filter((message) => message.role === "tool").length;
      // The count of requests numbers the calls: each conversation's get ids of their own.
      answer(response, tools ? steps[done] : undefined, requests.length, summary);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const resultsOf = (messages: readonly Message[] | undefined) =>
    (messages ?? []).filter((message) => message.role === "tool").map(({ text }) => text);
  return {
    url: `http://127.0.0.1:${port}/v1`,
    requests: () => requests,
    results: () => resultsOf(last.get("")),
    subagentResults: (mark) => resultsOf(last.get(mark)),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/** The next tool call of the script, or a closing text once it ran out, as a stream. */
function answer(
  response: ServerResponse,
  step: ToolCall | undefined,
  index: number,
  closing = "Fin.",
): void {
  response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  const chunk = (delta: Body, finish: string | null) => {
    const choices = [{ index: 0, delta, finish_reason: finish }];
    const data = { id: `chatcmpl-${index}`, object: "chat.completion.chunk", choices };
    response.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  if (step === undefined) {
    chunk({ role: "assistant", content: closing }, null);
    chunk({}, "stop");
  } else {
    const call = { name: step.name, arguments: JSON.stringify(step.arguments) };
    chunk(
      {
        role: "assistant",
        tool_calls: [{ index: 0, id: `call_${index}`, type: "function", function: call }],
      },
      null,
    );
    chunk({}, "tool_calls");
  }
  response.write("data: [DONE]\n\n");
  response.end();
}

/**
 * The summary that the last message asks for with a template, as OpenCode 2.2 compacts: the
 * template's first heading, which OpenCode checks the summary has. Undefined for other requests.
 */
function summaryOf(messages: readonly Message[]): string | undefined {
  const asked = messages.at(-1);
  const heading = asked?.role === "user" ? /<template>\s*(#+ .+)/.exec(asked.text)?.[1] : undefined;
  return heading === undefined ? undefined : `${heading}\n- Seguir el guion.`;
}

function messagesOf(body: Body): Message[] {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  return messages.flatMap((message: unknown) =>
    isBody(message) ? [{ role: String(message.role), text: textOf(message.content) }] : [],
  );
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
