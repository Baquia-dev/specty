// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  APP,
  CHANGE,
  CONFIG,
  cli,
  git,
  person,
  read,
  SPEC,
  SPEC_PATH,
  tempRepo,
  writeFiles,
} from "./support";

/** `secrets` stays off, whatever scanners the machine has. */
const CHECKS = "checks:\n  levels: { secrets: off }\n";

/** SPEC's change, done by Specty on its branch: its spec, its approval and both tasks. */
async function doneBySpecty(): Promise<string> {
  const root = await tempRepo({ ...APP, ".specty/config.yaml": `${CONFIG()}${CHECKS}` });
  expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  expect((await cli(root, ["propose"])).code).toBe(0);
  const approved = await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  expect(approved.code).toBe(0);
  await cli(root, ["next"]);
  await writeFiles(root, {
    "src/app.ts": "export const greet = (name: string) => 'Hola, ' + name;\n",
    "src/app.test.ts": "it('AC1: saluda a Ana', () => {});\n",
  });
  expect((await cli(root, ["task", "done", "T1", "--summary", "Saludo"])).code).toBe(0);
  await writeFiles(root, {
    "src/app.ts": "export const greet = (name = 'mundo') => 'Hola, ' + name;\n",
  });
  expect((await cli(root, ["task", "done", "T2", "--summary", "Por defecto"])).code).toBe(0);
  return root;
}

/** A commit of `files` with `trailers`, made by hand: the repository has no hooks. */
async function commit(
  root: string,
  subject: string,
  files: Readonly<Record<string, string>>,
  trailers: readonly string[] = [],
): Promise<string> {
  await writeFiles(root, files);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", subject, ...trailers.flatMap((line) => ["--trailer", line]));
  return git(root, "rev-parse", "--short", "HEAD");
}

describe("specty ci", () => {
  it("AC4: passes the commits Specty made for an approved change, in text and JSON", async () => {
    const root = await doneBySpecty();
    const run = await cli(root, ["ci", "--base", "main"]);
    expect(run.code, run.out).toBe(0);
    expect(run.out).toBe("OK 3/3");
    const json = await cli(root, ["--json", "ci", "--base", "main"]);
    expect(JSON.parse(json.out)).toMatchObject({
      checks: [
        { id: "traced", status: "passed" },
        { id: "task-approval", status: "passed" },
        { id: "no-spike", status: "passed" },
      ],
      exitCode: 0,
    });
  });

  it("AC1: fails on a commit of governed code without Specty-Change", async () => {
    const root = await doneBySpecty();
    const sha = await commit(root, "fix: sin spec", { "src/extra.ts": "x\n", "README.md": "y\n" });
    const run = await cli(root, ["ci", "--base", "main"]);
    expect(run.code).toBe(1);
    expect(run.out).toContain(
      `FALLA traced\n  ${sha} «fix: sin spec» no lleva Specty-Change (documéntalo con specty retro): src/extra.ts`,
    );
    expect(run.out).toContain("FALLA: traced");
  });

  it("AC2: fails on a change that does not exist and on a task without its approved spec", async () => {
    const root = await doneBySpecty();
    const unknown = await commit(root, "feat: otro", { "src/otro.ts": "x\n" }, [
      "Specty-Change: 20991231-nada",
    ]);
    const spec = (await read(root, SPEC_PATH)).replace("saluda por nombre", "saluda a gritos");
    const forged = await commit(
      root,
      "feat(src): Saludar a gritos",
      { [SPEC_PATH]: spec, "src/app.ts": "y\n" },
      [
        `Specty-Change: ${CHANGE}`,
        "Specty-Task: T2",
        `Specty-Spec: ${git(root, "log", "-1", "--grep=Specty-Task:", "--format=%(trailers:key=Specty-Spec,valueonly)")}`,
      ],
    );
    const run = await cli(root, ["ci", "--base", "main"]);
    expect(run.code).toBe(1);
    expect(run.out).toContain(
      `${unknown} «feat: otro» nombra el cambio 20991231-nada, que no existe`,
    );
    expect(run.out).toContain(
      `${forged} (T2 de ${CHANGE}) no coincide con la spec aprobada (Specty-Spec)`,
    );
  });

  it("AC3: fails on a spike that goes into the target branch, not into another one", async () => {
    const root = await doneBySpecty();
    const spike = await commit(root, "spike: prueba", { "src/prueba.ts": "x\n" }, [
      `Specty-Change: ${CHANGE}`,
      "Specty-Kind: spike",
    ]);
    const intoMain = await cli(root, ["ci", "--base", "main"]);
    expect(intoMain.code).toBe(1);
    expect(intoMain.out).toContain(
      `FALLA no-spike\n  ${spike} «spike: prueba» es de un spike (Specty-Kind: spike), que no va a la rama destino`,
    );
    const elsewhere = await cli(root, ["ci", "--base", "main", "--into", "experimentos"]);
    expect(elsewhere.code, elsewhere.out).toBe(0);

    const branch = await cli(root, ["ci", "--base", "HEAD", "--head-ref", "spike/prueba"]);
    expect(branch.code).toBe(1);
    expect(branch.out).toContain(
      "la rama spike/prueba es de un spike, que no va a la rama destino",
    );
  });
});
