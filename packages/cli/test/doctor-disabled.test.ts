// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { cli, released, tempRepo } from "./support";

const CODE = { "src/app.ts": "export const a = 1;\n" };
/** A file that says the repository uses Cursor, which this version does not offer. */
const CURSOR = { ".cursorrules": "Reglas de Cursor.\n" };
const WARNING =
  "Cursor: esta versión de Specty aún no lo ofrece, pero su guard sigue en .cursor/hooks.json: funciona, aunque `specty doctor` ya no lo comprueba ni `specty init` lo actualiza.";

/** The lines of one section of doctor's output, up to the next one. */
function section(out: string, title: string): string[] {
  const lines = out.split("\n");
  const start = lines.indexOf(`${title}:`);
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => !line.startsWith(" "));
  return end === -1 ? rest : rest.slice(0, end);
}

describe("doctor with the agents this version offers", () => {
  it("AC1: says nothing of a disabled agent whose files are there without its guard", async () => {
    const root = await tempRepo({ ...CODE, ...CURSOR });
    expect((await released(root, ["init", "--language", "es"])).code).toBe(0);
    // Offering every agent, as before, doctor would find Cursor's guard missing.
    expect((await cli(root, ["doctor"])).out).toContain("Cursor: falta el guard");
    const checked = await released(root, ["doctor"]);
    expect(checked.out).not.toContain("Cursor");
  });

  it("AC2: warns of a disabled agent whose guard is still installed, instead of checking it", async () => {
    const root = await tempRepo(CODE);
    const init = await cli(root, ["init", "--language", "es", "--tools", "claude-code,cursor"]);
    expect(init.code).toBe(0);
    const checked = await released(root, ["doctor"]);
    expect(section(checked.out, "AVISOS").map((line) => line.trim())).toContain(WARNING);
    expect(checked.out).not.toContain("Cursor: guard instalado.");
    expect(section(checked.out, "PROBLEMAS").join("\n")).not.toContain("Cursor");
  });
});
