// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, CHANGE, cli, folderOf, person, tempRepo, toClosing } from "./support";

/** An agent that Specty recognizes: Claude Code. */
const CLAUDE = { env: { CLAUDECODE: "1" } };

const add = (cwd: string, ...args: string[]) => cli(cwd, ["memory", "add", ...args], CLAUDE);

/** A repository with pending items «Uno» and «Dos», and SPEC's change taking P1 in its own folder. */
async function resolvingP1() {
  const root = await tempRepo(APP);
  for (const text of ["Uno", "Dos"]) expect((await add(root, text)).code).toBe(0);
  const created = await cli(root, [
    "new",
    "--worktree",
    "Saludo personalizado",
    "--resolves",
    "P1",
  ]);
  expect(created.code).toBe(0);
  return { root, folder: folderOf(root) };
}

describe("the entries a change took", () => {
  it("AC1: are done when the change closes", async () => {
    const { root, folder } = await resolvingP1();
    await toClosing(folder);
    expect((await cli(folder, ["close"], { terminal: person() })).code).toBe(0);
    const all = (await cli(root, ["memory", "--all"])).out;
    expect(all).toContain("P1 · pendiente · hecha · Uno");
    const open = (await cli(root, ["memory"])).out;
    expect(open).not.toContain("P1 ·");
    expect(open).toContain("P2 · pendiente · Dos");
  });

  it("AC2: are free again when the change is cancelled", async () => {
    const { root, folder } = await resolvingP1();
    const cancelled = await cli(folder, ["cancel"], {
      terminal: person({ ask: ["Ya no hace falta"] }),
    });
    expect(cancelled.out).toContain("Cambio cancelado y archivado");
    const open = (await cli(root, ["memory"])).out;
    expect(open).toContain("P1 · pendiente · Uno");
    expect(open).not.toContain("tomada");
    // AC1: the card with no active change does not list them, free again or not.
    const card = (await cli(root, ["next"])).out;
    for (const id of ["P1", "P2"]) expect(card).not.toContain(`${id} ·`);
  });

  it("AC3: show in the draft card of the change that took them", async () => {
    const { folder } = await resolvingP1();
    const draft = (await cli(folder, ["next"])).out;
    expect(draft).toContain(
      "RESUELVE:\n  P1 · pendiente · Uno\n  Quedan hechas al cerrarse este cambio, y libres si se cancela.\n",
    );
    expect(draft).not.toContain("P2 ·");
  });

  it("AC3: leave out the section for a change created without --resolves", async () => {
    const root = await tempRepo(APP);
    expect((await add(root, "Uno")).code).toBe(0);
    expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
    expect((await cli(folderOf(root, CHANGE), ["next"])).out).not.toContain("RESUELVE");
  });
});
