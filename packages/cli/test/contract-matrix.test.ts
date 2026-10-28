// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, CONFIG, cli, git, person, SPEC, SPEC_PATH, tempRepo, writeFiles } from "./support";

/** Fails, naming the test, until `src/app.ts` greets with «Hola». */
const VERIFY = `node -e "const ok = require('fs').readFileSync('src/app.ts', 'utf8').includes('Hola'); if (!ok) console.log('FAIL src/app.test.ts'); process.exit(ok ? 0 : 1)"`;
/** The tests of a feature first (ADR 0014), and `secrets` off whatever scanners the machine has. */
const CONTRACT = `${CONFIG(VERIFY)}policy:\n  tests: contract\nchecks:\n  levels: { secrets: off }\n`;

/** SPEC with a test in every task, as `contract` requires to propose it. */
const FEATURE = SPEC.replace(
  "  - files: src/app.ts\n  - ac: AC1\n  - type: refactor",
  "  - files: src/app.ts, src/app.test.ts\n  - ac: AC1\n  - type: refactor",
);

const trailer = (root: string, key: string) =>
  git(root, "log", "-1", `--format=%(trailers:key=${key},valueonly)`);

describe("the tests sent in the testing phase", () => {
  it("AC1, AC2: carry their trailer and count in the acceptance matrix", async () => {
    const root = await tempRepo({ ...APP, ".specty/config.yaml": CONTRACT });
    expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
    await writeFiles(root, { [SPEC_PATH]: FEATURE });
    expect((await cli(root, ["propose"])).code).toBe(0);
    const approved = await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    expect(approved.out).toContain("testing");

    await writeFiles(root, { "src/app.test.ts": "it('AC1: saluda a Ana', () => {});\n" });
    const sent = await cli(root, ["propose"]);
    expect(sent.code, sent.out).toBe(0);
    const tests = git(root, "rev-parse", "--short", "HEAD");
    expect(trailer(root, "Specty-Tests")).toBe("true");
    expect(trailer(root, "Specty-Spec")).not.toBe("");
    expect((await cli(root, ["approve"], { terminal: person() })).code).toBe(0);

    await cli(root, ["next"]);
    await writeFiles(root, { "src/app.ts": "export const greet = (name) => 'Hola, ' + name;\n" });
    expect((await cli(root, ["task", "done", "T1", "--summary", "Saludo"])).code).toBe(0);
    await writeFiles(root, {
      "src/app.ts": "export const greet = (name = 'mundo') => 'Hola, ' + name;\n",
    });
    const last = await cli(root, ["task", "done", "T2", "--summary", "Por defecto"]);
    expect(last.code, last.out).toBe(0);
    expect(last.out).toContain(`CRITERIOS Y TESTS:\n  AC1: src/app.test.ts:1 (tests, ${tests})`);
    expect(last.out).not.toContain("Sin un test con su id");
  });
});
