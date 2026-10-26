// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import { cli, git, read, tempRepo } from "./support";

const PACKAGE = { "package.json": '{"name":"x","scripts":{"test":"true"}}\n' };

describe("a reversible init", () => {
  it("only lists what it would create or change with --dry-run (AC1)", async () => {
    const root = await tempRepo(PACKAGE);
    const head = git(root, "rev-parse", "HEAD");
    const planned = await cli(root, [
      "init",
      "--language",
      "es",
      "--tools",
      "claude-code,cursor",
      "--dry-run",
    ]);
    expect(planned.code).toBe(0);
    expect(planned.out).toContain("SIMULACIÓN, NO SE HA ESCRITO NADA:");
    for (const line of [
      "crear .specty/config.yaml",
      "crear AGENTS.md",
      "crear CLAUDE.md",
      "crear .claude/settings.local.json",
      "crear .cursor/hooks.json",
      "crear .git/hooks/pre-commit",
      "crear .git/hooks/prepare-commit-msg",
      "cambiar .git/info/exclude",
    ]) {
      expect(planned.out).toContain(line);
    }
    expect(planned.out).toContain(
      "SIGUIENTE: ejecuta `specty init` sin `--dry-run` para aplicarlo.",
    );
    expect(git(root, "status", "--porcelain")).toBe("");
    expect(git(root, "rev-parse", "HEAD")).toBe(head);
    expect(await exists(join(root, ".git/hooks/pre-commit"))).toBe(false);
    expect(await read(root, ".git/info/exclude")).not.toContain("settings.local.json");
    // Once installed, a dry run finds nothing to change.
    await cli(root, ["init", "--language", "es", "--tools", "claude-code,cursor"]);
    const again = await cli(root, ["init", "--tools", "claude-code,cursor", "--dry-run"]);
    expect(again.out).toContain("Nada que cambiar.");
  });

  it("keeps a copy of each file it changes, and says where (AC2)", async () => {
    const root = await tempRepo({ ...PACKAGE, "AGENTS.md": "# App\n\nReglas mías.\n" });
    const installed = await cli(root, ["init", "--language", "es", "--tools", "claude-code"]);
    const folder = /Copia de lo que había antes: (.+)\.\n/.exec(installed.out)?.[1] ?? "";
    expect(folder).toContain(join(root, ".git"));
    expect(folder).toContain("/specty/backups/");
    expect(await readFile(join(folder, "repo/AGENTS.md"), "utf8")).toBe("# App\n\nReglas mías.\n");
    expect(await read(root, "AGENTS.md")).toContain("<!-- specty:begin id=flow -->");
    const manifest = JSON.parse(await readFile(join(folder, "manifest.json"), "utf8"));
    expect(manifest).toContainEqual({
      path: join(root, "AGENTS.md"),
      created: false,
      copy: "repo/AGENTS.md",
    });
    expect(manifest).toContainEqual({ path: join(root, "CLAUDE.md"), created: true });
  });

  it("makes no copy when every file it writes is new (AC3)", async () => {
    const root = await tempRepo(PACKAGE);
    // Copilot has no guard: init writes only new files, and no exclusion in `.git/info/exclude`.
    const installed = await cli(root, ["init", "--language", "es", "--tools", "copilot"]);
    expect(installed.code).toBe(0);
    expect(installed.out).not.toContain("Copia de lo que había antes");
    expect(await exists(join(root, ".git/common/specty/backups"))).toBe(false);
  });
});
