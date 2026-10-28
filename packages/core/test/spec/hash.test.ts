// SPDX-License-Identifier: Apache-2.0
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canonicalize, shortHash, specDelta, specHash, withPendingTasks } from "../../src";
import { fixture, specOf } from "../helpers";
import { specArbitrary } from "./arbitraries";

const STANDARD = fixture("standard.es.md");
const hashOf = (text: string) => canonicalize(text).hash;

describe("revision hash", () => {
  it("ignores formatting that does not change meaning", () => {
    const base = hashOf(STANDARD);
    expect(hashOf(STANDARD.replace("- [ ] T1", "- [x] T1"))).toBe(base);
    expect(hashOf(STANDARD.replace(/\n/g, "\r\n"))).toBe(base);
    expect(hashOf(STANDARD.normalize("NFD"))).toBe(base);
    expect(hashOf(STANDARD.replace("mensaje de tendencia.", "mensaje de tendencia.   "))).toBe(
      base,
    );
    expect(hashOf(STANDARD.replace("## Objetivo\n", "## Objetivo\n<!-- pista -->\n"))).toBe(base);
    const risks = STANDARD.slice(STANDARD.indexOf("## Riesgos"));
    const reordered = STANDARD.replace(risks, "").replace("## Supuestos", `${risks}\n## Supuestos`);
    expect(hashOf(reordered)).toBe(base);
  });

  it("changes when the content changes", () => {
    expect(hashOf(STANDARD.replace("sin recargar", "sin parpadear"))).not.toBe(hashOf(STANDARD));
  });

  it("never depends on task checkboxes", () => {
    fc.assert(
      fc.property(specArbitrary, (spec) => {
        expect(specHash(withPendingTasks(spec))).toBe(specHash(spec));
      }),
      { numRuns: 100 },
    );
  });

  it("has a short form for commit trailers", () => {
    expect(shortHash("sha256:4be1c2d9f0aa")).toBe("4be1c2d");
  });
});

describe("specDelta", () => {
  it("lists what changed, in canonical order", () => {
    const after = STANDARD.replace('"Por periodo" agrupa', '"Por periodo" agrupa siempre')
      .replace(STANDARD.slice(STANDARD.indexOf("## Riesgos")), "")
      .replace(
        "- crear test/features/analytics/evolucion_card_test.dart — pruebas de widget",
        "- crear test/features/analytics/evolucion_card_test.dart — pruebas de widget\n- crear lib/features/analytics/insight.dart — mensaje de tendencia",
      )
      .concat(
        "- [ ] T3: Mensaje de tendencia\n  - files: lib/features/analytics/insight.dart\n  - ac: AC1\n",
      )
      .replace("- [ ] T1", "- [x] T1");
    const delta = specDelta(specOf(STANDARD), specOf(after));
    expect(delta.entries).toEqual([
      { key: "section:risks", kind: "section", change: "removed" },
      { key: "A2", kind: "assumption", change: "modified" },
      { key: "file:lib/features/analytics/insight.dart", kind: "file", change: "added" },
      { key: "T3", kind: "task", change: "added" },
      { key: "R1", kind: "risk", change: "removed" },
    ]);
  });

  it("sees `test: manual` as a change of its criterion (AC1)", () => {
    const manual = STANDARD.replace(/(- AC1: [^\n]*\n)/, "$1  - test: manual\n");
    expect(manual).not.toBe(STANDARD);
    expect(hashOf(manual)).not.toBe(hashOf(STANDARD));
    expect(specDelta(specOf(STANDARD), specOf(manual)).entries).toEqual([
      { key: "AC1", kind: "criterion", change: "modified" },
    ]);
  });

  it("is empty when only checkboxes change", () => {
    const delta = specDelta(specOf(STANDARD), specOf(STANDARD.replace("- [ ] T2", "- [x] T2")));
    expect(delta.isEmpty).toBe(true);
  });
});
