// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  CHANGE,
  CONFIG,
  cli,
  APP as FILES,
  inWorktree,
  person,
  read,
  toAcceptance,
  writeFiles,
} from "./support";

/** The full verification copies it to `coverage/lcov.info`, a report path by default. */
const FIXTURE = "fixture.lcov";
const FULL = `mkdir -p coverage && cp ${FIXTURE} coverage/lcov.info`;
/** The change ends with `src/app.ts` as a single line: a test runs it, or none does. */
const RUN = "SF:src/app.ts\nDA:1,3\nend_of_record\n";
const NOT_RUN = "SF:src/app.ts\nDA:1,0\nend_of_record\n";

const ALL_RUN = "Los tests ejecutan el 100 % de la línea que añade el cambio.";

/** SPEC's change in acceptance, whose full verification leaves `lcov` as its report, or none. */
async function inAcceptance(lcov: string | undefined): Promise<string> {
  const full = lcov === undefined ? "echo sin informe" : FULL;
  const { folder } = await inWorktree({
    ...FILES,
    ".gitignore": "coverage/\n",
    ...(lcov === undefined ? {} : { [FIXTURE]: lcov }),
    ".specty/config.yaml": `${CONFIG()}  full: ${JSON.stringify(full)}\n`,
  });
  await toAcceptance(folder);
  return folder;
}

/** Runs the full verification and stops before accepting: the note it left. */
async function verifyWithoutAccepting(folder: string): Promise<string> {
  const terminal = person({ confirm: [true, false] });
  await cli(folder, ["accept"], { terminal });
  const note = terminal.notes.find((text) => text.startsWith("Verificación correcta"));
  expect(note).toBeDefined();
  return note ?? "";
}

/** The data of the last `change.verified` in the change's audit. */
async function lastVerified(folder: string): Promise<Record<string, unknown>> {
  const audit = await read(folder, `.specty/changes/${CHANGE}/audit.jsonl`);
  const entries = audit
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line): { event: string; data: Record<string, unknown> } => JSON.parse(line));
  const verified = entries.filter((entry) => entry.event === "change.verified").at(-1);
  expect(verified).toBeDefined();
  return verified?.data ?? {};
}

describe("the full verification of `accept` measures the lines the change adds", () => {
  it("AC1: its note says how much of them the tests ran, and `change.verified` keeps it", async () => {
    const folder = await inAcceptance(RUN);
    const note = await verifyWithoutAccepting(folder);
    expect(note).toContain(ALL_RUN);
    expect(note).not.toContain("Sin ejecutar");
    expect((await lastVerified(folder)).coverage).toEqual({
      measured: 1,
      covered: 1,
      gaps: [],
      stretches: 0,
    });
  });

  it("AC1: without a report, the note and the audit carry no coverage", async () => {
    const folder = await inAcceptance(undefined);
    const note = await verifyWithoutAccepting(folder);
    expect(note).not.toContain("Los tests ejecutan");
    expect(await lastVerified(folder)).not.toHaveProperty("coverage");
  });

  it("AC2: below `checks.coverage.warn` the note says so and names the stretch no test ran", async () => {
    const folder = await inAcceptance(NOT_RUN);
    const note = await verifyWithoutAccepting(folder);
    expect(note).toContain(
      "Los tests ejecutan el 0 % de la línea que añade el cambio, por debajo del 80 %.\nSin ejecutar: src/app.ts:1",
    );
    expect((await lastVerified(folder)).coverage).toEqual({
      measured: 1,
      covered: 0,
      gaps: [{ path: "src/app.ts", from: 1, to: 1 }],
      stretches: 1,
    });
  });
});

describe("the acceptance shows the coverage of the last full verification on this code", () => {
  it("AC3: the agent's card and the person's summary show it once a verification kept it", async () => {
    const folder = await inAcceptance(RUN);
    expect((await cli(folder, ["next"])).out).not.toContain("COBERTURA");
    await verifyWithoutAccepting(folder);
    expect((await cli(folder, ["next"])).out).toContain(`COBERTURA:\n  ${ALL_RUN}`);
    const terminal = person({ confirm: [false] });
    await cli(folder, ["accept"], { terminal });
    expect(terminal.notes[0]).toContain(ALL_RUN);
  });

  it("AC3: once the code changes, the coverage of that verification no longer shows", async () => {
    const folder = await inAcceptance(RUN);
    await verifyWithoutAccepting(folder);
    await writeFiles(folder, { "src/app.ts": "3\n" });
    expect((await cli(folder, ["next"])).out).not.toContain("COBERTURA");
  });
});
