// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  APP,
  cli,
  folderOf,
  person,
  read,
  SPEC,
  SPEC_PATH,
  tempRepo,
  toAcceptance,
  writeFiles,
} from "./support";

/** An agent that Specty recognizes: Claude Code. */
const CLAUDE = { env: { CLAUDECODE: "1" } };

const SECTION = "PENDIENTES QUE QUEDAN EN LA MEMORIA";
const RESOLVED = "PENDIENTES QUE RESOLVIÓ ESTE CAMBIO";

/**
 * Closes SPEC's change, in its own folder, with `followUps` under «### Pendientes» and created
 * with `options` too: its output.
 */
async function closedWith(
  root: string,
  followUps: readonly string[],
  ...options: string[]
): Promise<string> {
  const created = await cli(root, ["new", "--worktree", "Saludo personalizado", ...options]);
  expect(created.code).toBe(0);
  const folder = folderOf(root);
  await toAcceptance(folder);
  await cli(folder, ["accept"], { terminal: person() });
  const pending = followUps.map((item) => `- ${item}\n`).join("");
  const closing = `\n## Cierre\n\n### Resumen\n\nSaludo listo.\n\n### Pendientes\n\n${pending}`;
  await writeFiles(folder, { [SPEC_PATH]: `${await read(folder, SPEC_PATH)}${closing}` });
  expect((await cli(folder, ["propose"])).out).toContain("Cierre válido.");
  const closed = await cli(folder, ["close"], { terminal: person() });
  expect(closed.code).toBe(0);
  return closed.out;
}

describe("what `specty close` says of the pending items its closing leaves", () => {
  it("AC6: names each new one with its id and first line, and that the person sees them", async () => {
    const root = await tempRepo(APP);
    const out = await closedWith(root, ["Ordenar por fecha.", "Exportar a CSV."]);
    expect(out).toContain(
      `${SECTION}:\n  P1 · Ordenar por fecha.\n  P2 · Exportar a CSV.\n  La persona los ve en la página Memoria de \`specty ui\` y con \`specty memory\`.\n`,
    );
    expect(out).not.toContain("Las sesiones los verán al empezar");
  });

  it("AC2: names first the entries it took and the closing marked done", async () => {
    const root = await tempRepo(APP);
    for (const text of ["Uno", "Dos"]) {
      expect((await cli(root, ["memory", "add", text], CLAUDE)).code).toBe(0);
    }
    const out = await closedWith(root, ["Exportar a CSV."], "--resolves", "P1");
    expect(out).toContain(
      `${RESOLVED}:\n  P1 · Uno\n  Quedan hechos y salen de la lista de abiertos.\n`,
    );
    expect(out.indexOf(RESOLVED)).toBeLessThan(out.indexOf(SECTION));
    expect(out).not.toContain("P2 · Dos");
  });

  it("AC6: has no such section when the closing leaves none new", async () => {
    const root = await tempRepo(APP);
    expect((await cli(root, ["memory", "add", "Uno"], CLAUDE)).code).toBe(0);
    const out = await closedWith(root, ["P1: sigue abierto.", "Uno", "Ninguno."]);
    expect(out).toContain("Cambio cerrado y archivado");
    expect(out).not.toContain(SECTION);
  });
});

describe("what `specty accept` says of the risks it accepts", () => {
  it("AC3: still names the lessons it leaves in the memory", async () => {
    const root = await tempRepo(APP);
    expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
    await writeFiles(root, { [SPEC_PATH]: SPEC });
    expect((await cli(root, ["propose"])).code).toBe(0);
    const decided = await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    expect(decided.code).toBe(0);
    await cli(root, ["next"]);
    await writeFiles(root, { "src/app.ts": "export const greet = (input) => eval(input);\n" });
    expect((await cli(root, ["task", "done", "T1", "--summary", "Uno"])).code).toBe(0);
    await writeFiles(root, { "src/app.ts": "export const greet = (x) => eval(x);\n" });
    expect((await cli(root, ["task", "done", "T2", "--summary", "Dos"])).code).toBe(0);
    const accepted = await cli(root, ["accept"], { terminal: person() });
    expect(accepted.code).toBe(0);
    expect(accepted.out).toContain(
      "Riesgos aceptados, anotados en la memoria como lecciones de sus archivos: P1.",
    );
  });
});
