// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/program";
import { AGENT, CHANGE, cli, DIST, inWorktree, NOW, person, testEnv, toClosing } from "./support";

type Message = Record<string, unknown>;
type View = {
  readonly fingerprint: string;
  readonly records?: readonly { readonly state: { readonly id: string; readonly phase: string } }[];
};

const APPS = {
  extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } },
};

/** `specty mcp` in `cwd`, run as `script`, fed `messages`: the JSON messages it writes. */
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

const initialize: Message = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-11-25", capabilities: APPS, clientInfo: { name: "host" } },
};

/** The view's question `args`, with id `id`. */
const view = (id: number, args: Message): Message => ({
  jsonrpc: "2.0",
  id,
  method: "tools/call",
  params: { name: "specty_view", arguments: args },
});

/** What `specty_view` answered. */
function dataOf(message: Message | undefined): View {
  const result = message?.result as { structuredContent?: View } | undefined;
  if (result?.structuredContent === undefined)
    throw new Error(`no data: ${JSON.stringify(message)}`);
  return result.structuredContent;
}

/** A bundle folder with the view's page, as the build leaves it: the script that serves it. */
async function bundle() {
  const folder = await realpath(await mkdtemp(join(tmpdir(), "specty-bundle-")));
  await writeFile(join(folder, "mcp-app.html"), "<!doctype html><html></html>");
  return join(folder, "specty.mjs");
}

describe("specty_view by the change's id", () => {
  it("AC2: gives the change by its id though it lives in another folder", async () => {
    const { root } = await inWorktree();
    const [, byFolder, byId] = await serve(root, await bundle(), [
      initialize,
      view(2, { folder: root }),
      view(3, { folder: root, change: CHANGE }),
    ]);
    // The main folder has no change open: `specty new` made it in a worktree of its own.
    expect(dataOf(byFolder).records).toEqual([]);
    expect(dataOf(byId).records?.map((record) => record.state.id)).toEqual([CHANGE]);
  });

  it("AC2: gives a closed change whose folder is gone, and says when nothing changed", async () => {
    const { root, folder } = await inWorktree();
    await toClosing(folder);
    expect((await cli(folder, ["close"], { terminal: person() })).code).toBe(0);
    expect(existsSync(folder)).toBe(false);
    const script = await bundle();
    const [, closed] = await serve(root, script, [initialize, view(2, { folder, change: CHANGE })]);
    const data = dataOf(closed);
    expect(data.records?.map((record) => [record.state.id, record.state.phase])).toEqual([
      [CHANGE, "done"],
    ]);
    const [, same] = await serve(root, script, [
      initialize,
      view(2, { folder, change: CHANGE, since: data.fingerprint }),
    ]);
    expect(dataOf(same)).toEqual({ fingerprint: data.fingerprint, unchanged: true });
  });
});
