// SPDX-License-Identifier: Apache-2.0
import { utimes } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APP,
  CHANGE,
  CONFIG,
  cli,
  folderOf,
  inWorktree,
  NOW,
  person,
  read,
  tempRepo,
  writeFiles,
} from "./support";

const EPIC = CHANGE.replace("saludo-personalizado", "panel");
const SLICE = CHANGE.replace("saludo-personalizado", "inicio");
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

/** What Claude Code tells the commands that conversation `session` runs. */
const claude = (session = "s1") => ({ CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: session });

/** Claude Code's hook before `EnterWorktree` into `path`, run from `cwd`, for `session`. */
const enter = (cwd: string, path: string, session = "s1") =>
  cli(cwd, ["guard", "--tool", "claude-code"], {
    stdin: JSON.stringify({
      cwd,
      tool_name: "EnterWorktree",
      tool_input: { path },
      session_id: session,
    }),
  });

/** Where the guard keeps the folder conversation `session` works in. */
const BINDING = (session: string) => `.git/common/specty/sessions/${session}.json`;

const boundFolder = async (root: string, session = "s1"): Promise<string> =>
  JSON.parse(await read(root, BINDING(session))).folder;

/** Specty's worktree hooks for Claude Code, which let it enter a change's folder by name. */
const WORKTREE_HOOKS = JSON.stringify({
  hooks: Object.fromEntries(
    ["WorktreeCreate", "WorktreeRemove"].map((event) => [
      event,
      [{ hooks: [{ type: "command", command: "specty guard --tool claude-code" }] }],
    ]),
  ),
});

/** The change's `state.json` was last written `minutes` before NOW. */
async function stateWritten(folder: string, minutes: number): Promise<void> {
  const at = new Date(NOW.getTime() - minutes * 60_000);
  await utimes(join(folder, `.specty/changes/${CHANGE}/state.json`), at, at);
}

/** An approved epic in its own folder, and that folder. */
async function approvedEpic(root: string): Promise<string> {
  expect((await cli(root, ["new", "--worktree", "--kind", "epic", "Panel"])).code).toBe(0);
  const epic = folderOf(root, EPIC);
  await writeFiles(epic, { [`.specty/changes/${EPIC}/spec.md`]: EPIC_SPEC });
  expect((await cli(epic, ["propose"])).code).toBe(0);
  expect((await cli(epic, ["approve"], { terminal: person() })).code).toBe(0);
  return epic;
}

describe("a conversation outside its change's folder", () => {
  it("AC1: `next` in the main folder names its change and folder and asks it to go back", async () => {
    const { root, folder } = await inWorktree();
    expect((await enter(root, folder)).code).toBe(0);
    const next = await cli(root, ["next"], { env: claude() });
    expect(next.code).toBe(0);
    expect(next.out).toContain("TU CAMBIO:");
    expect(next.out).toContain(
      `Esta conversación trabaja en el cambio ${CHANGE} («Saludo personalizado»), en ${folder}, y ahora está fuera de esa carpeta.`,
    );
    expect(next.out).toContain(`SIGUIENTE: vuelve a ${folder}:`);
    expect(next.out).not.toContain("specty new");
  });

  it("AC1: with Specty's worktree hooks, it goes back by name", async () => {
    const { root, folder } = await inWorktree();
    await writeFiles(root, { ".claude/settings.local.json": WORKTREE_HOOKS });
    await enter(root, folder);
    expect((await cli(root, ["next"], { env: claude() })).out).toContain(
      `en Claude Code, \`EnterWorktree\` con \`name: "${CHANGE}"\``,
    );
  });

  it("AC1: the guard brings the same card at its `SessionStart` in the main folder", async () => {
    const { root, folder } = await inWorktree();
    await enter(root, folder);
    const started = await cli(root, ["guard", "--tool", "claude-code"], {
      stdin: JSON.stringify({
        session_id: "s1",
        cwd: root,
        hook_event_name: "SessionStart",
        source: "resume",
      }),
    });
    expect(started.code).toBe(0);
    expect(started.out).toContain(
      `Esta conversación trabaja en el cambio ${CHANGE} («Saludo personalizado»), en ${folder}`,
    );
    expect(started.out).toContain(`SIGUIENTE: vuelve a ${folder}:`);
  });

  it("AC1: another conversation, or one whose id is unknown, gets the card with no change", async () => {
    const { root, folder } = await inWorktree();
    await enter(root, folder);
    expect((await cli(root, ["next"], { env: claude("s2") })).out).toContain(
      "No hay un cambio activo.",
    );
    expect((await cli(root, ["next"])).out).not.toContain("TU CAMBIO");
  });

  it("AC1: in its change's folder, and once that change is finished, the card is as before", async () => {
    const { root, folder } = await inWorktree();
    await enter(root, folder);
    expect((await cli(folder, ["next"], { env: claude() })).out).not.toContain("TU CAMBIO");
    await cli(folder, ["cancel", "--reason", "Ya no"], { terminal: person() });
    const next = await cli(root, ["next"], { env: claude() });
    expect(next.out).not.toContain("TU CAMBIO");
    expect(next.out).toContain("No hay un cambio activo.");
  });
});

