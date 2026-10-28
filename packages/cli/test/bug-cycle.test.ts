// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  APP,
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

/**
 * A verification that fails and names the test until `src/app.ts` greets with «Hola», as a
 * runner does while the code is missing.
 */
const RED = `node -e "if(!require('fs').readFileSync('src/app.ts','utf8').includes('Hola')){console.log('FAIL src/app.test.ts');process.exit(1)}"`;
const CONTRACT = `${CONFIG(RED)}policy:\n  tests: contract\nchecks:\n  levels: { secrets: off }\n`;
const TEST = "it('AC1: saluda a Ana', () => {});\n";

/** SPEC with a test in every task, as `contract` requires to propose it. */
const FEATURE = SPEC.replace(
  "  - files: src/app.ts\n  - ac: AC1\n  - type: refactor",
  "  - files: src/app.ts, src/app.test.ts\n  - ac: AC1\n  - type: refactor",
);
/** FEATURE with T1 of another type: `fix` makes it a bug, `refactor` leaves no test first. */
const typed = (type: string) =>
  FEATURE.replace(
    "- [ ] T1: Saludar por nombre\n  - files: src/app.ts, src/app.test.ts\n  - ac: AC1",
    `- [ ] T1: Saludar por nombre\n  - files: src/app.ts, src/app.test.ts\n  - ac: AC1\n  - type: ${type}`,
  );
const quick = (type: string) =>
  `---\nkind: quick\n---\n\n# Saludo personalizado\n\n## Objetivo\n\nLa app saluda por nombre.\n\n## Archivos\n\n- modificar src/app.ts — saludo\n\n## Tareas\n\n- [ ] T1: Saludar por nombre\n  - files: src/app.ts\n  - type: ${type}\n`;

const stateOf = async (root: string) =>
  JSON.parse(await read(root, `.specty/changes/${CHANGE}/state.json`));

/** `spec`'s change, proposed and approved by the person under `contract`. */
async function approved(spec: string, kind: "standard" | "quick" = "standard") {
  const root = await tempRepo({ ...APP, ".specty/config.yaml": CONTRACT });
  await cli(root, [
    "new",
    ...(kind === "quick" ? ["--kind", "quick"] : []),
    "Saludo personalizado",
  ]);
  await writeFiles(root, { [SPEC_PATH]: spec });
  const proposed = await cli(root, ["propose"]);
  expect(proposed.code, proposed.out).toBe(0);
  const approval = await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  expect(approval.code, approval.out).toBe(0);
  return root;
}

describe("the cycle of tests a change follows", () => {
  it("AC1: sends a change whose pending tasks are fixes through the testing phase", async () => {
    expect((await stateOf(await approved(typed("fix")))).phase).toBe("testing");
    expect((await stateOf(await approved(quick("fix"), "quick"))).phase).toBe("testing");
  });

  it("AC3: skips the testing phase without feat or fix tasks, and for a quick feat", async () => {
    expect((await stateOf(await approved(typed("refactor")))).phase).toBe("implementing");
    expect((await stateOf(await approved(quick("feat"), "quick"))).phase).toBe("implementing");
  });

  it("AC4: implements an adjustment that adds no feat or fix task, without a new testing phase", async () => {
    const root = await approved(FEATURE);
    await writeFiles(root, { "src/app.test.ts": TEST });
    expect((await cli(root, ["propose"])).code).toBe(0);
    expect((await cli(root, ["approve"], { terminal: person() })).code).toBe(0);
    await cli(root, ["next"]);
    await writeFiles(root, { "src/app.ts": "export const greet = (name) => 'Hola, ' + name;\n" });
    expect((await cli(root, ["task", "done", "T1", "--summary", "Saluda"])).code).toBe(0);
    expect((await cli(root, ["task", "done", "T2", "--summary", "Igual"])).code).toBe(0);
    expect((await cli(root, ["adjust", "Ordena el saludo"])).code).toBe(0);
    const extra =
      "- [ ] T3: Ordenar el saludo\n  - files: src/app.ts, src/app.test.ts\n  - ac: AC1\n  - type: refactor\n";
    await writeFiles(root, { [SPEC_PATH]: `${await read(root, SPEC_PATH)}${extra}` });
    const proposed = await cli(root, ["propose"]);
    expect(proposed.code, proposed.out).toBe(0);
    const approval = await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    expect(approval.code, approval.out).toBe(0);
    expect((await stateOf(root)).phase).toBe("implementing");
  });
});

const auditOf = async (
  root: string,
): Promise<{ readonly event: string; readonly actor: string }[]> =>
  (await read(root, `.specty/changes/${CHANGE}/audit.jsonl`))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

describe("a bug's red test", () => {
  it("AC2: is committed and locked as soon as it fails, and the fix starts with no person", async () => {
    for (const [spec, kind] of [
      [typed("fix"), "standard"],
      [quick("fix"), "quick"],
    ] as const) {
      const root = await approved(spec, kind);
      await writeFiles(root, { "src/app.test.ts": TEST });
      const sent = await cli(root, ["propose"]);
      expect(sent.code, sent.out).toBe(0);
      expect(sent.out).toMatch(/Tests en rojo y bloqueados \(commit [0-9a-f]{7}\)/);
      expect(sent.out).toContain("TAREA T1");
      const state = await stateOf(root);
      expect(state.phase, kind).toBe("implementing");
      expect(Object.keys(state.lockedTests)).toEqual(["src/app.test.ts"]);
      const events = (await auditOf(root)).map(({ event, actor }) => `${actor} ${event}`);
      expect(events).toContain("agent tests.proposed");
      expect(events).toContain("specty tests.locked");
      expect(events).not.toContain("human tests.approved");
    }
  });
});
