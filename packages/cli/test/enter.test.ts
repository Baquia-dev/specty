// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP, CHANGE, cli, folderOf, person, SPEC_PATH, tempRepo, writeFiles } from "./support";

const OTHER = CHANGE.replace("saludo-personalizado", "otro-cambio");
const EPIC = CHANGE.replace("saludo-personalizado", "panel");
const SLICE = CHANGE.replace("saludo-personalizado", "inicio");

/** Codex's hook before a tool call of the conversation `session`, with the tool working in `cwd`. */
const codex = (cwd: string, session: string, tool: Record<string, unknown>) =>
  cli(cwd, ["guard", "--tool", "codex"], {
    stdin: JSON.stringify({ cwd, session_id: session, hook_event_name: "PreToolUse", ...tool }),
  });

const bash = (cwd: string, session: string, command: string) =>
  codex(cwd, session, { tool_name: "Bash", tool_input: { command } });

/** Codex's `apply_patch` adding `path`. */
const add = (cwd: string, session: string, path: string) =>
  codex(cwd, session, {
    tool_name: "apply_patch",
    tool_input: {
      command: ["*** Begin Patch", `*** Add File: ${path}`, "+x", "*** End Patch"].join("\n"),
    },
  });

/** A repository with two open changes, each in its own folder. */
async function twoChanges() {
  const root = await tempRepo(APP);
  expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
  expect((await cli(root, ["new", "--worktree", "Otro cambio"])).code).toBe(0);
  return { root, first: folderOf(root), second: folderOf(root, OTHER) };
}

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

describe("specty enter, as the guard judges it", () => {
  it("binds the conversation to the change's folder, one open change at a time (AC1)", async () => {
    const { root, first, second } = await twoChanges();
    expect((await bash(root, "s1", `specty enter ${CHANGE}`)).code).toBe(0);
    expect((await bash(first, "s1", `specty enter ${CHANGE}`)).code).toBe(0);
    const denied = await bash(root, "s1", `specty enter ${OTHER}`);
    expect(denied.code).toBe(2);
    expect(denied.err).toContain(
      `Esta sesión trabaja en \`${first}\` (cambio ${CHANGE}, aún abierto): una sesión trabaja un solo cambio a la vez.`,
    );
    expect(denied.err).toContain(`abre otra sesión en \`${second}\` para trabajar en ese.`);
    // Another conversation is free; a change without a folder binds nothing (the command says so).
    expect((await bash(root, "s2", `specty enter ${OTHER}`)).code).toBe(0);
    expect((await bash(root, "s3", "specty enter 20260101-sin-carpeta")).code).toBe(0);
    expect((await bash(root, "s3", "pnpm test")).code).toBe(0);
  });

  it("lets the conversation of an epic enter its slices", async () => {
    const root = await tempRepo(APP);
    expect((await cli(root, ["new", "--worktree", "--kind", "epic", "Panel"])).code).toBe(0);
    const epic = folderOf(root, EPIC);
    await writeFiles(epic, { [`.specty/changes/${EPIC}/spec.md`]: EPIC_SPEC });
    expect((await cli(epic, ["propose"])).code).toBe(0);
    expect((await cli(epic, ["approve"], { terminal: person() })).code).toBe(0);
    expect((await bash(root, "s1", `specty enter ${EPIC}`)).code).toBe(0);
    const slice = ["new", "--worktree", "Inicio", "--epic", EPIC, "--slice", "C1"];
    expect((await cli(epic, slice)).code).toBe(0);
    expect((await bash(root, "s1", `specty enter ${SLICE}`)).code).toBe(0);
    expect((await bash(root, "s1", `specty enter ${EPIC}`)).code).toBe(2);
  });

  it("blocks a file outside the change's folder with the same path inside it (AC3)", async () => {
    const { root, first, second } = await twoChanges();
    await bash(root, "s1", `specty enter ${CHANGE}`);
    for (const path of ["src/nuevo.ts", join(root, "src/nuevo.ts"), join(second, "src/nuevo.ts")]) {
      const denied = await add(root, "s1", path);
      expect(denied.code).toBe(2);
      expect(denied.err).toContain("está fuera de la carpeta en la que trabaja esta conversación.");
      expect(denied.err).toContain(
        `SIGUIENTE: usa la misma ruta dentro de ella: \`${join(first, "src/nuevo.ts")}\`.`,
      );
    }
    // Inside it, its change's rules judge: the spec is open while drafted, the code is not yet.
    expect((await add(root, "s1", join(first, SPEC_PATH))).code).toBe(0);
    const code = await add(root, "s1", join(first, "src/nuevo.ts"));
    expect(code.err).toContain(`El cambio ${CHANGE} está en fase`);
  });

  it("blocks a command that would run outside the change's folder, with how to run it there (AC4)", async () => {
    const { root, first } = await twoChanges();
    await bash(root, "s1", `specty enter ${CHANGE}`);
    const denied = await bash(root, "s1", "pnpm test");
    expect(denied.code).toBe(2);
    expect(denied.err).toContain(
      `Esta conversación trabaja en \`${first}\`: este comando correría fuera de esa carpeta.`,
    );
    expect(denied.err).toContain(`SIGUIENTE: ejecútalo allí: \`cd '${first}' && pnpm test\`.`);
    expect((await bash(root, "s1", `cd '${first}' && pnpm test`)).code).toBe(0);
    expect((await bash(first, "s1", "pnpm test")).code).toBe(0);
    expect((await bash(first, "s1", `cd '${root}' && ls`)).code).toBe(2);
    // There, its change's rules judge the command.
    const code = await bash(first, "s1", "echo x > src/app.ts");
    expect(code.err).toContain(`El cambio ${CHANGE} está en fase`);
  });

  it("tells Claude Code to enter with EnterWorktree, and leaves its sessions as they were (AC5)", async () => {
    const { root } = await twoChanges();
    const claude = (tool: Record<string, unknown>) =>
      cli(root, ["guard", "--tool", "claude-code"], {
        stdin: JSON.stringify({
          cwd: root,
          session_id: "s1",
          hook_event_name: "PreToolUse",
          ...tool,
        }),
      });
    const denied = await claude({
      tool_name: "Bash",
      tool_input: { command: `specty enter ${CHANGE}` },
    });
    expect(denied.code).toBe(2);
    expect(denied.err).toContain(
      "Claude Code entra en la carpeta de un cambio con su propia herramienta, que lleva allí toda la sesión.",
    );
    expect(denied.err).toContain(`SIGUIENTE: usa \`EnterWorktree\` con \`name: "${CHANGE}"\`.`);
    // After `ExitWorktree` its session is back in the main folder, and works there.
    expect((await claude({ tool_name: "EnterWorktree", tool_input: { name: CHANGE } })).code).toBe(
      0,
    );
    const written = await claude({
      tool_name: "Write",
      tool_input: { file_path: join(root, "src/app.ts") },
    });
    expect(written.err).toContain("No hay un cambio activo y `src/app.ts` es código gobernado");
  });
});
