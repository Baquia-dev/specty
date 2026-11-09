// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import { git, released, tempRepo } from "./support";

const CODE = { "src/app.ts": "export const a = 1;\n" };

/** What `init` would write first: nothing of it may be there after a refusal. */
const WRITTEN = [".specty/config.yaml", ".claude", ".codex", ".opencode", "AGENTS.md"];

async function untouched(root: string): Promise<void> {
  for (const path of WRITTEN) expect(await exists(join(root, path)), path).toBe(false);
  expect(git(root, "status", "--porcelain")).toBe("");
  expect(git(root, "rev-list", "--count", "HEAD")).toBe("1");
}

describe("init --tools in this version", () => {
  it("AC3: refuses an agent this version does not offer, and writes nothing", async () => {
    const root = await tempRepo(CODE);
    const refused = await released(root, ["init", "--language", "es", "--tools", "codex"]);
    expect(refused.code).toBe(1);
    expect(refused.out).toContain(
      "Esta versión de Specty no ofrece `codex`: solo Claude Code y Antigravity. Los demás agentes llegarán más adelante.",
    );
    expect(refused.out).toContain(
      "SIGUIENTE: usa `--tools` con alguna de estas herramientas, separadas por comas: claude-code, antigravity.",
    );
    await untouched(root);
  });

  it("AC3: refuses in English the ones it does not offer among those it does, and an unknown one", async () => {
    const root = await tempRepo(CODE);
    const refused = await released(root, [
      "init",
      "--language",
      "en",
      "--tools",
      "claude-code, opencode,aider",
    ]);
    expect(refused.code).toBe(1);
    expect(refused.out).toContain(
      "This version of Specty does not offer `opencode`, `aider`: only Claude Code and Antigravity. The other agents will come later.",
    );
    expect(refused.out).toContain(
      "NEXT: use `--tools` with any of these tools, separated by commas: claude-code, antigravity.",
    );
    await untouched(root);
  });

  it("AC3: installs the two it offers when --tools names them", async () => {
    const root = await tempRepo(CODE);
    const done = await released(root, [
      "init",
      "--language",
      "es",
      "--tools",
      "claude-code,antigravity",
    ]);
    expect(done.code).toBe(0);
    expect(await exists(join(root, ".agents/hooks.json"))).toBe(true);
    expect(
      (await exists(join(root, ".claude/settings.json"))) ||
        (await exists(join(root, ".claude/settings.local.json"))),
    ).toBe(true);
  });
});
