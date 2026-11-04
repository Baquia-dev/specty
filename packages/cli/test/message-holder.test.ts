// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CHANGE, cli, inWorktree, NOW, writeFiles } from "./support";

/** An agent that Specty recognizes: Claude Code. */
const CLAUDE = { env: { CLAUDECODE: "1" } };

const MINUTE = 60_000;

/** `minutes` before NOW, as an ISO date. */
const before = (minutes: number) => new Date(NOW.getTime() - minutes * MINUTE).toISOString();

/** A conversation of `tool` last stepped in `folder` `minutes` before NOW. */
const stepped = (root: string, folder: string, minutes: number, tool = "claude-code") =>
  writeFiles(root, {
    [`.git/common/specty/activity/${tool}-s1.json`]: JSON.stringify({
      tool,
      folder,
      first: before(minutes + 10),
      last: before(minutes),
    }),
  });

const NOBODY = "Ahora ninguna sesión trabaja en ese cambio: le llegará a la que lo retome.";

describe("who gets a message, when it is left", () => {
  it("AC1: names the agent that stepped lately in the change's folder", async () => {
    const { root, folder } = await inWorktree();
    await stepped(root, folder, 2, "codex");
    const left = await cli(root, ["message", CHANGE, "Trae main."], CLAUDE);
    expect(left.code).toBe(0);
    expect(left.out).toContain("Ahora lo lleva codex: dio su último paso hace 2 min.");
    expect(left.out).not.toContain(NOBODY);
  });

  it("AC2: says nobody works on it when no session stepped there lately, or ever", async () => {
    const { root, folder } = await inWorktree();
    const never = await cli(root, ["message", CHANGE, "Trae main."], CLAUDE);
    expect(never.code).toBe(0);
    expect(never.out).toContain(NOBODY);
    await stepped(root, folder, 120);
    const long = await cli(root, ["message", CHANGE, "Otra cosa."], CLAUDE);
    expect(long.out).toContain(NOBODY);
    expect(long.out).not.toContain("Ahora lo lleva");
  });
});

describe("the messages waiting, in `specty status`", () => {
  it("AC3: counts them in the change's line and in `--json`, and says nothing without any", async () => {
    const { root } = await inWorktree();
    const none = await cli(root, ["status"]);
    expect(none.out).not.toContain("mensaje");
    const quiet = JSON.parse((await cli(root, ["--json", "status"])).out).changes[0];
    expect(quiet).not.toHaveProperty("messages");
    await cli(root, ["message", CHANGE, "Uno."], CLAUDE);
    expect((await cli(root, ["status"])).out).toContain("· 1 mensaje espera");
    await cli(root, ["message", CHANGE, "Dos."], CLAUDE);
    expect((await cli(root, ["status"])).out).toContain("· 2 mensajes esperan");
    const counted = JSON.parse((await cli(root, ["--json", "status"])).out).changes[0];
    expect(counted).toMatchObject({ id: CHANGE, messages: 2 });
  });
});
