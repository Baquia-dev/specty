// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import { cli, git, person, read, tempRepo, writeFiles } from "./support";

const MINE = {
  permissions: { allow: ["Bash(npm test)"] },
  hooks: { PreToolUse: [{ matcher: "Write", hooks: [{ type: "command", command: "echo mine" }] }] },
};

/** A repository of a person with their own rules and hooks, where `init` then installed Specty. */
async function installed(files: Record<string, string> = {}): Promise<string> {
  const root = await tempRepo({
    "package.json": '{"name":"x","scripts":{"test":"true"}}\n',
    "AGENTS.md": "# App\n\nReglas mías.\n",
    ...files,
  });
  await writeFiles(root, { ".claude/settings.local.json": `${JSON.stringify(MINE, null, 2)}\n` });
  const init = await cli(root, ["init", "--language", "es", "--tools", "claude-code,cursor"]);
  expect(init.code).toBe(0);
  return root;
}

const snapshot = async (root: string) =>
  Promise.all(
    ["AGENTS.md", ".claude/settings.local.json", ".cursor/hooks.json", ".git/hooks/pre-commit"].map(
      (path) => read(root, path),
    ),
  );

describe("specty uninstall", () => {
  it("lists what it would remove with --dry-run, without asking or touching anything (AC5)", async () => {
    const root = await installed();
    const before = await snapshot(root);
    const planned = await cli(root, ["uninstall", "--dry-run"]);
    expect(planned.code).toBe(0);
    for (const line of [
      "SE QUITARÍA:",
      "quitar lo de Specty de AGENTS.md",
      "quitar lo de Specty de .claude/settings.local.json",
      "borrar .cursor/hooks.json",
      "borrar .git/hooks/pre-commit",
      "borrar .git/hooks/prepare-commit-msg",
    ]) {
      expect(planned.out).toContain(line);
    }
    expect(await snapshot(root)).toEqual(before);
  });

  it("is for a person at a terminal, and changes nothing if they say no (AC3, AC4)", async () => {
    const root = await installed();
    const before = await snapshot(root);
    const agent = await cli(root, ["uninstall"]);
    expect(agent.code).toBe(2);
    expect(agent.out).toContain("`specty uninstall` lo ejecuta una persona en su terminal");
    const guarded = await cli(root, ["guard", "--tool", "claude-code"], {
      stdin: JSON.stringify({
        cwd: root,
        tool_name: "Bash",
        tool_input: { command: "specty uninstall" },
      }),
    });
    expect(guarded.code).toBe(2);
    const declined = await cli(root, ["uninstall"], { terminal: person({ choose: ["no"] }) });
    expect(declined.out).toContain("No se ha quitado nada.");
    expect(await snapshot(root)).toEqual(before);
  });

  it("removes what init installed and keeps the rest of each file (AC1, AC2, AC6)", async () => {
    const root = await installed();
    const terminal = person({ choose: ["yes"] });
    const removed = await cli(root, ["uninstall"], { terminal });
    expect(removed.code).toBe(0);
    expect(terminal.notes[0]).toContain("borrar .cursor/hooks.json");
    expect(await read(root, "AGENTS.md")).toBe("# App\n\nReglas mías.\n");
    expect(JSON.parse(await read(root, ".claude/settings.local.json"))).toEqual(MINE);
    for (const gone of [
      ".cursor/hooks.json",
      ".git/hooks/pre-commit",
      ".git/hooks/prepare-commit-msg",
    ]) {
      expect(await exists(`${root}/${gone}`), gone).toBe(false);
    }
    expect(await exists(`${root}/.specty/config.yaml`)).toBe(true);
    for (const line of [
      "QUITADO:",
      "SE QUEDA:",
      "`.specty/`: el historial de specs y auditoría",
      "CLAUDE.md sigue importando AGENTS.md.",
      "Copia de lo que había antes: ",
      "SIGUIENTE: revisa los cambios con `git status` y haz commit cuando quieras",
    ]) {
      expect(removed.out).toContain(line);
    }
    // No commit: the changes wait for the person, and nothing is left to remove.
    expect(git(root, "status", "--porcelain")).toContain("AGENTS.md");
    const again = await cli(root, ["uninstall", "--dry-run"]);
    expect(again.out).toContain("No hay nada de Specty que quitar en este repositorio.");
  });

  it("takes the Codex guard and the OpenCode plugin out of the project, keeping the person's hooks (AC7, AC9)", async () => {
    const homes = {
      CODEX_HOME: await mkdtemp(join(tmpdir(), "specty-codex-home-")),
      XDG_CONFIG_HOME: await mkdtemp(join(tmpdir(), "specty-config-")),
    };
    const root = await tempRepo({ "package.json": '{"name":"x","scripts":{"test":"true"}}\n' });
    const stop = { hooks: [{ type: "command", command: "echo bye" }] };
    await writeFiles(root, {
      ".codex/hooks.json": JSON.stringify({ hooks: { Stop: [stop] } }),
      ".codex/rules/mine.rules": 'prefix_rule(pattern = ["make"])\n',
    });
    const init = await cli(root, ["init", "--language", "es", "--tools", "codex,opencode"], {
      env: homes,
    });
    expect(init.code).toBe(0);
    const planned = await cli(root, ["uninstall", "--dry-run"], { env: homes });
    expect(planned.out).toContain("quitar lo de Specty de .codex/hooks.json");
    expect(planned.out).toContain("borrar .opencode/plugins/specty.js");
    expect(planned.out).toContain("borrar .codex/rules/specty.rules");
    const terminal = person({ choose: ["yes"] });
    expect((await cli(root, ["uninstall"], { env: homes, terminal })).code).toBe(0);
    expect(JSON.parse(await read(root, ".codex/hooks.json"))).toEqual({ hooks: { Stop: [stop] } });
    expect(await exists(join(root, ".opencode/plugins/specty.js"))).toBe(false);
    // Specty's rule goes, and the person's rules stay (AC6).
    expect(await exists(join(root, ".codex/rules/specty.rules"))).toBe(false);
    expect(await read(root, ".codex/rules/mine.rules")).toBe('prefix_rule(pattern = ["make"])\n');
    for (const home of Object.values(homes)) expect(await readdir(home), home).toEqual([]);
  });

  it("takes its part out of husky and lefthook hooks, keeping the person's (AC1, AC2)", async () => {
    const husky = await installed({ ".husky/pre-commit": "npm test\n" });
    await cli(husky, ["uninstall"], { terminal: person({ choose: ["yes"] }) });
    expect(await read(husky, ".husky/pre-commit")).toBe("npm test\n");
    expect(await exists(`${husky}/.husky/prepare-commit-msg`)).toBe(false);
    const lefthook = await installed({
      "lefthook.yml": "pre-commit:\n  commands:\n    lint:\n      run: npm run lint\n",
    });
    expect(await read(lefthook, "lefthook.yml")).toContain("hook pre-commit");
    await cli(lefthook, ["uninstall"], { terminal: person({ choose: ["yes"] }) });
    expect(await read(lefthook, "lefthook.yml")).toBe(
      "pre-commit:\n  commands:\n    lint:\n      run: npm run lint\n",
    );
  });
});
