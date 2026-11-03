// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  APP,
  CHANGE,
  cli,
  folderOf,
  person,
  quickInWorktree,
  tempRepo,
  toClosing,
} from "./support";

/** An agent that Specty recognizes: Claude Code. */
const CLAUDE = { env: { CLAUDECODE: "1" } };

const add = (cwd: string, ...args: string[]) => cli(cwd, ["memory", "add", ...args], CLAUDE);

/** A repository with SPEC's change open in its own folder, and a reminder that waits for it. */
async function waitingReminder() {
  const root = await tempRepo(APP);
  expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
  const added = await add(root, "Publicar la versión", "--kind", "reminder", "--on-close", CHANGE);
  expect(added.code).toBe(0);
  return { root, folder: folderOf(root) };
}

/** The section of the output that archives the change, with reminder P1. */
const FIRED = [
  "RECORDATORIOS QUE ESPERABAN A ESTE CAMBIO:",
  "  P1 · Publicar la versión",
  "  Desde ahora salen en cada sesión hasta que se marquen hechos con `specty memory done <id>`.",
].join("\n");

describe("reminders that wait for a change to close", () => {
  it("AC1: a reminder that waits for a change stays out of the start card and «TE TOCA»", async () => {
    const { root, folder } = await waitingReminder();
    expect((await cli(root, ["next"])).out).not.toContain("Publicar la versión");
    expect((await cli(root, ["status"])).out).not.toContain("TE TOCA");
    expect((await cli(folder, ["next"])).out).not.toContain("Publicar la versión");
    expect((await cli(root, ["memory"])).out).toContain(
      `P1 · recordatorio · al cerrar ${CHANGE} · Publicar la versión — claude-code, `,
    );
  });

  it("AC2: closing the change shows the reminder, which then shows in every session", async () => {
    const { root, folder } = await waitingReminder();
    await toClosing(folder);
    const closed = await cli(folder, ["close"], { terminal: person() });
    expect(closed.code).toBe(0);
    expect(closed.out).toContain(FIRED);
    expect((await cli(root, ["next"])).out).toContain(
      "RECORDATORIOS:\n  P1 · Publicar la versión\n",
    );
    expect((await cli(root, ["status"])).out).toContain("TE TOCA:\n  P1 · Publicar la versión\n");
    expect((await cli(root, ["memory"])).out).toContain(
      "P1 · recordatorio · Publicar la versión — claude-code, ",
    );
    expect((await cli(root, ["memory", "done", "P1"], CLAUDE)).code).toBe(0);
    expect((await cli(root, ["status"])).out).not.toContain("TE TOCA");
  });

  it("AC2: cancelling the change shows the reminder too, so that it is not lost", async () => {
    const { root, folder } = await waitingReminder();
    const cancelled = await cli(folder, ["cancel"], {
      terminal: person({ ask: ["Ya no hace falta"] }),
    });
    expect(cancelled.out).toContain("Cambio cancelado y archivado");
    expect(cancelled.out).toContain(FIRED);
    expect((await cli(root, ["status"])).out).toContain("TE TOCA:\n  P1 · Publicar la versión\n");
  });

  it("AC2: accepting a quick change fires only the reminders that waited for it", async () => {
    const root = await tempRepo({ ...APP, "src/button.ts": "Sing in\n" });
    const quick = await quickInWorktree(
      root,
      "Corregir el botón",
      "corregir-el-boton",
      "Sign in\n",
    );
    expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
    const mine = await add(root, "Avisar a diseño", "--kind", "reminder", "--on-close", quick.id);
    expect(mine.code).toBe(0);
    const other = await add(
      root,
      "Publicar la versión",
      "--kind",
      "reminder",
      "--on-close",
      CHANGE,
    );
    expect(other.code).toBe(0);
    const accepted = await cli(quick.folder, ["accept"], { terminal: person() });
    expect(accepted.out).toContain("Cambio aceptado, cerrado y archivado");
    expect(accepted.out).toContain(
      "RECORDATORIOS QUE ESPERABAN A ESTE CAMBIO:\n  P1 · Avisar a diseño\n",
    );
    expect(accepted.out).not.toContain("Publicar la versión");
    const status = (await cli(root, ["status"])).out;
    expect(status).toContain("TE TOCA:\n  P1 · Avisar a diseño\n");
    expect(status).not.toContain("Publicar la versión");
  });

  it("AC3: memory add refuses --on-close on another kind, with another trigger or without an open change", async () => {
    const root = await tempRepo(APP);
    expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
    const pending = await add(root, "Publicar", "--on-close", CHANGE);
    expect(pending.code).toBe(1);
    expect(pending.out).toContain(
      "Solo un recordatorio espera al cierre de un cambio, y esta entrada sería un pendiente.",
    );
    const due = await add(
      root,
      "Publicar",
      "--kind",
      "reminder",
      "--on-close",
      CHANGE,
      "--due",
      "2026-12-01",
    );
    expect(due.code).toBe(1);
    expect(due.out).toContain(
      "Un recordatorio lleva un solo disparador: `--due` o `--on-close`, no los dos.",
    );
    const paths = await add(
      root,
      "Publicar",
      "--kind",
      "reminder",
      "--on-close",
      CHANGE,
      "--path",
      "src/**",
    );
    expect(paths.code).toBe(1);
    expect(paths.out).toContain("`--path` o `--on-close`, no los dos.");
    const unknown = await add(root, "Publicar", "--kind", "reminder", "--on-close", "20260101-x");
    expect(unknown.code).toBe(1);
    expect(unknown.out).toContain("«20260101-x» no es un cambio abierto");
    const cancelled = await cli(folderOf(root), ["cancel"], {
      terminal: person({ ask: ["Ya no hace falta"] }),
    });
    expect(cancelled.out).toContain("Cambio cancelado y archivado");
    const gone = await add(root, "Publicar", "--kind", "reminder", "--on-close", CHANGE);
    expect(gone.code).toBe(1);
    expect(gone.out).toContain(`«${CHANGE}» no es un cambio abierto`);
    expect((await cli(root, ["memory", "--all"])).out).toContain("No hay entradas.");
  });
});
