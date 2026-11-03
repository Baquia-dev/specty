// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP, cli, NOW, read, tempRepo, writeFiles } from "./support";

/** An agent that Specty recognizes: Claude Code. */
const CLAUDE = { env: { CLAUDECODE: "1" } };

/** Where the guard records who holds the front `name`. */
const HOLD = (name: string) => `.git/common/specty/fronts/${name}.json`;

/** `minutes` before NOW, as an ISO date. */
const before = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

/** Claude Code's hook before the conversation `session` runs `command` in `cwd`. */
const bash = (cwd: string, session: string, command: string) =>
  cli(cwd, ["guard", "--tool", "claude-code"], {
    stdin: JSON.stringify({
      cwd,
      session_id: session,
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command },
    }),
  });

/** Who the guard recorded as the owner of the front `name`. */
const holder = async (root: string, name: string) => JSON.parse(await read(root, HOLD(name)));

/** A repository whose memory has front B with P1, and front UI. */
async function withFronts(): Promise<string> {
  const root = await tempRepo(APP);
  const run = (...args: string[]) => cli(root, args, CLAUDE);
  expect((await run("memory", "add", "Uno")).code).toBe(0);
  expect((await run("front", "add", "B", "Guard.")).code).toBe(0);
  expect((await run("front", "add", "ui", "Servidor y UI.")).code).toBe(0);
  expect((await run("front", "assign", "B", "P1")).code).toBe(0);
  return root;
}

/** The conversation `s1` of Claude Code took front B and stepped last `minutes` before NOW. */
async function heldBefore(root: string, minutes: number): Promise<void> {
  const at = before(minutes);
  await writeFiles(root, {
    [HOLD("B")]: JSON.stringify({ front: "B", tool: "claude-code", conversation: "s1", at }),
    ".git/common/specty/activity/claude-code-s1.json": JSON.stringify({
      tool: "claude-code",
      folder: root,
      first: at,
      last: at,
    }),
  });
}

describe("the guard and who holds each front", () => {
  it("AC1: records the conversation that takes a front, which leaves the front it held", async () => {
    const root = await withFronts();
    expect((await bash(root, "s1", "specty front take b")).code).toBe(0);
    expect(await holder(root, "B")).toEqual({
      front: "B",
      tool: "claude-code",
      conversation: "s1",
      at: NOW.toISOString(),
    });
    expect((await cli(root, ["front"])).out).toContain(
      "FRENTE B:\n  Guard. · lo lleva claude-code, ahora mismo\n",
    );
    expect((await bash(root, "s1", "specty front take UI && specty next")).code).toBe(0);
    expect(existsSync(join(root, HOLD("B")))).toBe(false);
    expect(await holder(root, "ui")).toMatchObject({ front: "ui", conversation: "s1" });
  });

  it("AC2: another conversation cannot take or free a front with a live owner; its owner frees it", async () => {
    const root = await withFronts();
    expect((await bash(root, "s1", "specty front take B")).code).toBe(0);
    const take = await bash(root, "s2", "specty front take B");
    expect(take.code).toBe(2);
    expect(take.err).toContain(
      "El frente B ya tiene dueño: lo lleva claude-code, ahora mismo, en otra conversación.",
    );
    expect(take.err).toContain("pídele a la persona que lo libere en su terminal");
    const free = await bash(root, "s2", "specty front free b");
    expect(free.code).toBe(2);
    expect(free.err).toContain("solo esa conversación o la persona lo liberan");
    expect(await holder(root, "B")).toMatchObject({ conversation: "s1" });
    expect((await bash(root, "s1", "specty front free B")).code).toBe(0);
  });

  it("AC2: a front is free once its owner goes memory.orphanAfterMin without a step", async () => {
    const root = await withFronts();
    await heldBefore(root, 59);
    expect((await bash(root, "s2", "specty front take B")).code).toBe(2);
    await heldBefore(root, 61);
    expect((await bash(root, "s2", "specty front take B")).code).toBe(0);
    expect(await holder(root, "B")).toMatchObject({ tool: "claude-code", conversation: "s2" });
  });

  it("AC5: records no owner for a front that does not exist, and lets the command say so", async () => {
    const root = await withFronts();
    expect((await bash(root, "s1", "specty front take Z")).code).toBe(0);
    expect(existsSync(join(root, HOLD("Z")))).toBe(false);
    expect(existsSync(join(root, ".git/common/specty/fronts"))).toBe(false);
  });
});
