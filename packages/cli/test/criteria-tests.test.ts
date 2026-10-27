// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, CONFIG, cli, person, SPEC, SPEC_PATH, tempRepo, writeFiles } from "./support";

/** `secrets` stays off, whatever scanners the machine has. */
const CHECKS = "checks:\n  levels: { secrets: off }\n";

const ENGLISH = CONFIG().replace("language: es", "language: en");

/** SPEC with a second criterion, which T1 covers too. */
const TWO = SPEC.replace(
  "imprime «Hola, Ana».\n",
  "imprime «Hola, Ana».\n- AC2: CUANDO no se pasa nombre ENTONCES imprime «Hola, mundo».\n",
).replace("  - ac: AC1\n- [ ] T2", "  - ac: AC1, AC2\n- [ ] T2");

/** TWO with a third criterion, which the person checks by hand and T1 covers too. */
const THREE = TWO.replace(
  "«Hola, mundo».\n",
  "«Hola, mundo».\n- AC3: CUANDO se lee el saludo ENTONCES suena natural.\n  - test: manual\n",
).replace("  - ac: AC1, AC2\n", "  - ac: AC1, AC2, AC3\n");

/** A repository with `files` on main and the change of `spec` approved, with T1 active. */
async function approvedChange(
  spec: string,
  options: { config?: string; files?: Readonly<Record<string, string>> } = {},
): Promise<string> {
  const root = await tempRepo({
    ...APP,
    ...options.files,
    ".specty/config.yaml": `${options.config ?? CONFIG()}${CHECKS}`,
  });
  expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
  await writeFiles(root, { [SPEC_PATH]: spec });
  expect((await cli(root, ["propose"])).code).toBe(0);
  const approved = await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  expect(approved.code).toBe(0);
  await cli(root, ["next"]);
  return root;
}

interface CheckJson {
  readonly status: string;
  readonly findings: readonly { readonly message: string }[];
}

/** The `criteria-tested` check of a `--json` run. */
async function criteriaTested(root: string, ...args: string[]): Promise<CheckJson | undefined> {
  const run = await cli(root, ["--json", "check", "--spec", ...args]);
  const checks: (CheckJson & { readonly id: string })[] = JSON.parse(run.out).checks;
  return checks.find((check) => check.id === "criteria-tested");
}

const messages = (check: CheckJson | undefined) =>
  check?.findings.map((finding) => finding.message);

describe("criteria-tested", () => {
  it("AC3: warns about each criterion of a feat task that no test line of the diff names", async () => {
    const root = await approvedChange(TWO);
    await writeFiles(root, {
      "src/app.ts": "export const greet = (name = 'mundo') => 'Hola, ' + name;\n",
      "src/app.test.ts": "it('AC1: greets Ana', () => {});\n",
    });
    const run = await cli(root, ["check", "--spec"]);
    expect(run.code).toBe(0);
    expect(run.out).toContain(
      "AVISO criteria-tested\n  AC2 (T1) no tiene en el diff ningún test con su id",
    );
    expect(run.out).not.toContain("AC1 (T1)");
    // A task done still counts, but not with --staged, where it already made its commit.
    expect((await cli(root, ["task", "done", "T1", "--summary", "Saludo"])).code).toBe(0);
    expect(messages(await criteriaTested(root))).toEqual([
      "AC2 (T1) no tiene en el diff ningún test con su id",
    ]);
    expect(await criteriaTested(root, "--staged")).toMatchObject({ status: "passed" });
    await writeFiles(root, {
      "src/app.test.ts": "it('AC1: greets Ana', () => {});\n// AC2: the default name\n",
    });
    expect(await criteriaTested(root)).toMatchObject({ status: "passed" });
  });

  it("AC3: counts no line already on main, nor a manual criterion or a refactor task", async () => {
    const root = await approvedChange(TWO, {
      files: { "src/app.test.ts": "it('AC1: greets Ana', () => {});\n" },
    });
    await writeFiles(root, {
      "src/app.test.ts": "it('AC1: greets Ana', () => {});\nit('AC20: other', () => {});\n",
    });
    expect(messages(await criteriaTested(root))).toEqual([
      "AC1 (T1) no tiene en el diff ningún test con su id",
      "AC2 (T1) no tiene en el diff ningún test con su id",
    ]);
    const manual = TWO.replace("«Hola, mundo».\n", "«Hola, mundo».\n  - test: manual\n");
    const refactor = TWO.replace("  - ac: AC1, AC2\n", "  - ac: AC1, AC2\n  - type: refactor\n");
    for (const spec of [manual, refactor]) {
      const other = await approvedChange(spec);
      await writeFiles(other, { "src/app.test.ts": "it('AC1: greets Ana', () => {});\n" });
      expect(await criteriaTested(other)).toMatchObject({ status: "passed" });
    }
  });

  it("AC3: says nothing with policy.tests: off, and speaks English", async () => {
    const off = await approvedChange(TWO, { config: `${CONFIG()}policy:\n  tests: "off"\n` });
    expect(await criteriaTested(off)).toMatchObject({ status: "passed" });
    const english = await approvedChange(TWO, { config: ENGLISH });
    expect(messages(await criteriaTested(english))).toEqual([
      "AC1 (T1) has no test with its id in the diff",
      "AC2 (T1) has no test with its id in the diff",
    ]);
  });
});

describe("the acceptance matrix", () => {
  it("AC5: shows each criterion's tests with their task and commit, never a line from main", async () => {
    const onMain = "// AC2: a line already on main\n";
    const root = await approvedChange(THREE, { files: { "src/app.test.ts": onMain } });
    await writeFiles(root, {
      "src/app.ts": "export const greet = (name: string) => 'Hola, ' + name;\n",
      "src/app.test.ts": `${onMain}it('AC1: greets Ana', () => {});\n`,
    });
    expect((await cli(root, ["task", "done", "T1", "--summary", "Saludo"])).code).toBe(0);
    await writeFiles(root, {
      "src/app.ts": "export const greet = (name: string) => '¡Hola, ' + name;\n",
    });
    const last = await cli(root, ["task", "done", "T2", "--summary", "Mensaje"]);
    const commit = /T1 Saludo \((\w+)\)/.exec(last.out)?.[1];
    expect(commit).toBeDefined();
    expect(last.out).toContain(
      [
        "CRITERIOS Y TESTS:",
        `  AC1: src/app.test.ts:2 (T1, ${commit})`,
        "  AC2: sin test",
        "  AC3: a mano (test: manual)",
        "AVISOS:",
        "  A comprobar a mano (test: manual): AC3.",
        "  Pide al usuario que los compruebe antes de aceptar.",
        "  Sin un test con su id, aunque los cubre una tarea feat o fix: AC2.",
        "  Cuéntaselo al usuario antes de que acepte: ningún test comprueba esos criterios.",
      ].join("\n"),
    );
  });

  it("AC6: names to the person the criteria to check by hand and those without their test", async () => {
    const root = await approvedChange(THREE);
    await writeFiles(root, { "src/app.test.ts": "it('AC1: greets Ana', () => {});\n" });
    expect((await cli(root, ["task", "done", "T1", "--summary", "Saludo"])).code).toBe(0);
    await writeFiles(root, { "src/app.ts": "export const greet = () => '¡hola!';\n" });
    expect((await cli(root, ["task", "done", "T2", "--summary", "Mensaje"])).code).toBe(0);
    const terminal = person();
    await cli(root, ["accept"], { terminal });
    expect(terminal.notes[0]).toContain(
      "A comprobar a mano (test: manual): AC3.\nSin un test con su id, aunque los cubre una tarea feat o fix: AC2.",
    );
  });
});
