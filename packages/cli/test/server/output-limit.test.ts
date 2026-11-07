// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CONFIG, cli, person, SPEC, writeFiles } from "../support";
import { call, implemented, path, serving, state } from "./support";

/** `internal.exec.maxOutputKiB` at its least: 64 KiB. */
const LIMITED = "internal:\n  exec:\n    maxOutputKiB: 64\n";

/** Some 80 KiB in 100 lines, a comment of each: past 64 KiB, short of 512, and few lines. */
const FILLER = `${`// ${"relleno ".repeat(100)}\n`.repeat(100)}`;

/** A file of some 80 KiB, generated as big files usually are: task done does not size it. */
const BIG = `// @generated\n${FILLER}`;

/** A verification that fails and names the test until `src/app.ts` greets with «Hola». */
const RED = `node -e "if(!require('fs').readFileSync('src/app.ts','utf8').includes('Hola')){console.log('FAIL src/app.test.ts');process.exit(1)}"`;
/** Under contract, a feature's tests are approved before its code (ADR 0014). */
const CONTRACT = `${CONFIG(RED)}policy:\n  tests: contract\nchecks:\n  levels: { secrets: off }\n`;
/** SPEC with a test in every task, as `contract` requires to propose it. */
const FEATURE = SPEC.replace(
  "  - files: src/app.ts\n  - ac: AC1\n  - type: refactor",
  "  - files: src/app.ts, src/app.test.ts\n  - ac: AC1\n  - type: refactor",
);
/** A test of some 80 KiB. */
const TEST = `${FILLER}it('AC1: saluda a Ana', () => {});\n`;

/** The diff and the trace of `src/app.ts` once BIG is done, with `config`: status and error. */
async function diffAndTrace(config: string) {
  const { root, server, headers } = await serving(true, config);
  try {
    await implemented(root, BIG);
    const diff = await call(server.port, path("diff"), headers);
    const trace = await call(server.port, `${path("trace")}?path=src/app.ts`, headers);
    const error = (body: string) => (body.startsWith("{") ? JSON.parse(body).error : undefined);
    return [diff, trace].map((answer) => [answer.status, error(answer.body)]);
  } finally {
    await server.close();
  }
}

/** The code of TEST, sent under contract, with `config`: its status and its body. */
async function testCode(config: string) {
  const { root, server, headers } = await serving(true, `${CONTRACT}${config}`, FEATURE);
  try {
    await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    await writeFiles(root, { "src/app.test.ts": TEST });
    const sent = await cli(root, ["propose"]);
    expect([sent.code, (await state(root)).phase], sent.out).toEqual([0, "testing"]);
    const code = `${path("test")}?path=${encodeURIComponent("src/app.test.ts")}`;
    const answer = await call(server.port, code, headers);
    return [answer.status, answer.body === TEST];
  } finally {
    await server.close();
  }
}

describe("the most the local server serves", () => {
  it("AC3: refuses a diff and a blame past internal.exec.maxOutputKiB, and serves them without the key", async () => {
    expect(await diffAndTrace(CONFIG())).toEqual([
      [200, undefined],
      [200, undefined],
    ]);
    expect(await diffAndTrace(`${CONFIG()}${LIMITED}`)).toEqual([
      [413, "too large"],
      [413, "too large"],
    ]);
  });

  it("AC3: answers 404 for a test's code past internal.exec.maxOutputKiB, and serves it without the key", async () => {
    expect(await testCode("")).toEqual([200, true]);
    expect(await testCode(LIMITED)).toEqual([404, false]);
  });
});
