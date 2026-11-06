// SPDX-License-Identifier: Apache-2.0
import { utimes } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startServer } from "../src/server/http";
import { call, sessionAt } from "./server/support";
import { AGENT, CHANGE, inWorktree, NOW, writeFiles } from "./support";

const MINUTE = 60_000;
const before = (minutes: number) => new Date(NOW.getTime() - minutes * MINUTE).toISOString();

/** The change's `state.json` was last written `minutes` before NOW. */
async function stateWritten(folder: string, minutes: number): Promise<void> {
  const at = new Date(before(minutes));
  await utimes(join(folder, `.specty/changes/${CHANGE}/state.json`), at, at);
}

/** Conversation `session` of `tool` is bound to `bound` and last stepped in `folder`. */
async function conversation(
  root: string,
  {
    bound,
    folder,
    minutes,
    session = "s1",
    tool = "claude-code",
  }: {
    readonly bound?: string;
    readonly folder: string;
    readonly minutes: number;
    readonly session?: string;
    readonly tool?: string;
  },
): Promise<void> {
  await writeFiles(root, {
    [`.git/common/specty/activity/${tool}-${session}.json`]: JSON.stringify({
      tool,
      folder,
      first: before(minutes + 10),
      last: before(minutes),
    }),
    ...(bound === undefined
      ? {}
      : {
          [`.git/common/specty/sessions/${session}.json`]: JSON.stringify({
            folder: bound,
            at: before(30),
          }),
        }),
  });
}

/** The record of the change as the person's server in `root` serves it. */
async function served(root: string): Promise<Record<string, unknown>> {
  const server = await startServer({
    session: await sessionAt(root, AGENT),
    port: 0,
    ui: undefined,
    actions: true,
  });
  try {
    const { pathname, search } = new URL(server.link);
    const cookie = (await call(server.port, `${pathname}${search}`)).headers["set-cookie"]?.[0];
    const headers = {
      cookie: cookie?.split(";")[0] ?? "",
      origin: `http://localhost:${server.port}`,
    };
    const records = JSON.parse((await call(server.port, "/api/changes", headers)).body);
    return records.find((record: { state: { id: string } }) => record.state.id === CHANGE);
  } finally {
    await server.close();
  }
}

describe("the server's records of the changes no conversation holds", () => {
  it("AC1: mark an orphan change", async () => {
    const { root, folder } = await inWorktree();
    await stateWritten(folder, 120);
    const record = await served(root);
    expect(record).toMatchObject({ orphan: true });
    expect(record).not.toHaveProperty("away");
  });

  it("AC1: say which agent's conversation left the change's folder, and when", async () => {
    const { root, folder } = await inWorktree();
    await conversation(root, { bound: folder, folder: root, minutes: 5 });
    expect(await served(root)).toMatchObject({ away: { tool: "claude-code", ago: 5 } });
  });

  it("AC1: mark nothing in a change a conversation works in", async () => {
    const { root, folder } = await inWorktree();
    await conversation(root, { bound: folder, folder, minutes: 2 });
    const record = await served(root);
    expect(record).not.toHaveProperty("orphan");
    expect(record).not.toHaveProperty("away");
  });
});

describe("the server's records of who holds each open change", () => {
  it("AC8: say which agent's conversation stepped last in its folder, and how many minutes ago", async () => {
    const { root, folder } = await inWorktree();
    await conversation(root, { bound: folder, folder, minutes: 2 });
    expect(await served(root)).toMatchObject({ holder: { tool: "claude-code", ago: 2 } });
  });

  it("AC8: still say who stepped last in an orphan's folder, however long ago", async () => {
    const { root, folder } = await inWorktree();
    await conversation(root, { folder, minutes: 120, tool: "codex" });
    await stateWritten(folder, 120);
    expect(await served(root)).toMatchObject({
      orphan: true,
      holder: { tool: "codex", ago: 120 },
    });
  });

  it("AC8: give no holder to a change no conversation stepped in", async () => {
    const { root, folder } = await inWorktree();
    await stateWritten(folder, 120);
    expect(await served(root)).not.toHaveProperty("holder");
  });
});
