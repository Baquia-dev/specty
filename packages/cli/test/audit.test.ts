// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CHANGE, CONFIG, cli, person, SPEC, SPEC_PATH, tempRepo, writeFiles } from "./support";

const FILES = {
  "src/app.ts": "export const greet = () => 'hola';\n",
  ".specty/config.yaml": CONFIG(),
};

/** SPEC's change with T1 done and T2 active. */
async function oneTask(): Promise<string> {
  const root = await tempRepo(FILES);
  await cli(root, ["new", "Saludo personalizado", "--request", "que salude por nombre"]);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  await cli(root, ["propose"]);
  await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  await cli(root, ["next"]);
  await writeFiles(root, { "src/app.ts": "export const greet = (name: string) => name;\n" });
  expect((await cli(root, ["task", "done", "T1", "--summary", "Saluda por nombre"])).code).toBe(0);
  return root;
}

describe("specty audit", () => {
  it("reports a change: its facts, its tasks and its timeline (AC1)", async () => {
    const root = await oneTask();
    const report = await cli(root, ["audit", CHANGE]);
    expect(report.code).toBe(0);
    expect(report.out).toContain("# Auditoría: Saludo personalizado");
    expect(report.out).toContain(`- Cambio: \`${CHANGE}\` · standard · fase implementing`);
    expect(report.out).toContain("- Petición: «que salude por nombre»");
    expect(report.out).toMatch(
      /- Aprobada: revisión 1, \d{4}-\d{2}-\d{2} \d{2}:\d{2}, por .+ \(tty\)/,
    );
    expect(report.out).toMatch(
      /\| T1 Saludar por nombre \| hecha \| [0-9a-f]{7,} \| Saluda por nombre \|/,
    );
    expect(report.out).toContain("| T2 Mensaje por defecto | en curso | — | — |");
    expect(report.out).toMatch(
      /\| \d{4}-\d{2}-\d{2} \d{2}:\d{2} \| persona \| Aprobó la revisión 1 \(tty\) \|/,
    );
    expect(report.out).toMatch(/\| specty \| Verificó T1: `true`, código 0, \d+ s \|/);
  });

  it("is of the active change without an id, and gives data with --json (AC2, AC3)", async () => {
    const root = await oneTask();
    const json = JSON.parse((await cli(root, ["--json", "audit"])).out);
    expect(json.change).toMatchObject({
      id: CHANGE,
      title: "Saludo personalizado",
      phase: "implementing",
    });
    expect(json.tasks.map((task: { status: string }) => task.status)).toEqual(["done", "active"]);
    expect(json.events[0]).toMatchObject({
      event: "change.created",
      data: { request: "que salude por nombre" },
    });
    expect(json.events.at(-1)).toMatchObject({ event: "task.started", data: { task: "T2" } });
  });

  it("refuses a change that is not there (AC3)", async () => {
    const root = await tempRepo(FILES);
    const missing = await cli(root, ["audit", "20200101-ninguno"]);
    expect([missing.code, missing.out]).toEqual([
      1,
      expect.stringContaining("No hay ningún cambio 20200101-ninguno."),
    ]);
    expect((await cli(root, ["audit"])).out).toContain("No hay un cambio activo en esta carpeta.");
  });
});
