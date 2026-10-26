// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  changeInProgressWarning,
  claudePermissionsLine,
  claudePointerLine,
  codexGuardLine,
  codexRulesLine,
  codexTrustWarning,
  gitHooksLine,
  gitHooksManualWarning,
  guardLine,
  installCommitLine,
  installCommitSubject,
  noHooksWarning,
  notOnPathWarning,
  opencodeGuardLine,
  yoursUncommittedWarning,
} from "../../src";

describe("what `init` says about the hooks", () => {
  it("names where each agent tool's guard went", () => {
    expect(claudePointerLine("es")).toBe("CLAUDE.md importa AGENTS.md.");
    expect(guardLine("Claude Code", ".claude/settings.json", false, "es")).toBe(
      "Claude Code: guard en .claude/settings.json.",
    );
    expect(guardLine("Cursor", ".cursor/hooks.json", true, "en")).toBe(
      "Cursor: guard in .cursor/hooks.json (local).",
    );
    expect(codexGuardLine(".codex/hooks.json", false, "en")).toBe(
      "Codex: guard in .codex/hooks.json; since Codex 0.131 it serves every worktree of the repository.",
    );
    expect(codexGuardLine(".codex/hooks.json", true, "es")).toBe(
      "Codex: guard en .codex/hooks.json (local); desde Codex 0.131 sirve a todas las worktrees del repositorio.",
    );
    expect(codexTrustWarning("es")).toBe(
      "Codex solo ejecuta el guard cuando confías en el proyecto y en el hook: confía en el proyecto cuando Codex lo pregunte y revisa el hook con `/hooks`. Basta una vez por repositorio.",
    );
    expect(opencodeGuardLine(".opencode/plugins/specty.js", false, "es")).toBe(
      "OpenCode: plugin del guard en .opencode/plugins/specty.js.",
    );
    expect(opencodeGuardLine(".opencode/plugins/specty.js", true, "en")).toBe(
      "OpenCode: guard plugin in .opencode/plugins/specty.js (local).",
    );
    expect(noHooksWarning(["Aider", "Zed"], "en")).toBe(
      "No hooks yet for: Aider, Zed. Git hooks and CI still protect them.",
    );
  });

  it("names the permission rules that leave the person's commands to Specty", () => {
    expect(claudePermissionsLine("specty", ".claude/settings.json", false, "es")).toBe(
      "Claude Code: permisos en .claude/settings.json para que el agente ejecute `specty approve`, `accept`, `close`, `cancel` y `reject` sin el veto de Claude Code; Specty se los bloquea salvo en modo delegado.",
    );
    expect(claudePermissionsLine("specty", ".claude/settings.local.json", true, "en")).toBe(
      "Claude Code: permissions in .claude/settings.local.json (local) so the agent runs `specty approve`, `accept`, `close`, `cancel` and `reject` without Claude Code's veto; Specty blocks them except in delegated mode.",
    );
    expect(codexRulesLine(".codex/rules/specty.rules", "es")).toBe(
      "Codex: regla en .codex/rules/specty.rules para que los comandos de Specty se ejecuten sin preguntar y fuera del sandbox, que deja `.git` en solo lectura; Specty decide quién ejecuta cada uno.",
    );
    expect(codexRulesLine(".codex/rules/specty.rules", "en")).toBe(
      "Codex: rule in .codex/rules/specty.rules so Specty's commands run without asking and outside the sandbox, which keeps `.git` read-only; Specty decides who runs each one.",
    );
  });

  it("says how git's hooks went in, and what is left to the person", () => {
    expect(gitHooksLine("husky", "es")).toBe("Git: hooks pre-commit y prepare-commit-msg (husky).");
    expect(
      gitHooksManualWarning("simple-git-hooks", '"pre-commit": "specty hook pre-commit"', "en"),
    ).toBe('Add to the simple-git-hooks configuration: "pre-commit": "specty hook pre-commit"');
    expect(notOnPathWarning("specty", "es")).toBe(
      "`specty` no está en el PATH: los hooks usan la ruta de este script. Instálalo con `npm i -g @baquia-dev/specty` para que funcionen en cualquier máquina.",
    );
  });
});

describe("the commit of `init`", () => {
  it("is held back by a change in progress, and leaves out the person's files", () => {
    expect(changeInProgressWarning("20261020-saludo", "specty", "en")).toBe(
      "This folder has a change in progress (20261020-saludo): Specty's files stay uncommitted. Run `specty init` in the main folder.",
    );
    expect(yoursUncommittedWarning(["AGENTS.md"], "es")).toBe(
      "Ya tenían cambios tuyos y quedan sin commit: AGENTS.md.",
    );
  });

  it("installs or updates, and names its files", () => {
    expect(installCommitSubject(true, "es")).toBe("chore(specty): instalar Specty");
    expect(installCommitSubject(false, "en")).toBe("chore(specty): update Specty's installation");
    expect(installCommitLine("a1b2c3d", [".specty/config.yaml", "AGENTS.md"], "es")).toBe(
      "Commit a1b2c3d: .specty/config.yaml, AGENTS.md.",
    );
  });
});