describe("`specty new` and the conversation that runs it", () => {
  it("AC2: binds it to the new change's folder", async () => {
    const root = await tempRepo(APP);
    const created = await cli(root, ["new", "--worktree", "Saludo personalizado"], {
      env: claude(),
    });
    expect(created.code).toBe(0);
    expect(await boundFolder(root)).toBe(folderOf(root));
  });

  it("AC2: leaves a conversation bound to another open change where it was", async () => {
    const { root, folder } = await inWorktree();
    await enter(root, folder);
    expect((await cli(root, ["new", "--worktree", "Otro cambio"], { env: claude() })).code).toBe(0);
    expect(await boundFolder(root)).toBe(folder);
  });

  it("AC2: binds a conversation of an epic to the slice it starts", async () => {
    const root = await tempRepo(APP);
    const epic = await approvedEpic(root);
    expect((await enter(root, epic)).code).toBe(0);
    const started = await cli(
      epic,
      ["new", "--worktree", "Inicio", "--epic", EPIC, "--slice", "C1"],
      { env: claude() },
    );
    expect(started.code).toBe(0);
    expect(await boundFolder(root)).toBe(folderOf(root, SLICE));
  });

  it("AC2: binds nothing when the tool does not tell the conversation", async () => {
    const root = await tempRepo(APP);
    expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
    await expect(read(root, BINDING("s1"))).rejects.toThrow();
  });
});

