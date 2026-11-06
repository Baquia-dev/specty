// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CONFIG, cli, git, person, read, SPEC, SPEC_PATH, writeFiles } from "../support";
import { call, path, serving, state } from "./support";

/**
 * A verification that fails and names the test until `src/app.ts` greets with «Hola», as a
 * runner does while the code is missing.
 */
const RED = `node -e "if(!require('fs').readFileSync('src/app.ts','utf8').includes('Hola')){console.log('FAIL src/app.test.ts');process.exit(1)}"`;
/** Under contract, a feature's tests are approved before its code (ADR 0014). */
const CONTRACT = `${CONFIG(RED)}policy:\n  tests: contract\nchecks:\n  levels: { secrets: off }\n`;
/** SPEC with a test in every task, as `contract` requires to propose it. */
const FEATURE = SPEC.replace(
  "  - files: src/app.ts\n  - ac: AC1\n  - type: refactor",
  "  - files: src/app.ts, src/app.test.ts\n  - ac: AC1\n  - type: refactor",
);
const TEST = "it('AC1: saluda a Ana', () => {});\n";

/** The URL of the code of `file`, a test of SPEC's change or not. */
const codeOf = (file: string) => `${path("test")}?path=${encodeURIComponent(file)}`;

/** FEATURE's change, approved, with its test sent: it waits in `testing` for the person. */
async function testsSent(actions = true) {
  const served = await serving(actions, CONTRACT, FEATURE);
  const { root } = served;
  await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  await writeFiles(root, { "src/app.test.ts": TEST });
  const sent = await cli(root, ["propose"]);
  expect([sent.code, (await state(root)).phase], sent.out).toEqual([0, "testing"]);
  return served;
}

describe("the code of a change's tests in the local server", () => {
  it("AC1: gives a sent test as its commit left it, not as the folder has it now", async () => {
    const { root, server, headers } = await testsSent();
    try {
      // Past the guard, as a person could: what nobody committed does not show.
      await writeFiles(root, { "src/app.test.ts": "it('AC1: otra cosa', () => {});\n" });
      const answer = await call(server.port, codeOf("src/app.test.ts"), headers);
      expect(answer.status, answer.body).toBe(200);
      expect(answer.body).toBe(TEST);
    } finally {
      await server.close();
    }
  });

  it("AC3: answers 404 for anything that is not a test of the change, needs the session, and is read from the agent's server too", async () => {
    const { server, headers } = await testsSent(false);
    try {
      for (const outside of ["src/app.ts", ".specty/config.yaml", "../../etc/passwd", ""]) {
        expect((await call(server.port, codeOf(outside), headers)).status, outside).toBe(404);
      }
      expect((await call(server.port, path("test"), headers)).status).toBe(404);
      const unknown = "/api/changes/20990101-nada/test?path=src%2Fapp.test.ts";
      expect((await call(server.port, unknown, headers)).status).toBe(404);
      const anonymous = await call(server.port, codeOf("src/app.test.ts"), {
        origin: headers.origin,
      });
      expect(anonymous.status).toBe(403);
      const given = await call(server.port, codeOf("src/app.test.ts"), headers);
      expect([given.status, given.body]).toEqual([200, TEST]);
    } finally {
      await server.close();
    }
  });

  it("AC2: gives a locked test from the change's branch and, once closed and its branch gone, from the main branch", async () => {
    const { root, server, headers } = await testsSent();
    try {
      const approval = await cli(root, ["approve"], { terminal: person() });
      expect(approval.code, approval.out).toBe(0);
      const { branch, lockedTests } = await state(root);
      expect(Object.keys(lockedTests)).toEqual(["src/app.test.ts"]);
      const locked = await call(server.port, codeOf("src/app.test.ts"), headers);
      expect([locked.status, locked.body]).toEqual([200, TEST]);
      await cli(root, ["next"]);
      await writeFiles(root, {
        "src/app.ts": "export const greet = (name: string) => 'Hola, ' + name;\n",
      });
      for (const task of ["T1", "T2"]) {
        const done = await cli(root, ["task", "done", task, "--summary", "Hecho"]);
        expect(done.code, done.out).toBe(0);
      }
      const accepted = await call(server.port, path("accept"), headers, {});
      expect(accepted.status, accepted.body).toBe(200);
      const closing = "\n## Cierre\n\n### Resumen\n\nSaludo listo.\n";
      await writeFiles(root, { [SPEC_PATH]: `${await read(root, SPEC_PATH)}${closing}` });
      await cli(root, ["propose"]);
      const closed = await call(server.port, path("close"), headers, {});
      expect(closed.status, closed.body).toBe(200);
      // As the cleanup does, if closing kept it.
      if (git(root, "branch", "--list", branch) !== "") git(root, "branch", "-D", branch);
      const landed = await call(server.port, codeOf("src/app.test.ts"), headers);
      expect([landed.status, landed.body]).toEqual([200, TEST]);
    } finally {
      await server.close();
    }
  });
});
