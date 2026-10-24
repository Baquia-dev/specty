// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type DiagnosticCode, formatSizeReason, LANGS, type SizeReason } from "../../src";
import { diagnostic } from "../../src/spec/diagnostics";
import { MESSAGES_EN } from "../../src/spec/messages.en";
import { MESSAGES_ES } from "../../src/spec/messages.es";
import { formatBreach, formatQuickProblem } from "../../src/validate/limits";

const PARAMS = {
  section: "Supuestos",
  heading: "Notas",
  valid: "Objetivo, Tareas",
  kind: "standard",
  example: "- A1: texto",
  id: "T1",
  prefix: "A",
  field: "files",
  value: "x",
  path: "lib/a.dart",
  problem: "absolute",
  action: "tocar",
  ref: "AC9",
  by: "task",
  detail: "9 tareas, máximo 8",
  cycle: "C1 → C2 → C1",
  target: "section:goal",
  next: "A3",
  terms: "rápido",
  count: 6,
  max: 5,
  policy: "recommended",
};

const isCode = (key: string): key is DiagnosticCode => key in MESSAGES_ES;
const CODES = Object.keys(MESSAGES_ES).filter(isCode);

describe("messages", () => {
  it("has the same codes in every language", () => {
    expect(Object.keys(MESSAGES_EN).toSorted()).toEqual(Object.keys(MESSAGES_ES).toSorted());
  });

  it.each(LANGS)("renders every message in %s as a full, actionable sentence", (lang) => {
    for (const code of CODES) {
      const message = diagnostic(lang, { code, params: PARAMS }).message;
      expect(message, code).not.toMatch(/undefined|\$\{/);
      expect(message, code).toMatch(/[.)]$/);
    }
  });

  it("translates path problems instead of showing their codes", () => {
    expect(diagnostic("es", { code: "path-invalid", params: PARAMS }).message).toContain(
      "usa una ruta relativa",
    );
    expect(diagnostic("en", { code: "path-invalid", params: PARAMS }).message).toContain(
      "use a path relative",
    );
  });
});

describe("size and limit texts", () => {
  const reasons: SizeReason[] = [
    { code: "files", count: 1 },
    { code: "modules", count: 2 },
    { code: "sensitive", count: 1 },
    { code: "tasks", count: 5 },
    { code: "fan-in", count: 2 },
    { code: "dependencies" },
    { code: "no-tests", modules: ["home", "grades"] },
    { code: "adjusted", adjust: -1, reason: "solo copia" },
  ];

  it("formats every size reason in both languages", () => {
    expect(reasons.map((reason) => formatSizeReason(reason, "es"))).toEqual([
      "1 archivo",
      "2 módulos",
      "1 ruta sensible",
      "5 tareas",
      "2 archivos muy importados",
      "cambia dependencias",
      "sin tests en home, grades",
      "ajuste del modelo (-1): solo copia",
    ]);
    expect(reasons.map((reason) => formatSizeReason(reason, "en"))).toEqual([
      "1 file",
      "2 modules",
      "1 sensitive path",
      "5 tasks",
      "2 widely imported files",
      "changes dependencies",
      "no tests in home, grades",
      "model adjustment (-1): solo copia",
    ]);
  });

  it("formats breaches and quick-lane problems in both languages", () => {
    expect(formatBreach({ metric: "files", value: 16, max: 15 }, "es")).toBe(
      "16 archivos de código, máximo 15",
    );
    expect(formatBreach({ metric: "modules", value: 3, max: 2 }, "en")).toBe("3 modules, max 2");
    expect(formatBreach({ metric: "level", value: "XL" }, "es")).toBe("tamaño XL");
    expect(formatBreach({ metric: "level", value: "XL" }, "en")).toBe("size XL");
    expect(formatQuickProblem({ kind: "tasks", value: 2 }, "es")).toBe(
      "2 tareas; quick admite una",
    );
    expect(formatQuickProblem({ kind: "files", value: 4, max: 3 }, "es")).toBe(
      "4 archivos de código, máximo 3",
    );
    expect(formatQuickProblem({ kind: "sensitive" }, "es")).toBe("toca rutas sensibles");
  });
});
