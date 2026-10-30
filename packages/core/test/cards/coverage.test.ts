// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  acceptanceSummary,
  type CardContext,
  type ChangeView,
  type CoverageView,
  coverageLines,
  nextCard,
  renderText,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

const GAPS = [
  { path: "src/a.ts", from: 10, to: 14 },
  { path: "src/a.ts", from: 20, to: 20 },
  { path: "src/b.ts", from: 3, to: 4 },
  { path: "src/b.ts", from: 9, to: 9 },
  { path: "src/c.ts", from: 1, to: 2 },
];

/** 81 of 130 measured lines ran: 62 %, below the default 80. */
const LOW: CoverageView = { measured: 130, covered: 81, gaps: GAPS, stretches: 7, warn: 80 };
/** 120 of 130: 92 %. */
const HIGH: CoverageView = {
  measured: 130,
  covered: 120,
  gaps: [{ path: "src/a.ts", from: 10, to: 14 }],
  stretches: 1,
  warn: 80,
};

const change = (extra: Partial<ChangeView> = {}): ChangeView => ({
  id: "20261020-saludo",
  kind: "standard",
  phase: "acceptance",
  title: "Saludo",
  specPath: ".specty/changes/20261020-saludo/spec.md",
  revision: 1,
  tasks: [
    {
      id: "T1",
      title: "Saludar",
      status: "done",
      files: ["src/a.ts"],
      extras: [],
      criteria: [],
      effort: "medium",
    },
  ],
  conventions: [],
  pendingScope: [],
  rejected: [],
  closingSubmitted: false,
  specChanged: false,
  ...extra,
});

describe("the coverage of the lines the change adds", () => {
  it("AC2: below `checks.coverage.warn` it says so, with the threshold, and lists up to five stretches not run", () => {
    expect(coverageLines(LOW, "es")).toEqual([
      "Los tests ejecutan el 62 % de las 130 líneas que añade el cambio, por debajo del 80 %.",
      "Sin ejecutar: src/a.ts:10-14",
      "Sin ejecutar: src/a.ts:20",
      "Sin ejecutar: src/b.ts:3-4",
      "Sin ejecutar: src/b.ts:9",
      "Sin ejecutar: src/c.ts:1-2",
      "Otros 2 tramos sin ejecutar.",
    ]);
    expect(coverageLines(LOW, "en")).toEqual([
      "The tests run 62% of the 130 lines the change adds, below 80%.",
      "Not run: src/a.ts:10-14",
      "Not run: src/a.ts:20",
      "Not run: src/b.ts:3-4",
      "Not run: src/b.ts:9",
      "Not run: src/c.ts:1-2",
      "2 more stretches not run.",
    ]);
  });

  it("AC2: one more stretch, and a single measured line, read in the singular", () => {
    const one: CoverageView = { ...LOW, stretches: 6 };
    expect(coverageLines(one, "es").at(-1)).toBe("Otro tramo sin ejecutar.");
    expect(coverageLines(one, "en").at(-1)).toBe("1 more stretch not run.");
    const single: CoverageView = { measured: 1, covered: 0, gaps: [], stretches: 0, warn: 80 };
    expect(coverageLines(single, "es")).toEqual([
      "Los tests ejecutan el 0 % de la línea que añade el cambio, por debajo del 80 %.",
    ]);
    expect(coverageLines(single, "en")).toEqual([
      "The tests run 0% of the line the change adds, below 80%.",
    ]);
  });

  it("AC2: at the threshold or above it is a single line, without the stretches", () => {
    expect(coverageLines(HIGH, "es")).toEqual([
      "Los tests ejecutan el 92 % de las 130 líneas que añade el cambio.",
    ]);
    expect(coverageLines(HIGH, "en")).toEqual([
      "The tests run 92% of the 130 lines the change adds.",
    ]);
    // Rounded down, as the check does: 104 of 130 is 80 %, and 103 is 79 %.
    expect(coverageLines({ ...HIGH, covered: 104 }, "es")).toHaveLength(1);
    expect(coverageLines({ ...HIGH, covered: 103 }, "es")[0]).toContain("el 79 %");
  });

  it("AC3: the summary the person sees before accepting shows it, and nothing without it", () => {
    const summary = acceptanceSummary(change({ coverage: LOW }), false, ES);
    expect(summary).toContain(
      "Los tests ejecutan el 62 % de las 130 líneas que añade el cambio, por debajo del 80 %.\nSin ejecutar: src/a.ts:10-14",
    );
    expect(acceptanceSummary(change(), false, ES)).not.toContain("Los tests ejecutan");
  });

  it("AC3: the agent's acceptance card shows it under COVERAGE, and no section without it", () => {
    const card = renderText(nextCard({ change: change({ coverage: HIGH }), dirty: [] }, EN), "en");
    expect(card).toContain("COVERAGE:\n  The tests run 92% of the 130 lines the change adds.");
    const es = renderText(nextCard({ change: change({ coverage: HIGH }), dirty: [] }, ES), "es");
    expect(es).toContain(
      "COBERTURA:\n  Los tests ejecutan el 92 % de las 130 líneas que añade el cambio.",
    );
    const without = renderText(nextCard({ change: change(), dirty: [] }, ES), "es");
    expect(without).not.toContain("COBERTURA");
  });
});
