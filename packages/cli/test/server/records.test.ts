// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { changeRecords } from "../../src/server/records";
import {
  AGENT,
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
} from "../support";
import { sessionAt, state } from "./support";

const CHANGE_DIR = `.specty/changes/${CHANGE}`;
const APPROVED_AT = "2026-10-20T09:30:00.000Z";

describe("the phase the server says a change is in", () => {
  it("AC3: dates a change in testing from its last approval of the spec", async () => {
    const root = await tempRepo({ ...APP, ".specty/config.yaml": CONFIG() });
    await cli(root, ["new", "Saludo personalizado"]);
    await writeFiles(root, { [SPEC_PATH]: SPEC });
    expect((await cli(root, ["propose"])).code).toBe(0);
    await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    // No change reaches testing yet: the state and the audit say it did, at a known hour.
    const audit = (await read(root, `${CHANGE_DIR}/audit.jsonl`))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
      .map((entry) => (entry.event === "spec.approved" ? { ...entry, ts: APPROVED_AT } : entry));
    await writeFiles(root, {
      [`${CHANGE_DIR}/state.json`]: JSON.stringify({ ...(await state(root)), phase: "testing" }),
      [`${CHANGE_DIR}/audit.jsonl`]: `${audit.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
    });
    const [record] = await changeRecords(await sessionAt(root, AGENT));
    expect(record?.state.phase).toBe("testing");
    expect(record?.phaseSince).toBe(APPROVED_AT);
  });

  it("AC2: serves the tests of each criterion of a change in acceptance, as its card sees them", async () => {
    const root = await tempRepo({ ...APP, ".specty/config.yaml": CONFIG() });
    await cli(root, ["new", "Saludo personalizado"]);
    await writeFiles(root, { [SPEC_PATH]: SPEC });
    expect((await cli(root, ["propose"])).code).toBe(0);
    await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    await cli(root, ["next"]);
    const record = async () => (await changeRecords(await sessionAt(root, AGENT)))[0];
    expect((await record())?.criteriaTests).toBeUndefined();
    await writeFiles(root, {
      "src/app.ts": "export const greet = (name: string) => 'Hola, ' + name;\n",
      "src/app.test.ts": "it('AC1: saluda a Ana', () => {});\n",
    });
    expect((await cli(root, ["task", "done", "T1", "--summary", "Hecho"])).code).toBe(0);
    await writeFiles(root, {
      "src/app.ts": "export const greet = (name = 'mundo') => 'Hola, ' + name;\n",
    });
    expect((await cli(root, ["task", "done", "T2", "--summary", "Hecho"])).code).toBe(0);
    const accepting = await record();
    expect(accepting?.state.phase).toBe("acceptance");
    expect(accepting?.criteriaTests).toEqual([
      {
        id: "AC1",
        manual: false,
        owed: true,
        tests: [
          {
            path: "src/app.test.ts",
            line: 1,
            task: "T1",
            commit: accepting?.state.tasks.T1?.commit,
          },
        ],
      },
    ]);
  });

  it("AC5: dates the implementation from the tests' approval, or from a bug's red locking", async () => {
    const root = await tempRepo({ ...APP, ".specty/config.yaml": CONFIG() });
    await cli(root, ["new", "Saludo personalizado"]);
    await writeFiles(root, { [SPEC_PATH]: SPEC });
    expect((await cli(root, ["propose"])).code).toBe(0);
    await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    const lines = (await read(root, `${CHANGE_DIR}/audit.jsonl`)).trim().split("\n");
    const audit = lines
      .map((line) => JSON.parse(line))
      .map((entry) => (entry.event === "spec.approved" ? { ...entry, ts: APPROVED_AT } : entry));
    const LATER = "2026-10-20T11:00:00.000Z";
    for (const event of ["tests.approved", "tests.locked"]) {
      // Approved at APPROVED_AT, it went through testing and left it later, by `event`.
      const left = [...audit, { ts: LATER, actor: "human", event, data: {} }];
      await writeFiles(root, {
        [`${CHANGE_DIR}/audit.jsonl`]: `${left.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
      });
      const [record] = await changeRecords(await sessionAt(root, AGENT));
      expect([event, record?.state.phase, record?.phaseSince]).toEqual([
        event,
        "implementing",
        LATER,
      ]);
    }
  });
});

describe("whether accepting closes a change without its closing phase", () => {
  it("AC5: serves withoutClosing for a standard change in acceptance whose folder has flow.closing: false, and not for a slice nor with the key true or absent", async () => {
    const without = `${CONFIG()}flow:\n  closing: false\n`;
    const root = await tempRepo({ ...APP, ".specty/config.yaml": without });
    await cli(root, ["new", "Saludo personalizado"]);
    await writeFiles(root, { [SPEC_PATH]: SPEC });
    expect((await cli(root, ["propose"])).code).toBe(0);
    await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    // No task needs to run: the state says it reached acceptance.
    await writeFiles(root, {
      [`${CHANGE_DIR}/state.json`]: JSON.stringify({ ...(await state(root)), phase: "acceptance" }),
    });
    const record = async () => (await changeRecords(await sessionAt(root, AGENT)))[0];
    const accepting = await record();
    expect(accepting?.state.phase).toBe("acceptance");
    expect(accepting?.withoutClosing).toBe(true);

    await writeFiles(root, { ".specty/config.yaml": `${CONFIG()}flow:\n  closing: true\n` });
    expect(await record()).not.toHaveProperty("withoutClosing");
    await writeFiles(root, { ".specty/config.yaml": CONFIG() });
    expect(await record()).not.toHaveProperty("withoutClosing");

    await writeFiles(root, {
      ".specty/config.yaml": without,
      [SPEC_PATH]: SPEC.replace(
        "kind: standard\n",
        "kind: standard\nepic: 20261101-una-epica\nslice: C1\n",
      ),
    });
    expect(await record()).not.toHaveProperty("withoutClosing");
  });
});
