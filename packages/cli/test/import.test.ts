// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP, cli, read, tempRepo } from "./support";

const DIR = "openspec/changes/add-2fa";

/** A repository with an OpenSpec change, an archived one and a folder that is none. */
const OPENSPEC = {
  ...APP,
  [`${DIR}/proposal.md`]: [
    "# Change: Add two-factor authentication",
    "",
    "## Why",
    "Accounts are taken over with leaked passwords.",
    "",
    "## What Changes",
    "- Add an OTP challenge after the password.",
    "",
    "## Impact",
    "- Affected code: `src/auth/`",
    "",
  ].join("\n"),
  [`${DIR}/tasks.md`]:
    "## 1. Implementation\n- [x] 1.1 Add the OTP column\n- [ ] 1.2 Ask for the code at login\n",
  [`${DIR}/design.md`]: "# Design\n\nTOTP with a 30 s window.\n",
  [`${DIR}/specs/auth/spec.md`]: [
    "## ADDED Requirements",
    "### Requirement: Two-factor login",
    "The system SHALL ask for a second factor.",
    "",
    "#### Scenario: OTP required",
    "- **WHEN** a user submits valid credentials",
    "- **THEN** an OTP challenge is required",
    "",
  ].join("\n"),
  "openspec/changes/archive/2026-01-01-old/proposal.md": "# Old\n",
  "openspec/changes/notes/readme.md": "Not a change.\n",
};

describe("specty import", () => {
  it("AC4: lists the OpenSpec changes to import, without the archive", async () => {
    const root = await tempRepo(OPENSPEC);
    const listed = await cli(root, ["import"]);
    expect(listed.code).toBe(0);
    expect(listed.out).toContain(`CAMBIOS DE OPENSPEC:\n  ${DIR}\nSIGUIENTE:`);
    const empty = await tempRepo(APP);
    expect((await cli(empty, ["import"])).out).toContain(
      "No hay cambios de OpenSpec que importar en openspec/changes/.",
    );
  });

  it("AC3: creates nothing for a missing folder or one without proposal.md", async () => {
    const root = await tempRepo(OPENSPEC);
    const missing = await cli(root, ["import", "openspec/changes/nada"]);
    expect(missing.code).not.toBe(0);
    expect(missing.out).toContain("No existe la carpeta openspec/changes/nada.");
    const notes = await cli(root, ["import", "openspec/changes/notes"]);
    expect(notes.out).toContain(
      "openspec/changes/notes no es un cambio de OpenSpec: le falta proposal.md.",
    );
    expect(existsSync(join(root, ".specty/changes"))).toBe(false);
  });

  it("AC1, AC2: creates a draft whose spec starts from the OpenSpec change, leaving the change as it was", async () => {
    const root = await tempRepo(OPENSPEC);
    const imported = await cli(root, ["import", DIR]);
    expect(imported.code, imported.out).toBe(0);
    expect(imported.out).toContain(`Importado de OpenSpec: ${DIR}.`);
    const id = /SPECTY · (\S+) · draft/.exec(imported.out)?.[1] ?? "";
    expect(id).toMatch(/-add-two-factor-authentication$/);
    const spec = await read(root, `.specty/changes/${id}/spec.md`);
    expect(spec).toContain("# Add two-factor authentication");
    expect(spec).toContain(
      "## Objetivo\n\nAccounts are taken over with leaked passwords.\n\n- Add an OTP challenge after the password.",
    );
    expect(spec).toContain(
      "## Criterios de aceptación\n\n- AC1: CUANDO a user submits valid credentials ENTONCES an OTP challenge is required",
    );
    expect(spec).toContain("- [ ] T1: Ask for the code at login");
    expect(spec).not.toContain("Add the OTP column\n## Tareas");
    expect(spec).toContain("**Hecho antes de importar:**\n\n- Add the OTP column");
    expect(spec).toContain("**Impact**\n\n- Affected code: `src/auth/`");
    expect(spec).toContain("## Supuestos\n\n<!--");
    expect(await read(root, `.specty/changes/${id}/audit.jsonl`)).toContain(
      `"request":"Importado de OpenSpec: ${DIR}"`,
    );
    for (const [path, text] of Object.entries(OPENSPEC)) {
      if (path.startsWith("openspec/")) expect(await read(root, path)).toBe(text);
    }
  });
});
