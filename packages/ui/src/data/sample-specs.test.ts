// SPDX-License-Identifier: Apache-2.0
import { parseChangeState, parseSpec } from "@baquia-dev/specty-core";
import { sampleRecords } from "./sample-records";
import { deriveViews } from "./views";

const sample = (id: string) => {
  const record = sampleRecords(Date.now()).find((item) => item.state.id === id);
  if (record === undefined) throw new Error(`no sample ${id}`);
  return record;
};

describe("sample data", () => {
  it("is valid for core: states pass and specs parse without errors (AC9)", () => {
    for (const record of sampleRecords(Date.now())) {
      expect(parseChangeState(record.state).ok, record.state.id).toBe(true);
      const approved = record.approvedSpec === undefined ? [] : [record.approvedSpec];
      for (const text of [record.spec, ...approved]) {
        const errors = parseSpec(text).diagnostics.filter((d) => d.severity === "error");
        expect(errors, record.state.id).toEqual([]);
      }
    }
  });

  it("has a change back in review after an adjustment, with its delta (AC1, AC3)", () => {
    const view = deriveViews([sample("20261016-justificar-faltas")])[0];
    expect(view?.review.errors).toEqual([]);
    expect(view?.highImpactPending).toBe(1);
    expect(view?.review.delta?.approvedRevision).toBe(2);
    expect(view?.review.delta?.entries.map((entry) => `${entry.change} ${entry.key}`)).toEqual([
      "modified goal",
      "modified A2",
      "modified A3",
      "modified AC2",
      "added AC4",
      "added lib/notifications/absence_notice.dart",
      "added T3",
      "added T4",
      "removed R1",
      "added R2",
    ]);
    const newScope = view?.review.delta?.entries.filter((entry) => entry.newScope.length > 0);
    expect(newScope?.map((entry) => entry.key)).toEqual(["T4"]);
  });

  it("has a closing sent for confirmation, in its four parts", () => {
    const view = deriveViews([sample("20261017-recordatorios-correo")])[0];
    expect(view?.decision).toBe("closing");
    const { summary, deviations, decisions, pending, other } = view?.closing ?? {};
    for (const part of [summary, deviations, decisions, pending]) expect(part).not.toBe("");
    expect(other).toBe("");
    expect(pending).toContain("La plantilla en inglés");
  });
});
