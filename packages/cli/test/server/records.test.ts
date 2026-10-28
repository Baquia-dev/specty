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
