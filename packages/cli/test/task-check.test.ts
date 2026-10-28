// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CONFIG, cli, person, SPEC, SPEC_PATH, tempRepo, writeFiles } from "./support";

// The markers are put together from parts, so that this file does not trip `specty check`.
const ONLY = ".only";
const TODO = "TODO";

/** `secrets` stays off, whatever scanners the machine has; `tests` is a command that fails. */
const CHECKS = 'checks:\n  levels: { secrets: off, todo: warn }\n  commands: { tests: "false" }\n';

/** SPEC approved with `config`, and T1 active. */
async function approved(config: string): Promise<string> {
  const root = await tempRepo({
    "src/app.ts": "export const greet = () => 'hola';\n",
    ".specty/config.yaml": config,
  });
  expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  expect((await cli(root, ["propose"])).code).toBe(0);
  const decided = await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  expect(decided.code).toBe(0);
  await cli(root, ["next"]);
  return root;
}

describe("specty check in task done", () => {
  it("does not complete a task that leaves a check failing, and shows its report", async () => {
    const root = await approved(`${CONFIG()}${CHECKS}`);
    await writeFiles(root, {
      "src/app.ts": "export const greet = (name: string) => 'Hola, ' + name;\n",
      "src/app.test.ts": `it${ONLY}("AC1: greets", () => {});\n`,
    });
    const failed = await cli(root, ["task", "done", "T1", "--summary", "Uno"]);
    expect(failed.code).toBe(2);
    expect(failed.err).toContain("specty: verificando `specty check --changed --spec`…");
    expect(failed.out).toContain(
      [
        "VERIFICACIÓN FALLIDA: specty check --changed --spec (código 1)",
        "SALIDA:",
        "  FALLA focused-tests",
        `    src/app.test.ts:1 test enfocado: it${ONLY}`,
        "  OK 7/8 · FALLA: focused-tests",
        "SIGUIENTE: corrige el problema y vuelve a ejecutar `specty task done T1",
      ].join("\n"),
    );

    await writeFiles(root, { "src/app.test.ts": `it("AC1: greets", () => {});\n` });
    expect((await cli(root, ["task", "done", "T1", "--summary", "Uno"])).code).toBe(0);
  });

  it("completes a task with warnings only, and leaves the report on stderr", async () => {
    const root = await approved(`${CONFIG()}${CHECKS}`);
    await writeFiles(root, {
      "src/app.ts": `// ${TODO}: greet in more languages\nexport const greet = () => 'hola';\n`,
      "src/app.test.ts": `it("greets", () => {});\n`,
    });
    const done = await cli(root, ["task", "done", "T1", "--summary", "Uno"]);
    expect(done.code).toBe(0);
    expect(done.err).toContain("AVISO todo\n  src/app.ts:1");
    expect(done.out).not.toContain("AVISO todo");
  });

  it("leaves the project's commands to the task's verification, and runs them without one", async () => {
    // `tests` fails, and the task's verification (`true`) is what runs the project's commands.
    const verified = await approved(`${CONFIG()}${CHECKS}`);
    await writeFiles(verified, { "src/app.test.ts": `it("greets", () => {});\n` });
    expect((await cli(verified, ["task", "done", "T1", "--summary", "Uno"])).code).toBe(0);

    // `propose` asks every task for a verification, so the person takes `verify.default` out later.
    const unverified = await approved(`${CONFIG()}${CHECKS}`);
    await writeFiles(unverified, {
      ".specty/config.yaml": `version: 1\nlanguage: es\ngit:\n  worktrees: false\n${CHECKS}`,
      "src/app.test.ts": `it("greets", () => {});\n`,
    });
    const failed = await cli(unverified, ["task", "done", "T1", "--summary", "Uno"]);
    expect(failed.code).toBe(2);
    expect(failed.out).toContain("  FALLA tests\n    `false` salió con 1\n");
  });
});
