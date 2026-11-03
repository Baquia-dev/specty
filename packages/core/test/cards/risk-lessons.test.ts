// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { riskLessons, riskLessonsLine } from "../../src";

const TASKS = [
  {
    risks: [
      { path: "src/run.ts", line: 3, rule: "shell", cwe: "CWE-78" },
      { path: "src/run.ts", line: 9, rule: "shell", cwe: "CWE-78" },
    ],
  },
  {
    risks: [
      { path: "src/run.ts", line: 12, rule: "eval", cwe: "CWE-95" },
      { path: "src/pay/webhook.ts", rule: "risky-path" },
    ],
  },
  {},
] as const;

describe("the lessons of the accepted risks", () => {
  it("AC1: one lesson of its file for each file and pattern, without the line", () => {
    expect(riskLessons(TASKS, "es")).toEqual([
      {
        text: "Riesgo aceptado en `src/run.ts`: ejecuta comandos a través de la shell (CWE-78). Revísalo antes de ampliarlo.",
        paths: ["src/run.ts"],
      },
      {
        text: "Riesgo aceptado en `src/run.ts`: ejecuta código construido al vuelo (eval) (CWE-95). Revísalo antes de ampliarlo.",
        paths: ["src/run.ts"],
      },
      {
        text: "Riesgo aceptado en `src/pay/webhook.ts`: está en una ruta de pagos, webhooks o seguridad. Revísalo antes de ampliarlo.",
        paths: ["src/pay/webhook.ts"],
      },
    ]);
    expect(riskLessons(TASKS, "en")[0]).toEqual({
      text: "Accepted risk in `src/run.ts`: runs commands through the shell (CWE-78). Review it before extending it.",
      paths: ["src/run.ts"],
    });
    expect(riskLessons([{}], "es")).toEqual([]);
  });

  it("AC1: the line of accept names the entries it added, and there is none without them", () => {
    expect(riskLessonsLine(["P3", "P4"], "es")).toBe(
      "Riesgos aceptados, anotados en la memoria como lecciones de sus archivos: P3, P4.",
    );
    expect(riskLessonsLine(["P3"], "en")).toBe(
      "Accepted risks, added to the memory as lessons of their files: P3.",
    );
    expect(riskLessonsLine([], "es")).toBeUndefined();
  });
});
