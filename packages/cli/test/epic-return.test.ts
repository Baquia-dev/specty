// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  APP,
  CHANGE,
  cli,
  folderOf,
  person,
  read,
  SPEC,
  SPEC_PATH,
  tempRepo,
  toClosing,
  writeFiles,
} from "./support";

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

- C1: Saludo personalizado
  - ac: AC1
`;

/** SPEC as the change of the epic's slice C1. */
const SLICE_SPEC = SPEC.replace("kind: standard\n", `kind: standard\nepic: ${EPIC}\nslice: C1\n`);

/** What Claude Code tells the commands that conversation `session` runs. */
const claude = (session = "s1") => ({ CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: session });

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

/** Takes the slice's change in `folder` to a closing that waits for the person. */
async function sliceToClosing(folder: string): Promise<void> {
  await writeFiles(folder, { [SPEC_PATH]: SLICE_SPEC });
  expect((await cli(folder, ["propose"])).code).toBe(0);
  const approved = await cli(folder, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  expect(approved.code).toBe(0);
  await cli(folder, ["next"]);
  await writeFiles(folder, { "src/app.ts": "1\n" });
  await cli(folder, ["task", "done", "T1", "--summary", "Uno"]);
  await writeFiles(folder, { "src/app.ts": "2\n" });
  await cli(folder, ["task", "done", "T2", "--summary", "Dos"]);
  expect((await cli(folder, ["accept"], { terminal: person() })).code).toBe(0);
  const closing = "\n## Cierre\n\n### Resumen\n\nSaludo listo.\n";
  await writeFiles(folder, { [SPEC_PATH]: `${await read(folder, SPEC_PATH)}${closing}` });
  expect((await cli(folder, ["propose"])).out).toContain("Cierre válido.");
}

/**
 * Delegated mode on, an approved epic that conversation s1 created, and its slice C1 that s1
 * started from the epic's folder, ready to close: `inMain` keeps the epic in the main folder,
 * `subagent` hands the slice to a subagent, and `hooks` installs Specty's worktree hooks.
 */
async function sliceReady(options: { inMain?: boolean; subagent?: boolean; hooks?: boolean }) {
  const hooks = options.hooks === false ? {} : { ".claude/settings.local.json": WORKTREE_HOOKS };
  const root = await tempRepo({ ...APP, ...hooks });
  const on = await cli(root, ["delegate", "on"], { terminal: person({ choose: ["yes"] }) });
  expect(on.code).toBe(0);
  const where = options.inMain === true ? [] : ["--worktree"];
  const created = await cli(root, ["new", ...where, "--kind", "epic", "Panel"], { env: claude() });
  expect(created.code).toBe(0);
  const epic = options.inMain === true ? root : folderOf(root, EPIC);
  await writeFiles(epic, { [`.specty/changes/${EPIC}/spec.md`]: EPIC_SPEC });
  expect((await cli(epic, ["propose"])).code).toBe(0);
  expect((await cli(epic, ["approve"], { terminal: person() })).code).toBe(0);
  const slice = ["new", "--worktree", "Saludo personalizado", "--epic", EPIC, "--slice", "C1"];
  const subagent = options.subagent === true ? ["--subagent"] : [];
  expect((await cli(epic, [...slice, ...subagent], { env: claude() })).code).toBe(0);
  const folder = folderOf(root);
  await sliceToClosing(folder);
  return { root, epic, folder };
}

/** The SIGUIENTE of `close` today, for an agent that closes from inside `folder`. */
const leaveToday = (folder: string, root: string) =>
  `SIGUIENTE: ${folder} ya no existe: sal de ella (en Claude Code, \`ExitWorktree\`) y sigue en ${root}; para otro cambio, \`specty new "<título>"\`.`;

describe("closing a slice from inside its folder, in the conversation bound to it", () => {
  it("AC1: asks to leave it keeping it and go back to the epic by name, then run `next`", async () => {
    const { root, epic, folder } = await sliceReady({});
    expect(await boundFolder(root)).toBe(folder);
    const closed = await cli(folder, ["close"], { env: claude() });
    expect(closed.code).toBe(0);
    expect(closed.out).toContain("Incorporado a main.");
    expect(closed.out).toContain(
      `SIGUIENTE: ${folder} ya no existe: sal de ella (en Claude Code, \`ExitWorktree\` con \`action: "keep"\`) y vuelve a la épica ${EPIC}, en ${epic}: en Claude Code, \`EnterWorktree\` con \`name: "${EPIC}"\`, y ejecuta \`specty next\`.`,
    );
  });

  it("AC2: binds the conversation to the epic's folder, and `next` in the main folder sends it back there", async () => {
    const { root, epic, folder } = await sliceReady({});
    expect((await cli(folder, ["close"], { env: claude() })).code).toBe(0);
    expect(await boundFolder(root)).toBe(epic);
    const next = await cli(root, ["next"], { env: claude() });
    expect(next.code).toBe(0);
    expect(next.out).toContain(`SIGUIENTE: vuelve a ${epic}:`);
    expect(next.out).not.toContain("No hay un cambio activo.");
  });

  it("AC4: without Specty's worktree hooks, asks to switch the session's folder to the epic's", async () => {
    const { epic, folder } = await sliceReady({ hooks: false });
    const closed = await cli(folder, ["close"], { env: claude() });
    expect(closed.out).toContain(
      `y vuelve a la épica ${EPIC}, en ${epic}: cambia allí la carpeta de trabajo de tu sesión o abre allí un agente, y ejecuta \`specty next\`.`,
    );
  });

  it("AC3: with the epic in the main folder, carries on with it there", async () => {
    const { root, folder } = await sliceReady({ inMain: true });
    const closed = await cli(folder, ["close"], { env: claude() });
    expect(closed.code).toBe(0);
    expect(closed.out).toContain(
      `SIGUIENTE: ${folder} ya no existe: sal de ella (en Claude Code, \`ExitWorktree\` con \`action: "keep"\`) y sigue con la épica ${EPIC} en ${root}: ejecuta \`specty next\`.`,
    );
    expect(await boundFolder(root)).toBe(root);
  });
});

describe("closing a change in any other case", () => {
  it("AC5: a slice a subagent carries keeps today's SIGUIENTE, and the conversation stays on the epic", async () => {
    const { root, epic, folder } = await sliceReady({ subagent: true });
    expect(await boundFolder(root)).toBe(epic);
    const closed = await cli(folder, ["close"], { env: claude() });
    expect(closed.code).toBe(0);
    expect(closed.out).toContain(leaveToday(folder, root));
    expect(await boundFolder(root)).toBe(epic);
  });

  it("AC5: another conversation, or one the tool does not tell, keeps today's SIGUIENTE", async () => {
    const other = await sliceReady({});
    const closed = await cli(other.folder, ["close"], { env: claude("s2") });
    expect(closed.out).toContain(leaveToday(other.folder, other.root));
    expect(await boundFolder(other.root)).toBe(other.folder);
    const none = await sliceReady({});
    expect((await cli(none.folder, ["close"])).out).toContain(leaveToday(none.folder, none.root));
    expect(await boundFolder(none.root)).toBe(none.folder);
  });

  it("AC5: a change that is not a slice keeps today's SIGUIENTE and its binding", async () => {
    const root = await tempRepo(APP);
    await cli(root, ["delegate", "on"], { terminal: person({ choose: ["yes"] }) });
    const created = await cli(root, ["new", "--worktree", "Saludo personalizado"], {
      env: claude(),
    });
    expect(created.code).toBe(0);
    const folder = folderOf(root);
    await toClosing(folder);
    const closed = await cli(folder, ["close"], { env: claude() });
    expect(closed.out).toContain(leaveToday(folder, root));
    expect(await boundFolder(root)).toBe(folder);
  });

  it("AC5: a slice whose epic is no longer open keeps today's SIGUIENTE and its binding", async () => {
    const { root, epic, folder } = await sliceReady({});
    const cancelled = await cli(epic, ["cancel", "--reason", "Ya no"], { terminal: person() });
    expect(cancelled.code).toBe(0);
    const closed = await cli(folder, ["close"], { env: claude() });
    expect(closed.out).toContain(leaveToday(folder, root));
    expect(await boundFolder(root)).toBe(folder);
  });
});
