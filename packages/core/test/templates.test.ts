// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { configTemplate, productQuestions, productTemplate, resolveConfig } from "../src";

describe("the template of .specty/config.yaml", () => {
  it("writes the detected verification and generated files, with comments", () => {
    const text = configTemplate({
      lang: "es",
      verify: { default: "pnpm test", full: "pnpm check" },
      generated: ["src/gen/**"],
    });
    expect(text.split("\n")).toEqual([
      "# Configuración de Specty. Referencia: docs/formats.md §6",
      "version: 1",
      "language: es",
      "mode: individual",
      "# Rutas donde rige el flujo: código que necesita una spec aprobada.",
      'governed: ["**"]',
      "# Rutas libres: documentación y archivos que no son código.",
      'ignored: ["**/*.md","docs/**"]',
      "# Rutas que nunca se aprueban solas y que pesan en el tamaño.",
      'sensitive: ["**/migrations/**","**/auth/**",".github/**","**/.env*","**/infra/**"]',
      "verify:",
      '  default: "pnpm test"',
      '  full: "pnpm check"',
      "  timeoutSec: 600",
      "scope:",
      "  implicitTests: true",
      '  generated: ["src/gen/**"]',
      "  autoApprove: tests-and-generated",
      "policy:",
      "  tests: contract",
      "retro:",
      "  mode: agent",
      "git:",
      "  branchPerChange: true",
      "",
    ]);
  });

  it("leaves out the verification it did not detect, and is a valid configuration", () => {
    const text = configTemplate({ lang: "en", verify: {}, generated: [] });
    expect(text).toContain("# Specty configuration. Reference: docs/formats.md §6\n");
    expect(text).toContain("# Paths under the flow: code that needs an approved spec.\n");
    expect(text).toContain("verify:\n  timeoutSec: 600\n");
    expect(text).not.toContain("default:");
    const result = resolveConfig(parse(text));
    expect(result.ok && result.config.language).toBe("en");
  });
});

describe("the template of PRODUCT.md", () => {
  it("has the seven questions of the interview, in each language", () => {
    expect(productQuestions("es")).toHaveLength(7);
    expect(productQuestions("es")[0]).toEqual([
      "Qué es",
      "¿Qué vas a construir? Una o dos frases.",
    ]);
    expect(productQuestions("en")[6]).toEqual([
      "Constraints",
      "Any constraints? (deadlines, budget, rules, compatibility…)",
    ]);
  });

  it("writes a section per answer, and the question as a comment where there is none", () => {
    const text = productTemplate("Demo", "es", ["Una agenda de citas.", ""]);
    expect(text).toMatch(
      /^# Demo\n\n## Qué es\n\nUna agenda de citas\.\n\n## Para quién\n\n<!-- ¿Para quién es\? -->\n/,
    );
    expect(text).toContain(
      "## Restricciones\n\n<!-- ¿Alguna restricción? (plazos, presupuesto, normas, compatibilidad…) -->\n",
    );
    expect(productTemplate("Demo", "en", [])).toContain(
      "## What it is\n\n<!-- What are you building? One or two sentences. -->\n",
    );
  });
});
