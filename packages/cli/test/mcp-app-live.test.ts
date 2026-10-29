// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/program";
import {
  AGENT,
  APP,
  CONFIG,
  cli,
  DIST,
  NOW,
  person,
  SPEC,
  SPEC_PATH,
  tempRepo,
  testEnv,
  writeFiles,
} from "./support";

type Message = Record<string, unknown>;

const APPS = {
  extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } },
};

/** A verification that takes three seconds: long enough to ask the view meanwhile. */
const SLOW = `node -e "setTimeout(() => {}, 3000)"`;

/** `specty mcp` in `cwd`, run as `script`, fed `messages` at once: what it writes, in order. */
async function serve(cwd: string, script: string, messages: readonly Message[]) {
  async function* input() {
    yield `${messages.map((message) => JSON.stringify(message)).join("\n")}\n`;
  }
  const out: string[] = [];
  const code = await runCli(["mcp"], {
    cwd,
    env: testEnv(),
    now: () => NOW,
    terminal: AGENT,
    io: { out: (line) => out.push(line), err: () => undefined },
    invocation: { command: `node "${DIST}"`, portable: false, script },
    stdin: async () => "",
    input: input(),
  });
  expect(code).toBe(0);
  return out.map((line): Message => JSON.parse(line));
}

/** A change implementing T1, with code to complete it, and the page of the view next to `script`. */
async function implementing() {
  const root = await tempRepo({ ...APP, ".specty/config.yaml": CONFIG(SLOW) });
  await cli(root, ["new", "Saludo personalizado"]);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  await cli(root, ["propose"]);
  await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  await cli(root, ["next"]);
  await writeFiles(root, {
    "src/app.ts": "export const greet = (name: string) => 'Hola, ' + name;\n",
  });
  const bundle = await realpath(await mkdtemp(join(tmpdir(), "specty-bundle-")));
  await writeFile(join(bundle, "mcp-app.html"), "<!doctype html><html></html>");
  return { root, script: join(bundle, "specty.mjs") };
}

describe("specty mcp while a tool of the agent runs", () => {
  it("AC3: answers the view's specty_view without waiting for the agent's long tool", async () => {
    const { root, script } = await implementing();
    const answers = await serve(root, script, [
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-11-25", capabilities: APPS, clientInfo: { name: "h" } },
      },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "specty_task_done",
          arguments: { task: "T1", summary: "Saludo", folder: root },
        },
      },
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "specty_view", arguments: { folder: root } },
      },
    ]);
    // The view's answer comes before the task's, which waits for its verification.
    expect(answers.map((answer) => answer.id)).toEqual([1, 3, 2]);
  });
});
