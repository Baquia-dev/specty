// SPDX-License-Identifier: Apache-2.0
import { access } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import {
  APP,
  CHANGE,
  cli,
  git,
  inWorktree,
  person,
  quickInWorktree,
  type Run,
  tempRepo,
  toAcceptance,
} from "./support";

/** Where the mark of the `wait` of change `id` of `root` lives, shared by every worktree. */
const markPath = (root: string, id: string) =>
  join(root, git(root, "rev-parse", "--git-path", `common/specty/waits/${id}.json`));

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The agent's `specty wait` in `folder`, the folder of change `id` of `root`, once it left its
 * mark: from then on it waits for the person. Its run comes in an object, so that it is not awaited.
 */
async function waitingIn(
  root: string,
  folder: string,
  id: string,
): Promise<{ readonly waited: Promise<Run> }> {
  const waiting = cli(folder, ["wait", "--interval", "50", "--timeout", "30"]);
  const marked = () =>
    access(markPath(root, id)).then(
      () => true,
      () => false,
    );
  for (let look = 0; look < 100 && !(await marked()); look += 1) await pause(50);
  expect(await marked()).toBe(true);
  return { waited: waiting };
}

/** The way out of a folder that no longer exists, as after closing from inside it. */
const leaveLine = (folder: string, root: string) =>
  `SIGUIENTE: ${folder} ya no existe: sal de ella (en Claude Code, \`ExitWorktree\`) y sigue en ${root}; para otro cambio, \`specty new "<título>"\`.`;

describe("a wait whose change's folder goes while it waits", () => {
  it("says the person closed the change when accepting a quick one removes its folder, and asks to leave it", async () => {
    const root = await tempRepo({ ...APP, "src/button.ts": "Sing in\n" });
    const { id, folder } = await quickInWorktree(
      root,
      "Corregir botón",
      "corregir-boton",
      "Sign in\n",
    );
    const { waited: waiting } = await waitingIn(root, folder, id);
    const accepted = await cli(root, ["accept", id], { terminal: person() });
    expect(accepted.code).toBe(0);
    expect(await exists(folder)).toBe(false);
    const waited = await waiting;
    expect(waited.code).toBe(0);
    expect(waited.out).toContain(`SPECTY · ${id} · done`);
    expect(waited.out).toContain(
      `La persona cerró ${id} mientras esperabas, y su carpeta ${folder} se eliminó.`,
    );
    expect(waited.out).toContain(leaveLine(folder, root));
    expect(`${waited.out}\n${waited.err}`).not.toContain("Git falló");
  });

  it("says the person cancelled the change when cancelling it removes its folder, and asks to leave it", async () => {
    const { root, folder } = await inWorktree();
    await toAcceptance(folder);
    const { waited: waiting } = await waitingIn(root, folder, CHANGE);
    const cancelled = await cli(root, ["cancel", CHANGE, "--reason", "Ya no"], {
      terminal: person(),
    });
    expect(cancelled.code).toBe(0);
    expect(await exists(folder)).toBe(false);
    const waited = await waiting;
    expect(waited.code).toBe(0);
    expect(waited.out).toContain(`SPECTY · ${CHANGE} · cancelled`);
    expect(waited.out).toContain(
      `La persona canceló ${CHANGE} mientras esperabas, y su carpeta ${folder} se eliminó.`,
    );
    expect(waited.out).toContain(leaveLine(folder, root));
  });

  it("says the folder went with the change still open, and asks to bring it back with `specty restore`", async () => {
    const { root, folder } = await inWorktree();
    await toAcceptance(folder);
    const { waited: waiting } = await waitingIn(root, folder, CHANGE);
    git(root, "worktree", "remove", "--force", folder);
    const waited = await waiting;
    expect(waited.code).toBe(0);
    expect(waited.out).toContain(
      `La carpeta ${folder} de ${CHANGE} se eliminó mientras esperabas, sin cerrar ni cancelar el cambio, que sigue en su rama.`,
    );
    expect(waited.out).toContain(
      `SIGUIENTE: ${folder} ya no existe: sal de ella (en Claude Code, \`ExitWorktree\`) y, en ${root}, recupera la carpeta con \`specty restore ${CHANGE}\` y sigue su salida, que dice cómo volver a ella.`,
    );
  });
});
