// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { cli, inWorktree, NOW, SPEC, SPEC_PATH, writeFiles } from "./support";

const MINUTE = 60_000;

/** `minutes` before NOW, as an ISO date. */
const before = (minutes: number) => new Date(NOW.getTime() - minutes * MINUTE).toISOString();

/** Conversation `session` is bound to `folder`, as the guard writes it when it enters. */
const bound = (root: string, folder: string, session = "s1") =>
  writeFiles(root, {
    [`.git/common/specty/sessions/${session}.json`]: JSON.stringify({ folder, at: before(30) }),
  });

/** Conversation `session` of `tool` last stepped in `folder` `minutes` before NOW. */
const stepped = (
  root: string,
  folder: string,
  minutes: number,
  { session = "s1", tool = "claude-code" } = {},
) =>
  writeFiles(root, {
    [`.git/common/specty/activity/${tool}-${session}.json`]: JSON.stringify({
      tool,
      folder,
      first: before(minutes + 10),
      last: before(minutes),
    }),
  });

/** The open change as `specty --json status` gives it from `cwd`. */
const changeFrom = async (cwd: string) =>
  JSON.parse((await cli(cwd, ["--json", "status"])).out).changes[0];

const statusText = async (cwd: string) => (await cli(cwd, ["status"])).out;

const AWAY = "fuera de su carpeta";

describe("a change whose conversation stepped last in another folder", () => {
  it("AC1: `status` says so in its line, with the agent, how long ago and how to go back", async () => {
    const { root, folder } = await inWorktree();
    await bound(root, folder);
    await stepped(root, root, 5);
    expect(await statusText(root)).toContain(
      "fuera de su carpeta: claude-code dio su último paso en otra carpeta hace 5 min; en esa conversación, `specty next` dice cómo volver",
    );
    expect(await changeFrom(root)).toMatchObject({ away: { tool: "claude-code", ago: 5 } });
    expect(await statusText(folder)).toContain(AWAY);
  });

  it("AC1: as the guard notes it, when the conversation enters its folder and then steps outside", async () => {
    const { root, folder } = await inWorktree();
    const guard = (cwd: string, tool_name: string, tool_input: Record<string, unknown>) =>
      cli(cwd, ["guard", "--tool", "claude-code"], {
        stdin: JSON.stringify({
          cwd,
          session_id: "s1",
          hook_event_name: "PreToolUse",
          tool_name,
          tool_input,
        }),
      });
    expect((await guard(root, "EnterWorktree", { path: folder })).code).toBe(0);
    expect((await guard(root, "Bash", { command: "ls" })).code).toBe(0);
    expect(await changeFrom(root)).toMatchObject({ away: { tool: "claude-code", ago: 0 } });
    expect(await statusText(root)).toContain(
      "fuera de su carpeta: claude-code dio su último paso en otra carpeta ahora mismo",
    );
  });
});

describe("a change someone works in", () => {
  it("AC2: is not outside its folder once its conversation steps there again", async () => {
    const { root, folder } = await inWorktree();
    await bound(root, folder);
    await stepped(root, folder, 2);
    const change = await changeFrom(root);
    expect(change).not.toHaveProperty("away");
    expect(change).toMatchObject({ holder: { tool: "claude-code", ago: 2 } });
    const text = await statusText(root);
    expect(text).not.toContain(AWAY);
    expect(text).toContain("lo lleva claude-code, hace 2 min");
  });

  it("AC2: is not outside its folder while another conversation steps there", async () => {
    const { root, folder } = await inWorktree();
    await bound(root, folder);
    await stepped(root, root, 5);
    await stepped(root, folder, 3, { session: "s2", tool: "codex" });
    expect(await changeFrom(root)).not.toHaveProperty("away");
    const text = await statusText(root);
    expect(text).not.toContain(AWAY);
    expect(text).toContain("lo lleva codex, hace 3 min");
  });
});

describe("a change that is not marked outside its folder", () => {
  it("AC3: when its conversation's last step elsewhere is older than memory.orphanAfterMin", async () => {
    const { root, folder } = await inWorktree();
    await bound(root, folder);
    await stepped(root, root, 120);
    expect(await changeFrom(root)).not.toHaveProperty("away");
    expect(await statusText(root)).not.toContain(AWAY);
  });

  it("AC3: when it waits for the person", async () => {
    const { root, folder } = await inWorktree();
    await writeFiles(folder, { [SPEC_PATH]: SPEC });
    expect((await cli(folder, ["propose"])).code).toBe(0);
    await bound(root, folder);
    await stepped(root, root, 5);
    const change = await changeFrom(root);
    expect(change).toMatchObject({ waitingFor: "human" });
    expect(change).not.toHaveProperty("away");
    expect(await statusText(root)).not.toContain(AWAY);
  });
});
