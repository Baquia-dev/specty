// SPDX-License-Identifier: Apache-2.0
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHANGE, cli, inWorktree } from "./support";

/** An agent that Specty recognizes: Claude Code. */
const CLAUDE = { env: { CLAUDECODE: "1" } };

const HEADING = "specty: mensajes de otras sesiones (no son avisos del guard):";

/** Claude Code's hook after a shell command of conversation `s1` in `folder`. */
const after = (folder: string, id: string) =>
  cli(folder, ["guard", "--tool", "claude-code"], {
    stdin: JSON.stringify({
      session_id: "s1",
      cwd: folder,
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: { command: "ls" },
      tool_use_id: id,
    }),
  });

/** Cursor's hook after a shell command of conversation `c` in `folder`. */
const cursorAfter = (folder: string, id: string) =>
  cli(folder, ["guard", "--tool", "cursor"], {
    stdin: JSON.stringify({
      hook_event_name: "postToolUse",
      conversation_id: "c",
      workspace_roots: [folder],
      cwd: folder,
      tool_name: "Shell",
      tool_input: { command: "ls" },
      tool_use_id: id,
    }),
  });

const left = async (root: string) =>
  (await readdir(join(root, ".git/common/specty/messages", CHANGE)).catch(() => [])).filter(
    (name) => name.endsWith(".json"),
  );

describe("the messages reach the session of the change", () => {
  it("AC2: after its next shell command, once, with who left them, when and how to reply", async () => {
    const { root, folder } = await inWorktree();
    expect(
      (await cli(root, ["message", CHANGE, "Mira lock.ts antes de seguir."], CLAUDE)).code,
    ).toBe(0);
    expect((await cli(root, ["message", CHANGE, "Y trae main."], CLAUDE)).code).toBe(0);
    // A session in another folder does not take them.
    const elsewhere = await after(root, "t0");
    expect(elsewhere.code).toBe(0);
    expect(elsewhere.err).not.toContain(HEADING);
    const got = await after(folder, "t1");
    expect(got.code).toBe(2);
    expect(got.err).toContain(HEADING);
    expect(got.err).toMatch(
      / {2}\d\d:\d\d UTC · de una sesión en .+ \(claude-code\): «Mira lock\.ts antes de seguir\.»/,
    );
    expect(got.err.indexOf("«Mira lock.ts")).toBeLessThan(got.err.indexOf("«Y trae main.»"));
    expect(await left(root)).toEqual([]);
    const again = await after(folder, "t2");
    expect(again.code).toBe(0);
    expect(again.err).not.toContain(HEADING);
  });

  it("AC2: reaches another agent's session in its own form, as Cursor's context after a command", async () => {
    const { root, folder } = await inWorktree();
    expect((await cli(root, ["message", CHANGE, "Hola desde la principal."], CLAUDE)).code).toBe(0);
    const got = await cursorAfter(folder, "t1");
    expect(got.code).toBe(0);
    const context = String(JSON.parse(got.out).additional_context);
    expect(context).toContain(HEADING);
    expect(context).toContain("«Hola desde la principal.»");
    expect(JSON.parse((await cursorAfter(folder, "t2")).out)).toEqual({});
  });
});
