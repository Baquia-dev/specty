// SPDX-License-Identifier: Apache-2.0
import { requestOf } from "./asked";
import { sampleRecords } from "./fixtures";
import type { AuditRecord } from "./progress";
import { deriveViews } from "./views";

const created = (data: Readonly<Record<string, unknown>>): AuditRecord => ({
  ts: "2026-10-24T10:00:00Z",
  actor: "agent",
  event: "change.created",
  data,
});

describe("requestOf", () => {
  it("gives the person's request word for word, and nothing without one (AC1)", () => {
    const request = "Quiero ver la evolución  por trimestre.";
    expect(requestOf([created({ kind: "standard", request })])).toBe(request);
    expect(requestOf([created({ kind: "standard" })])).toBeUndefined();
    expect(requestOf([created({ request: "   " })])).toBeUndefined();
    expect(requestOf([created({ request: 3 })])).toBeUndefined();
    expect(requestOf([])).toBeUndefined();
  });

  it("reaches the view, and the sample change in review has one (AC1, AC3)", () => {
    const views = deriveViews(sampleRecords(Date.now()));
    const review = views.find((view) => view.id === "20261020-evolucion-trimestre");
    expect(review?.request).toContain("por trimestre");
    expect(views.find((view) => view.id === "20261021-modo-oscuro")?.request).toBeUndefined();
  });
});
