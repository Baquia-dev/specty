// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { ARCHIVE, CHANGE, CONFIG, cli, read, SPEC, SPEC_PATH, writeFiles } from "../support";
import { call, path, serving, state } from "./support";

// F2's exit criterion (ARCHITECTURE §18): a whole change without opening the Markdown. The agent
// works through the CLI; every decision of the person is an action of the UI's server.

/** Fails naming the test until `src/app.ts` greets by name, as a red test would. */
const VERIFY = `node -e "if(!require('fs').readFileSync('src/app.ts','utf8').includes('Hola,')){console.log('FAIL src/app.test.ts');process.exit(1)}"`;

/** SPEC with its refactor naming the test too, as `contract` asks of every code task. */
const FEATURE = SPEC.replace("  - files: src/app.ts\n", "  - files: src/app.ts, src/app.test.ts\n");

describe("a whole change from the UI", () => {
  it("goes from review to done with only the person's actions in the server", async () => {
    const contract = `${CONFIG(VERIFY)}policy:\n  tests: contract\n`;
    const { root, server, headers } = await serving(true, contract, FEATURE);
    const decide = async (action: string, body: unknown) => {
      const answer = await call(server.port, path(action), headers, body);
      expect(answer.status, `${action}: ${answer.body}`).toBe(200);
    };
    try {
      // The spec: its high-impact assumption, then the revision the person read.
      await decide("assumptions/A1", { decision: "confirmed" });
      await decide("approve", { revision: 1 });
      expect((await state(root)).phase).toBe("testing");
      // The tests: the agent sends them red, and the person approves them (gate 2).
      await writeFiles(root, { "src/app.test.ts": "it('AC1: saluda a Ana', () => {});\n" });
      expect((await cli(root, ["propose"])).code).toBe(0);
      await decide("approve", { revision: 1 });
      expect((await state(root)).phase).toBe("implementing");
      // The scope: the agent asks for a file outside its task, and the person approves it.
      await cli(root, ["next"]);
      await cli(root, ["scope", "add", "lib/other.ts", "--reason", "Ayudante"]);
      await decide("scope/S1", { decision: "approved" });
      for (const [task, text] of [
        ["T1", "export const greet = (name: string) => 'Hola, ' + name;\n"],
        ["T2", "export const greet = (name = 'mundo') => 'Hola, ' + name;\n"],
      ] as const) {
        await writeFiles(root, { "src/app.ts": text });
        const done = await cli(root, ["task", "done", task, "--summary", task]);
        expect(done.code, done.out).toBe(0);
      }
      // The result and the closing the agent wrote.
      await decide("accept", {});
      const closing = "\n## Cierre\n\n### Resumen\n\nSaludo por nombre.\n";
      await writeFiles(root, { [SPEC_PATH]: `${await read(root, SPEC_PATH)}${closing}` });
      expect((await cli(root, ["propose"])).code).toBe(0);
      await decide("close", {});
      expect(await read(root, `${ARCHIVE}/${CHANGE}/state.json`)).toContain('"phase": "done"');
      // Every decision that names where it was taken came from the UI.
      const audit = (await read(root, `${ARCHIVE}/${CHANGE}/audit.jsonl`)).trim().split("\n");
      const channels = audit.flatMap((line) => {
        const found = /"event":"([^"]+)".*"channel":"([^"]+)"/.exec(line);
        return found === null ? [] : [[found[1], found[2]]];
      });
      expect(channels).toEqual([
        ["spec.approved", "ui"],
        ["tests.approved", "ui"],
      ]);
      const events = audit.map((line) => /"event":"([^"]+)"/.exec(line)?.[1]);
      for (const event of ["scope.decided", "change.accepted", "change.closed"]) {
        expect(events).toContain(event);
      }
    } finally {
      await server.close();
    }
  });
});
