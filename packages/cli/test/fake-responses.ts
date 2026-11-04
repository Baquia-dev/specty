// SPDX-License-Identifier: Apache-2.0
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A fake of OpenAI's Responses API that plays a fixed script of tool calls, so Codex runs against
 * it for free and deterministically. It reads how far the conversation got from the tool results
 * Codex sends back (`function_call_output`, `custom_tool_call_output`, `tool_search_output`), and
 * keeps every request. Each subagent Codex spawns plays a script of its own, picked by a mark in
 * the task it was given.
 */

/**
 * A call of the script: a function with JSON arguments, in the `namespace` of the tools a search
 * found; a free-form tool (`apply_patch`); a search of Codex's deferred tools (`tool_search`); or
 * waiting with `wait_agent` for the subagents the thread spawned, by the ids `spawn_agent` gave.
 */
export type CodexCall =
  | {
      readonly name: string;
      readonly arguments: Readonly<Record<string, unknown>>;
      readonly namespace?: string;
    }
  | { readonly name: string; readonly input: string }
  | { readonly search: string }
  | { readonly wait: "spawned" };

/** A call as the model sends it: waiting names the subagents it waits for. */
type Call = Exclude<CodexCall, { readonly wait: "spawned" }>;

type Body = Readonly<Record<string, unknown>>;

/** One item of a request, reduced to who says it and its text: a tool's result is `tool`. */
interface Message {
  readonly role: string;
  readonly text: string;
}

/** A request, with the subagent whose thread sent it: undefined for the main thread. */
interface ThreadRequest {
  readonly thread?: string;
  readonly messages: readonly Message[];
}

export interface FakeResponses {
  /** For the provider's `base_url`. */
  readonly url: string;
  /** Each model call, as its items, of every thread. */
  readonly requests: () => readonly (readonly Message[])[];
  /**
   * The text of each tool result of the last request of the main thread, or of the subagent whose
   * task carries `mark`: the whole conversation's.
   */
  readonly results: (mark?: string) => readonly string[];
  readonly close: () => Promise<void>;
}

/** Codex's tools for subagents (Codex 0.166.0), which the model finds with `tool_search` first. */
const AGENTS = "multi_agent_v1";

/** A call that spawns a subagent whose task carries `mark`, so it plays that mark's script. */
export const spawnAgent = (mark: string, task: string): CodexCall => ({
  name: "spawn_agent",
  namespace: AGENTS,
  arguments: { message: `${mark}: ${task}` },
});

/** The main thread plays `script`; the subagent whose task carries a mark, that mark's. */
export async function fakeResponses(
  script: readonly CodexCall[],
  subagents: Readonly<Record<string, readonly CodexCall[]>> = {},
): Promise<FakeResponses> {
  const requests: ThreadRequest[] = [];
  const server = createServer((request, response) => {
    void read(request).then((text) => {
      if (request.method !== "POST" || !(request.url ?? "").includes("/responses")) {
        response.writeHead(404, { "content-type": "application/json" }).end("{}");
        return;
      }
      const messages = messagesOf(parse(text));
      const thread = threadOf(messages, Object.keys(subagents));
      requests.push({ ...(thread === undefined ? {} : { thread }), messages });
      const steps = thread === undefined ? script : (subagents[thread] ?? []);
      const done = messages.filter((message) => message.role === "tool").length;
      answer(response, callOf(steps[done], messages), requests.length);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/v1`,
    requests: () => requests.map(({ messages }) => messages),
    results: (mark) =>
      (requests.filter(({ thread }) => thread === mark).at(-1)?.messages ?? [])
        .filter((message) => message.role === "tool")
        .map(({ text }) => text),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/** The mark of the subagent whose task a request carries; undefined for the main thread. */
function threadOf(messages: readonly Message[], marks: readonly string[]): string | undefined {
  const said = messages.filter(({ role }) => role === "user").map(({ text }) => text);
  return marks.find((mark) => said.some((text) => text.includes(mark)));
}

/** A step as the model calls it: waiting for the spawned subagents names their ids. */
function callOf(step: CodexCall | undefined, messages: readonly Message[]): Call | undefined {
  if (step === undefined || !("wait" in step)) return step;
  const targets = messages
    .filter(({ role }) => role === "tool")
    .flatMap(({ text }) => {
      const spawned = parse(text).agent_id;
      return typeof spawned === "string" ? [spawned] : [];
    });
  return { name: "wait_agent", namespace: AGENTS, arguments: { targets, timeout_ms: 120_000 } };
}

/** The next tool call of the script, or a closing message once it ran out, as a stream. */
function answer(response: ServerResponse, step: Call | undefined, index: number): void {
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

function itemOf(step: Call | undefined, index: number): Body {
  const call = { status: "completed", call_id: `call_${index}` };
  if (step === undefined) {
    const content = [{ type: "output_text", text: "Hecho.", annotations: [] }];
    return { type: "message", id: `msg_${index}`, status: "completed", role: "assistant", content };
  }
  // Codex runs the search itself (`execution: client`) and sends the tools it found back.
  if ("search" in step) {
    const search = { query: step.search, limit: 8 };
    return {
      type: "tool_search_call",
      id: `tsc_${index}`,
      ...call,
      execution: "client",
      arguments: search,
    };
  }
  if ("input" in step) {
    return {
      type: "custom_tool_call",
      id: `ctc_${index}`,
      ...call,
      name: step.name,
      input: step.input,
    };
  }
  return {
    type: "function_call",
    id: `fc_${index}`,
    ...call,
    name: step.name,
    ...(step.namespace === undefined ? {} : { namespace: step.namespace }),
    arguments: JSON.stringify(step.arguments),
  };
}

/** The items that answer a call of the model: a function's, a free-form tool's, a search's. */
const RESULTS: ReadonlySet<unknown> = new Set([
  "function_call_output",
  "custom_tool_call_output",
  "tool_search_output",
]);

function messagesOf(body: Body): Message[] {
  const items = Array.isArray(body.input) ? body.input : [];
  return items.flatMap((item: unknown): Message[] => {
    if (!isBody(item)) return [];
    if (RESULTS.has(item.type)) return [{ role: "tool", text: textOf(item.output ?? item.tools) }];
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
