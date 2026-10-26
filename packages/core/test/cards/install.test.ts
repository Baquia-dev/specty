// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  changeInProgressWarning,
  claudePointerLine,
  codexGuardLine,
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
    expect(codexGuardLine("~/.codex/hooks.json", "en")).toBe(
      "Codex: guard in ~/.codex/hooks.json, your user configuration: it applies to all your repositories and does nothing outside those using Specty.",
    );
    expect(codexTrustWarning("es")).toMatch(/^Codex solo ejecuta el guard cuando confías en él/);
    expect(opencodeGuardLine("~/.config/opencode/plugins/specty.js", "es")).toBe(
      "OpenCode: plugin del guard en ~/.config/opencode/plugins/specty.js, tu configuración global: vale para todos tus repositorios y fuera de los que usan Specty no hace nada.",
    );
    expect(noHooksWarning(["Aider", "Zed"], "en")).toBe(
      "No hooks yet for: Aider, Zed. Git hooks and CI still protect them.",
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
