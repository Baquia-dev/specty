// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  CHANGE,
  CONFIG,
  cli,
  person,
  read,
  SPEC,
  SPEC_PATH,
  tempRepo,
  writeFiles,
} from "./support";

const CACHE = "La caché no se invalida al cambiar de curso.";
const INDEX = "Falta un índice en notas.";

/** SPEC's change, approved, with T1 active. */
async function approved(): Promise<string> {
  const root = await tempRepo({
    "src/app.ts": "export const greet = () => 'hola';\n",
    ".specty/config.yaml": CONFIG(),
  });
  expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  expect((await cli(root, ["propose"])).code).toBe(0);
  const decided = await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  expect(decided.code).toBe(0);
  await cli(root, ["next"]);
  return root;
}

const done = (task: string, ...findings: string[]) => [
  "task",
  "done",
  task,
  "--summary",
  `Hecha ${task}`,
  ...findings.flatMap((finding) => ["--finding", finding]),
];

describe("findings", () => {
  it("are kept by task done and shown to the next tasks and the closing", async () => {
    const root = await approved();
    await writeFiles(root, { "src/app.ts": "1\n" });
    expect((await cli(root, done("T1", CACHE, INDEX))).code).toBe(0);
    const audit = (await read(root, `.specty/changes/${CHANGE}/audit.jsonl`)).trim().split("\n");
    const completed = audit
      .map((line) => JSON.parse(line))
      .findLast((entry) => entry.event === "task.completed");
    expect(completed?.data.findings).toEqual([CACHE, INDEX]);
    expect((await cli(root, ["next"])).out).toContain(`HALLAZGOS:\n  T1: ${CACHE}\n  T1: ${INDEX}`);
    await writeFiles(root, { "src/app.ts": "2\n" });
    const empty = await cli(root, done("T2", " "));
    expect(empty.code).toBe(1);
    expect(empty.out).toContain("Un hallazgo (--finding) está vacío.");
    expect((await cli(root, done("T2"))).code).toBe(0);
    expect((await cli(root, ["accept"], { terminal: person() })).code).toBe(0);
    expect((await cli(root, ["next"])).out).toContain(
      `HALLAZGOS DE LAS TAREAS:\n  T1: ${CACHE}\n  T1: ${INDEX}\n  Lleva a ### Pendientes`,
    );
  });

  it("and summaries fit in 300 characters, since every next task card repeats them (AC1)", async () => {
    const root = await approved();
    await writeFiles(root, { "src/app.ts": "1\n" });
    const long = "x".repeat(301);
    const summary = await cli(root, ["task", "done", "T1", "--summary", long]);
    expect([summary.code, summary.out]).toEqual([
      1,
      expect.stringContaining("El resumen tiene 301 caracteres; el máximo es 300"),
    ]);
    const finding = await cli(root, done("T1", CACHE, long));
    expect([finding.code, finding.out]).toEqual([
      1,
      expect.stringContaining("Un hallazgo tiene 301 caracteres; el máximo es 300"),
    ]);
    // Refused before verifying: nothing was recorded, and 300 is still fine.
    const audit = await read(root, `.specty/changes/${CHANGE}/audit.jsonl`);
    expect(audit).not.toContain('"task.verified"');
    expect((await cli(root, ["task", "done", "T1", "--summary", "y".repeat(300)])).code).toBe(0);
  });

  it("reach the draft of a change that follows, with the follow-ups of its closing", async () => {
    const root = await approved();
    await writeFiles(root, { "src/app.ts": "1\n" });
    await cli(root, done("T1", CACHE));
    await writeFiles(root, { "src/app.ts": "2\n" });
    await cli(root, done("T2"));
    await cli(root, ["accept"], { terminal: person() });
    const closing =
      "\n## Cierre\n\n### Resumen\n\nSaludo listo.\n\n### Pendientes\n\n- Ordenar por fecha.\n- Traducir el saludo.\n";
    await writeFiles(root, { [SPEC_PATH]: `${await read(root, SPEC_PATH)}${closing}` });
    expect((await cli(root, ["propose"])).code).toBe(0);
    expect((await cli(root, ["close"], { terminal: person() })).code).toBe(0);
    const made = await cli(root, ["new", "Seguimiento", "--follows", CHANGE, "20200101-ninguno"]);
    expect(made.code).toBe(0);
    const draft = (await cli(root, ["next"])).out;
    expect(draft).toContain(
      `DEL CAMBIO ${CHANGE}:\n  Pendiente: Ordenar por fecha.\n  Pendiente: Traducir el saludo.\n  Hallazgo de T1: ${CACHE}\n  Decide qué entra en esta spec`,
    );
    expect(draft).toContain("DEL CAMBIO 20200101-ninguno:\n  No está en esta carpeta");
  });
});
