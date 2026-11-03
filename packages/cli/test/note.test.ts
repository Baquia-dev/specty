// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, CHANGE, cli, inWorktree, NOW, read, tempRepo } from "./support";

/** An agent that Specty recognizes: Claude Code. */
const CLAUDE = { env: { CLAUDECODE: "1" } };

const note = (cwd: string, text: string) => cli(cwd, ["note", text], CLAUDE);

/** The events of the change's audit in `folder`. */
const audit = async (folder: string): Promise<Record<string, unknown>[]> =>
  (await read(folder, `.specty/changes/${CHANGE}/audit.jsonl`))
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));

/** How the log shows NOW: UTC, to the minute. */
const WHEN = NOW.toISOString().slice(0, 16).replace("T", " ");

describe("specty note", () => {
  it("AC1: adds the note to the change's audit, with who added it", async () => {
    const { folder } = await inWorktree();
    const added = await note(folder, "La API pagina de 50 en 50.");
    expect(added.code).toBe(0);
    expect(added.out).toContain(`Nota anotada en la bitácora de ${CHANGE}.`);
    expect((await audit(folder)).at(-1)).toMatchObject({
      event: "change.noted",
      actor: "agent",
      tool: "claude-code",
      data: { text: "La API pagina de 50 en 50." },
    });
  });

  it("AC2: shows the last three notes in next's card", async () => {
    const { folder } = await inWorktree();
    for (const text of ["Uno", "Dos", "Tres", "Cuatro"]) {
      expect((await note(folder, text)).code).toBe(0);
    }
    const card = (await cli(folder, ["next"])).out;
    expect(card).toContain(`BITÁCORA:\n  ${WHEN} · Dos\n  ${WHEN} · Tres\n  ${WHEN} · Cuatro\n`);
    expect(card).not.toContain("· Uno");
  });

  it("AC3: adds nothing without an open change here, or without text", async () => {
    const root = await tempRepo(APP);
    const none = await note(root, "Algo");
    expect(none.code).not.toBe(0);
    expect(none.out).toContain("No hay un cambio abierto en esta carpeta");
    const { folder } = await inWorktree();
    const before = (await audit(folder)).length;
    const empty = await note(folder, "   ");
    expect(empty.code).not.toBe(0);
    expect(empty.out).toContain("La nota está vacía.");
    expect(await audit(folder)).toHaveLength(before);
  });
});
