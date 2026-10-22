// SPDX-License-Identifier: Apache-2.0
import { PHASES, type Phase } from "@baquia-dev/specty-core";
import { approvedNote, revisionName, revisionState } from "./revision";

const NOW = Date.parse("2026-10-22T10:00:00Z");
const APPROVED = { revision: 2, at: "2026-10-21T15:02:11Z", by: "Ana Gómez" };

describe("revision", () => {
  it("names the revision by its number and what it is (AC1)", () => {
    expect(revisionName({ phase: "review", revision: 3 })).toEqual({
      es: "Revisión 3 · por aprobar",
      en: "Revision 3 · to approve",
    });
    expect(revisionName({ phase: "implementing", revision: 2, approved: APPROVED }).es).toBe(
      "Revisión 2 · aprobada",
    );
    expect(revisionName({ phase: "draft", revision: 0 })).toEqual({
      es: "Sin proponer",
      en: "Not proposed",
    });
  });

  it("has a state for every phase", () => {
    const states = new Map<Phase, string>(
      PHASES.map((phase) => [phase, revisionState({ phase, revision: 1 }).es]),
    );
    expect(Object.fromEntries(states)).toEqual({
      draft: "sin proponer",
      review: "por aprobar",
      implementing: "aprobada",
      acceptance: "aprobada",
      adjusting: "aprobada, en ajuste",
      closing: "cierre por confirmar",
      done: "cerrada",
      cancelled: "cancelada",
    });
  });

  it("says which revision is approved, when and by whom (AC1)", () => {
    const review = { phase: "review" as const, revision: 3, approved: APPROVED };
    expect(approvedNote(review, "es", NOW)).toBe("La 2 está aprobada · 21 oct · Ana Gómez");
    expect(approvedNote(review, "en", NOW)).toBe("Revision 2 is approved · Oct 21 · Ana Gómez");
    const current = { phase: "implementing" as const, revision: 2, approved: APPROVED };
    expect(approvedNote(current, "es", NOW)).toBe("Aprobada el 21 oct · Ana Gómez");
    expect(approvedNote(current, "en", NOW)).toBe("Approved on Oct 21 · Ana Gómez");
    expect(approvedNote({ phase: "review", revision: 1 }, "es", NOW)).toBeUndefined();
  });

  it("adds the year to an approval from another year", () => {
    const old = { ...APPROVED, at: "2025-12-30T09:00:00Z" };
    expect(approvedNote({ phase: "acceptance", revision: 2, approved: old }, "es", NOW)).toBe(
      "Aprobada el 30 dic 2025 · Ana Gómez",
    );
  });
});
