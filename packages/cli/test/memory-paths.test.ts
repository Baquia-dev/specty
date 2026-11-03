// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { cli, inWorktree, person, SPEC, SPEC_PATH, writeFiles } from "./support";

/** An agent that Specty recognizes: Claude Code. */
const CLAUDE = { env: { CLAUDECODE: "1" } };

const add = (cwd: string, ...args: string[]) => cli(cwd, ["memory", "add", ...args], CLAUDE);

const SECTION = "LECCIONES Y DECISIONES DE ESTOS ARCHIVOS:";
const LESSON = "P1 · lección · Los saludos se traducen aquí. · en src/**";
const DECISION = "D1 · decisión · El saludo va de usted. «de usted» · en src/app.ts";

/** A change in its own folder, and lessons and a decision about its files and about others. */
async function remembered() {
  const { root, folder } = await inWorktree();
  expect(
    (await add(root, "Los saludos se traducen aquí.", "--kind", "lesson", "--path", "src/**")).code,
  ).toBe(0);
  expect(
    (await add(root, "La guía va aparte.", "--kind", "lesson", "--path", "docs/**")).code,
  ).toBe(0);
  const decided = await add(
    root,
    "El saludo va de usted.",
    "--kind",
    "decision",
    "--quote",
    "de usted",
    "--path",
    "src/app.ts",
  );
  expect(decided.code).toBe(0);
  return folder;
}

describe("the lessons and decisions of the files, in the cards", () => {
  it("AC2: show in the draft card once the spec names its files", async () => {
    const folder = await remembered();
    expect((await cli(folder, ["next"])).out).not.toContain(SECTION);
    await writeFiles(folder, { [SPEC_PATH]: SPEC });
    const draft = (await cli(folder, ["next"])).out;
    expect(draft).toContain(`${SECTION}\n  ${LESSON}\n  ${DECISION}\n`);
    expect(draft).not.toContain("La guía va aparte.");
  });

  it("AC1: show in the card of the active task", async () => {
    const folder = await remembered();
    await writeFiles(folder, { [SPEC_PATH]: SPEC });
    expect((await cli(folder, ["propose"])).code).toBe(0);
    const approved = await cli(folder, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    expect(approved.code).toBe(0);
    const task = (await cli(folder, ["next"])).out;
    expect(task).toContain("TAREA T1");
    expect(task).toContain(`${SECTION}\n  ${LESSON}\n  ${DECISION}\n`);
    expect(task).not.toContain("La guía va aparte.");
  });
});
