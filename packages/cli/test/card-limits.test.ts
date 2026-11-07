// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APP,
  CHANGE,
  CONFIG,
  cli,
  folderOf,
  git,
  person,
  read,
  SPEC,
  SPEC_PATH,
  tempRepo,
  writeFiles,
} from "./support";

/** The block `internal.cards` of `config.yaml` with `lines`, each `key: value`. */
const cardsOf = (...lines: string[]) =>
  `internal:\n  cards:\n${lines.map((line) => `    ${line}\n`).join("")}`;
const DIR = `.specty/changes/${CHANGE}`;
/** A note of `length` characters. */
const note = (length: number) => "a".repeat(length);

/** SPEC's change in a repository whose configuration ends with `extra`, created. */
async function created(extra: string): Promise<string> {
  const root = await tempRepo({
    "src/app.ts": "export const greet = () => 'hola';\n",
    ".specty/config.yaml": `${CONFIG()}${extra}`,
  });
  expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  return root;
}

describe("the limits of what the cards show, from the configuration", () => {
  it("AC1: propose names internal.cards.importersShown importers of a file and counts the rest", async () => {
    const users = Object.fromEntries(
      [1, 2, 3, 4, 5, 6].map((n) => [`src/u${n}.ts`, 'import { a } from "./a";\n']),
    );
    const root = await tempRepo({
      ...APP,
      ...users,
      "src/a.ts": "export const a = 1;\n",
      ".specty/config.yaml": `${CONFIG()}${cardsOf("importersShown: 2")}`,
    });
    expect((await cli(root, ["new", "--kind", "quick", "Saludo personalizado"])).code).toBe(0);
    await writeFiles(root, {
      [SPEC_PATH]:
        "---\nkind: quick\n---\n\n# Cambiar el valor\n\n## Objetivo\n\nEl valor cambia.\n\n## Archivos\n\n- modificar src/a.ts — cambio\n\n## Tareas\n\n- [ ] T1: Cambiar el valor\n  - files: src/a.ts\n  - type: fix\n",
    });
    const proposed = await cli(root, ["propose"]);
    expect(proposed.code).toBe(0);
    expect(proposed.out).toContain("src/a.ts — importado por src/u1.ts, src/u2.ts y 4 más");
  });

  it("AC2: the review's card repeats internal.cards.reviewLines lines of the answer, which reviews/ keeps whole", async () => {
    const dir = await mkdtemp(join(tmpdir(), "specty-reviewer-"));
    const script = join(dir, "reviewer.mjs");
    await writeFile(
      script,
      'import { readFileSync } from "node:fs";\nreadFileSync(0);\nfor (let line = 1; line <= 30; line++) console.log("- línea " + line);\n',
    );
    const command = `node "${script}"`;
    const root = await created(
      `review:\n  command: ${JSON.stringify(command)}\n${cardsOf("reviewLines: 20")}`,
    );
    expect((await cli(root, ["propose"])).code).toBe(0);
    const reviewed = await cli(root, ["review"]);
    expect(reviewed.code).toBe(0);
    expect(reviewed.out).toContain("- línea 1\n");
    expect(reviewed.out).toContain("- línea 20\n  …\n");
    expect(reviewed.out).not.toContain("- línea 21");
    const kept = await read(root, `${DIR}/reviews/spec-r1.md`);
    expect(kept).toContain("- línea 21\n");
    expect(kept).toContain("- línea 30\n");
  });

  it("AC3: task done refuses a summary or a finding past internal.cards.noteChars, and takes one past 300 within it", async () => {
    const approved = async (noteChars: number) => {
      const root = await created(cardsOf(`noteChars: ${noteChars}`));
      expect((await cli(root, ["propose"])).code).toBe(0);
      const decided = await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
      expect(decided.code).toBe(0);
      await cli(root, ["next"]);
      return root;
    };
    const short = await approved(100);
    const summary = await cli(short, ["task", "done", "T1", "--summary", note(150)]);
    expect(summary.code).toBe(1);
    expect(summary.out).toContain("El resumen tiene 150 caracteres; el máximo es 100,");
    const finding = await cli(short, [
      "task",
      "done",
      "T1",
      "--summary",
      "Hecha T1",
      "--finding",
      note(120),
    ]);
    expect(finding.code).toBe(1);
    expect(finding.out).toContain("Un hallazgo tiene 120 caracteres; el máximo es 100,");
    const long = await approved(500);
    await writeFiles(long, { "src/app.ts": "export const greet = (name) => name;\n" });
    const done = await cli(long, ["task", "done", "T1", "--summary", note(400)]);
    expect(done.out).not.toContain("el máximo es");
    expect(done.code).toBe(0);
  });

  it("AC4: new names a change and its branch with internal.cards.slugChars, 48 without, and leaves the ones that exist", async () => {
    const configOf = (extra: string) =>
      `version: 1\nlanguage: es\ngit:\n  flow: github\nverify:\n  default: "true"\n${extra}`;
    const root = await tempRepo({ ...APP, ".specty/config.yaml": configOf("") });
    const idOf = (slug: string) => `${CHANGE.slice(0, 8)}-${slug}`;
    const before = idOf("los-limites-de-lo-que-muestran-las-tarjetas");
    const title = "Los límites de lo que muestran las tarjetas pasan a ser ajustes internos";
    const first = await cli(root, ["new", title]);
    expect(first.code).toBe(0);
    expect(first.out).toContain(`Cambio creado: ${before} (rama feat/${before.slice(9)})`);
    await writeFiles(root, { ".specty/config.yaml": configOf(cardsOf("slugChars: 16")) });
    git(root, "commit", "-qam", "chore: slug corto");
    const after = idOf("exportar-el");
    const second = await cli(root, [
      "new",
      "Exportar el informe mensual de ventas a una hoja de cálculo compartida",
    ]);
    expect(second.code).toBe(0);
    expect(second.out).toContain(`Cambio creado: ${after} (rama feat/exportar-el)`);
    expect(git(folderOf(root, after), "branch", "--show-current")).toBe("feat/exportar-el");
    expect(git(folderOf(root, before), "branch", "--show-current")).toBe(
      "feat/los-limites-de-lo-que-muestran-las-tarjetas",
    );
    expect(existsSync(join(folderOf(root, before), `.specty/changes/${before}/spec.md`))).toBe(
      true,
    );
  });
});