describe("the changes no conversation holds", () => {
  it("AC3: `next` with no change and no binding lists them with how to resume them", async () => {
    const { root, folder } = await inWorktree();
    await stateWritten(folder, 120);
    const next = await cli(root, ["next"]);
    expect(next.code).toBe(0);
    expect(next.out).toContain("CAMBIOS SIN CONVERSACIÓN:");
    expect(next.out).toContain(
      `  ${CHANGE} · draft — Saludo personalizado · en .worktrees/${CHANGE}`,
    );
    expect(next.out).toContain("retómalo en su carpeta en lugar de crear otro cambio");
    expect(next.out).toMatch(/SIGUIENTE: ejecuta `specty new "<título>"/);
  });

  it("AC3: a change with recent work is not listed", async () => {
    const { root } = await inWorktree();
    expect((await cli(root, ["next"])).out).not.toContain("CAMBIOS SIN CONVERSACIÓN");
  });

  it("AC3: a conversation bound to its change hears that card instead", async () => {
    const { root, folder } = await inWorktree();
    await stateWritten(folder, 120);
    await enter(root, folder);
    const next = await cli(root, ["next"], { env: claude() });
    expect(next.out).toContain("TU CAMBIO:");
    expect(next.out).not.toContain("CAMBIOS SIN CONVERSACIÓN");
  });
});

describe("the conversation of an epic that hands its slices to subagents", () => {
  it("AC1: in the epic's own worktree, is asked to leave it before launching the briefs", async () => {
    const root = await tempRepo(APP);
    const epic = await approvedEpic(root);
    expect((await enter(root, epic)).code).toBe(0);
    const next = await cli(epic, ["next"], { env: claude() });
    expect(next.code).toBe(0);
    expect(next.out).toContain("ENCARGO C1:");
    expect(next.out).toContain(
      'SIGUIENTE: sal antes de la carpeta de la épica sin borrarla (en Claude Code, `ExitWorktree` con `action: "keep"`)',
    );
  });

  it("AC3: outside the epic's folder, gets the epic's card with its briefs instead of going back", async () => {
    const root = await tempRepo(APP);
    const epic = await approvedEpic(root);
    await enter(root, epic);
    const next = await cli(root, ["next"], { env: claude() });
    expect(next.code).toBe(0);
    expect(next.out).toContain(
      `TU ÉPICA:\n  Esta conversación lleva la épica ${EPIC} («Panel»), en ${epic}, y reparte sus cortes desde fuera de esa carpeta`,
    );
    expect(next.out).toContain("ENCARGO C1:");
    expect(next.out).not.toContain("TU CAMBIO");
    expect(next.out).toContain(
      "SIGUIENTE: lanza en paralelo, en un solo mensaje, un subagente por encargo con su texto tal cual; cuando terminen, vuelve a ejecutar `specty next` aquí.",
    );
  });

  it("AC3: outside the epic's folder, waits there for the subagent of a slice in progress", async () => {
    const root = await tempRepo(APP);
    const epic = await approvedEpic(root);
    await enter(root, epic);
    const slice = ["new", "--worktree", "Inicio", "--epic", EPIC, "--slice", "C1", "--subagent"];
    expect((await cli(root, slice, { env: claude() })).code).toBe(0);
    const next = await cli(root, ["next"], { env: claude() });
    expect(next.out).toContain(`C1 Inicio — en curso: ${SLICE}, en draft`);
    expect(next.out).toContain(
      "SIGUIENTE: los cortes en curso siguen con sus subagentes: espera sus informes y, cuando terminen, vuelve a ejecutar `specty next` aquí.",
    );
  });

  it("AC4: with subagents: false, is asked to go back to the epic as before", async () => {
    const root = await tempRepo(APP);
    const epic = await approvedEpic(root);
    await enter(root, epic);
    await writeFiles(root, { ".specty/config.yaml": `${CONFIG()}subagents: false\n` });
    const next = await cli(root, ["next"], { env: claude() });
    expect(next.out).toContain("TU CAMBIO:");
    expect(next.out).toContain(`SIGUIENTE: vuelve a ${epic}:`);
    expect(next.out).not.toContain("ENCARGO");
  });

  it("AC6: `new` of a slice in the epic's worktree asks to leave it first, and from the main folder does not", async () => {
    const root = await tempRepo(APP);
    const epic = await approvedEpic(root);
    await enter(root, epic);
    const slice = ["new", "--worktree", "Inicio", "--epic", EPIC, "--slice", "C1"];
    const inEpic = await cli(epic, slice, { env: claude() });
    expect(inEpic.code).toBe(0);
    expect(inEpic.out).toContain(
      `SIGUIENTE: continúa en ${folderOf(root, SLICE)}: sal antes de esta carpeta sin borrarla (en Claude Code, \`ExitWorktree\` con \`action: "keep"\`); después, cambia allí la carpeta de trabajo de tu sesión`,
    );
    const fromMain = await cli(root, ["new", "--worktree", "Otro cambio"], { env: claude("s2") });
    expect(fromMain.code).toBe(0);
    expect(fromMain.out).not.toContain("ExitWorktree");
  });
});
