// SPDX-License-Identifier: Apache-2.0
import { utimes } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP, CHANGE, cli, folderOf, NOW, person, tempRepo, writeFiles } from "./support";

const EPIC = CHANGE.replace("saludo-personalizado", "panel");
const EPIC_SPEC = `---
kind: epic
---

# Panel

## Objetivo

El estudiante ve su progreso.

## Fuera de alcance

- Exportarlo.

## Supuestos

- A1: El progreso ya se guarda.

## Criterios de aceptación

- AC1: CUANDO el estudiante inicia sesión ENTONCES llega a su panel.

## Cortes

- C1: Inicio
  - ac: AC1
`;

/** Specty's worktree hooks for Claude Code, which let it enter a change's folder by name. */
const WORKTREE_HOOKS = JSON.stringify({
  hooks: Object.fromEntries(
    ["WorktreeCreate", "WorktreeRemove"].map((event) => [
      event,
      [{ hooks: [{ type: "command", command: "specty guard --tool claude-code" }] }],
    ]),
  ),
});

/** An approved epic in its own folder, whose state was last written two hours before NOW. */
async function orphanEpic(root: string): Promise<string> {
  expect((await cli(root, ["new", "--worktree", "--kind", "epic", "Panel"])).code).toBe(0);
  const epic = folderOf(root, EPIC);
  await writeFiles(epic, { [`.specty/changes/${EPIC}/spec.md`]: EPIC_SPEC });
  expect((await cli(epic, ["propose"])).code).toBe(0);
  expect((await cli(epic, ["approve"], { terminal: person() })).code).toBe(0);
  const at = new Date(NOW.getTime() - 120 * 60_000);
  await utimes(join(epic, `.specty/changes/${EPIC}/state.json`), at, at);
  return epic;
}

describe("an approved epic no conversation holds", () => {
  it("AC1: Claude Code's `next` in the main folder marks it and leaves it to the session", async () => {
    const root = await tempRepo(APP);
    await writeFiles(root, { ".claude/settings.local.json": WORKTREE_HOOKS });
    await orphanEpic(root);
    const next = await cli(root, ["next"], {
      env: { CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: "s1" },
    });
    expect(next.code).toBe(0);
    expect(next.out).toContain(
      [
        "CAMBIOS SIN CONVERSACIÓN:",
        `  ${EPIC} · implementing · épica — Panel · en .worktrees/${EPIC}`,
        '  Una épica no va a un subagente, que no podría lanzar los subagentes de sus cortes: si el usuario pide seguirla, retómala tú en su carpeta en lugar de crear otro cambio, cuando terminen los subagentes que estén trabajando: en Claude Code, `EnterWorktree` con `name: "<id>"`.',
      ].join("\n"),
    );
    expect(next.out).not.toContain("ENCARGO PARA RETOMAR");
    expect(next.out).not.toContain("lanza un subagente con el encargo para retomarlo");
  });
});
