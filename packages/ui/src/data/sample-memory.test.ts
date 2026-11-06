// SPDX-License-Identifier: Apache-2.0
// The prototype's memory: a sample change shows on its page what it left and what it took.
import { sampleRecords } from "./fixtures";
import { sampleMemory } from "./sample-memory";
import { deriveViews } from "./views";

const DONE = "20261015-redondeo-promedios";

describe("the prototype's memory", () => {
  it("AC1: the done sample change left an open pending item and took an improvement, now done", () => {
    const { entries } = sampleMemory();
    const left = entries.filter((entry) => entry.origin.change === DONE);
    const took = entries.filter((entry) => entry.taken?.change === DONE);
    expect(left.some((entry) => entry.kind === "pending" && entry.status === "open")).toBe(true);
    expect(took.some((entry) => entry.kind === "improvement" && entry.status === "done")).toBe(
      true,
    );
  });

  it("AC1: names each sample change an entry came from by its title, kind and phase in the prototype", () => {
    const origins = sampleMemory().origins ?? {};
    const sample = deriveViews(sampleRecords(Date.now())).filter(
      (view) => origins[view.id] !== undefined,
    );
    expect(sample.map((view) => view.id)).toContain(DONE);
    for (const view of sample)
      expect(origins[view.id]).toMatchObject({
        title: view.title,
        kind: view.kind,
        phase: view.phase,
      });
  });
});
