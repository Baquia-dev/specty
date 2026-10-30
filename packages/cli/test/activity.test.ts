// SPDX-License-Identifier: Apache-2.0
import { utimes } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APP,
  CHANGE,
  CONFIG,
  cli,
  inWorktree,
  NOW,
  read,
  SPEC,
  SPEC_PATH,
  writeFiles,
} from "./support";

const MINUTE = 60_000;

/** Where the guard notes what conversation `session` of Claude Code did last. */
const ACTIVITY = (session = "s1", tool = "claude-code") =>
  `.git/common/specty/activity/${tool}-${session}.json`;

/** One step of a Claude Code conversation in `cwd`: a `Bash` call about to run. */
const step = (cwd: string, session = "s1") =>
  cli(cwd, ["guard", "--tool", "claude-code"], {
    stdin: JSON.stringify({
      cwd,
      session_id: session,
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "ls" },
    }),
  });

/** `minutes` before NOW, as an ISO date. */
const before = (minutes: number) => new Date(NOW.getTime() - minutes * MINUTE).toISOString();

/** The conversation `session` of `tool` last stepped in `folder` `minutes` before NOW. */
async function steppedBefore(
  root: string,
  folder: string,
  minutes: number,
  { session = "s1", tool = "claude-code" } = {},
): Promise<void> {
  const at = before(minutes);
  await writeFiles(root, {
    [ACTIVITY(session, tool)]: JSON.stringify({ tool, folder, first: at, last: at }),
  });
}

/** The change's `state.json` was last written `minutes` before NOW. */
async function stateWritten(folder: string, minutes: number): Promise<void> {
  const at = new Date(before(minutes));
  await utimes(join(folder, `.specty/changes/${CHANGE}/state.json`), at, at);
}

/** The open change as `specty --json status` gives it from `cwd`. */
const changeFrom = async (cwd: string) =>
  JSON.parse((await cli(cwd, ["--json", "status"])).out).changes[0];

const statusText = async (cwd: string) => (await cli(cwd, ["status"])).out;

describe("who holds each change", () => {
  it("AC1: names the agent whose conversation stepped in the change's folder, from any folder", async () => {
    const { root, folder } = await inWorktree();
    expect((await step(folder)).code).toBe(0);
    const change = await changeFrom(root);
    expect(change).toMatchObject({ id: CHANGE, holder: { tool: "claude-code", ago: 0 } });
    expect(change.orphan).not.toBe(true);
    expect(await statusText(root)).toContain("lo lleva claude-code, ahora mismo");
    expect(await changeFrom(folder)).toMatchObject({ holder: { tool: "claude-code", ago: 0 } });
  });

  it("AC1: names the conversation that stepped last, and how long ago", async () => {
    const { root, folder } = await inWorktree();
    await steppedBefore(root, folder, 10, { session: "old", tool: "codex" });
    expect(await changeFrom(root)).toMatchObject({ holder: { tool: "codex", ago: 10 } });
    expect(await statusText(root)).toContain("lo lleva codex, hace 10 min");
    await step(folder, "new");
    expect(await changeFrom(root)).toMatchObject({ holder: { tool: "claude-code", ago: 0 } });
  });

  it("AC1: does not count a conversation that works in another folder", async () => {
    const { root, folder } = await inWorktree();
    await step(root);
    await stateWritten(folder, 5);
    expect(await changeFrom(root)).not.toHaveProperty("holder");
  });
});

describe("an orphan change", () => {
  it("AC2: is one that waits for the agent and nobody stepped in nor wrote to lately", async () => {
    const { root, folder } = await inWorktree();
    await stateWritten(folder, 120);
    const change = await changeFrom(root);
    expect(change).toMatchObject({ orphan: true });
    expect(change).not.toHaveProperty("holder");
    expect(await statusText(root)).toContain("huérfano: ninguna sesión lo lleva");
  });

  it("AC2: names the last agent that stepped in it, and when", async () => {
    const { root, folder } = await inWorktree();
    await steppedBefore(root, folder, 120);
    await stateWritten(folder, 120);
    expect(await changeFrom(root)).toMatchObject({
      orphan: true,
      holder: { tool: "claude-code", ago: 120 },
    });
    expect(await statusText(root)).toContain("huérfano: claude-code dio su último paso hace 2 h");
  });

  it("AC2: is not one whose state changed or that a conversation stepped in lately", async () => {
    const { root, folder } = await inWorktree();
    await stateWritten(folder, 5);
    expect((await changeFrom(root)).orphan).not.toBe(true);
    await stateWritten(folder, 120);
    await steppedBefore(root, folder, 30);
    const change = await changeFrom(root);
    expect(change.orphan).not.toBe(true);
    expect(change).toMatchObject({ holder: { tool: "claude-code", ago: 30 } });
  });

  it("AC2: is not one that waits for the person", async () => {
    const { root, folder } = await inWorktree();
    await writeFiles(folder, { [SPEC_PATH]: SPEC });
    expect((await cli(folder, ["propose"])).code).toBe(0);
    await stateWritten(folder, 120);
    const change = await changeFrom(root);
    expect(change).toMatchObject({ phase: "review", waitingFor: "human" });
    expect(change.orphan).not.toBe(true);
  });

  it("AC2: takes the minutes from memory.orphanAfterMin", async () => {
    const config = `${CONFIG()}memory:\n  orphanAfterMin: 30\n`;
    const { root, folder } = await inWorktree({ ...APP, ".specty/config.yaml": config });
    await steppedBefore(root, folder, 45);
    await stateWritten(folder, 45);
    expect(await changeFrom(root)).toMatchObject({
      orphan: true,
      holder: { tool: "claude-code", ago: 45 },
    });
  });
});

describe("the activity the guard notes", () => {
  it("AC3: is written once a minute while the conversation stays in the same folder", async () => {
    const { root, folder } = await inWorktree();
    await step(folder);
    const noted = JSON.parse(await read(root, ACTIVITY()));
    expect(noted).toEqual({
      tool: "claude-code",
      folder,
      first: NOW.toISOString(),
      last: NOW.toISOString(),
    });
    // Its last step half a minute ago: another step leaves it as it is.
    await writeFiles(root, { [ACTIVITY()]: JSON.stringify({ ...noted, last: before(0.5) }) });
    await step(folder);
    expect(JSON.parse(await read(root, ACTIVITY())).last).toBe(before(0.5));
    // Two minutes ago: the next step writes it again.
    await writeFiles(root, { [ACTIVITY()]: JSON.stringify({ ...noted, last: before(2) }) });
    await step(folder);
    expect(JSON.parse(await read(root, ACTIVITY()))).toEqual({
      ...noted,
      last: NOW.toISOString(),
    });
  });

  it("AC3: is written again as soon as the conversation moves to another folder", async () => {
    const { root, folder } = await inWorktree();
    await step(folder);
    await step(root);
    expect(JSON.parse(await read(root, ACTIVITY()))).toMatchObject({
      folder: root,
      first: NOW.toISOString(),
      last: NOW.toISOString(),
    });
  });
});
