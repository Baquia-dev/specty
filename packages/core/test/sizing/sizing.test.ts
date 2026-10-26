// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  computeSize,
  DEFAULT_CONFIG,
  effortLine,
  formatSizeReason,
  recommendEffort,
  recommendTaskEffort,
  type Task,
} from "../../src";
import { check, fixture, specOf } from "../helpers";

const STANDARD = fixture("standard.es.md");

describe("computeSize", () => {
  it("sizes the standard example as M", () => {
    const size = computeSize(specOf(STANDARD), DEFAULT_CONFIG);
    expect(size).toMatchObject({ level: "M", baseLevel: "M", score: 5, adjust: 0 });
    expect(size.signals.modules).toEqual(["analytics", "home"]);
    expect(size.reasons.map((reason) => formatSizeReason(reason, "es"))).toEqual([
      "3 archivos",
      "2 módulos",
    ]);
  });

  it("uses repository signals when the CLI provides them", () => {
    const size = computeSize(specOf(STANDARD), DEFAULT_CONFIG, {
      modulesWithoutTests: ["analytics", "auth"],
    });
    expect(size.score).toBe(7);
    expect(size.reasons.map((reason) => formatSizeReason(reason, "en"))).toEqual([
      "3 files",
      "2 modules",
      "no tests in analytics",
    ]);
  });

  it("lets the model raise one level, with a visible reason", () => {
    const text = STANDARD.replace(
      "kind: standard",
      "kind: standard\nestimate:\n  adjust: 1\n  reason: Fechas ambiguas",
    );
    const size = computeSize(specOf(text), DEFAULT_CONFIG);
    expect(size).toMatchObject({ level: "L", baseLevel: "M", adjust: 1 });
    expect(formatSizeReason(size.reasons.at(-1) ?? { code: "dependencies" }, "es")).toBe(
      "ajuste del modelo (+1): Fechas ambiguas",
    );
  });

  it("never lets the model lower the size, and says so", () => {
    const text = STANDARD.replace(
      "kind: standard",
      "kind: standard\nestimate:\n  adjust: -1\n  reason: Solo copia",
    );
    const size = computeSize(specOf(text), DEFAULT_CONFIG);
    expect(size).toMatchObject({ level: "M", baseLevel: "M", adjust: 0 });
    expect(formatSizeReason(size.reasons.at(-1) ?? { code: "dependencies" }, "es")).toBe(
      "ajuste del modelo (-1) sin aplicar: el tamaño solo puede subir",
    );
  });

  it("keeps asking to split an XL change that tries to lower itself", () => {
    const lowered = STANDARD.replace(
      "kind: standard",
      "kind: standard\nestimate:\n  adjust: -1\n  reason: Es fácil",
    );
    // A tiny size scale makes the example XL by its score.
    const config = { ...DEFAULT_CONFIG, size: { S: 1, M: 2, L: 3 } };
    expect(computeSize(specOf(lowered), config).level).toBe("XL");
    expect(check(lowered, { config })).toContain("split-required");
  });

  it("counts as modules only governed paths, not documentation", () => {
    const text = STANDARD.replace(
      "\n## Tareas",
      "- modificar docs/ARCHITECTURE.md — diseño\n- modificar lib/README.md — uso\n\n## Tareas",
    );
    const size = computeSize(specOf(text), DEFAULT_CONFIG);
    expect(size.signals.modules).toEqual(["analytics", "home"]);
    // Nor files: what is not governed does not weigh in the size.
    expect(size.signals.fileCount).toBe(3);
    const governed = computeSize(specOf(text), { ...DEFAULT_CONFIG, ignored: [] });
    expect(governed.signals.modules).toEqual(["analytics", "docs", "home", "lib"]);
  });

  it("counts a glob as its current matches plus one, and a repeated path once", () => {
    const text = STANDARD.replace(
      "\n## Tareas",
      "- modificar lib/features/home/** — vista\n- borrar test/old/** — tests viejos\n\n## Tareas",
    );
    const globMatches = {
      "lib/features/home/**": [
        "lib/features/home/home_estudiante_provider.dart",
        "lib/features/home/home_page.dart",
      ],
      "test/old/**": ["test/old/a_test.dart"],
    };
    const size = computeSize(specOf(text), DEFAULT_CONFIG, { globMatches });
    // The provider is listed by name and matched by the glob: it counts once.
    expect(size.signals.files).toEqual({ create: 1, modify: 4, delete: 2, rename: 0 });
    expect(size.signals.fileCount).toBe(7);
    expect(size.signals.codeFiles).toBe(4);
    // A glob without matches, or without repository data, counts one.
    expect(computeSize(specOf(text), DEFAULT_CONFIG).signals.fileCount).toBe(5);
  });

  it("counts as code files only governed paths that are not tests", () => {
    const text = STANDARD.replace(
      "\n## Tareas",
      "- modificar docs/ARCHITECTURE.md — diseño\n- modificar pubspec.yaml — dependencia\n\n## Tareas",
    );
    const size = computeSize(specOf(text), DEFAULT_CONFIG);
    expect(size.signals.fileCount).toBe(4);
    expect(size.signals.codeFiles).toBe(3);
  });

  it("weighs sensitive paths and dependency changes", () => {
    const text = STANDARD.replace(
      "\n## Tareas",
      "- modificar lib/core/auth/session.dart — sesión\n- modificar pubspec.yaml — dependencia\n\n## Tareas",
    );
    const size = computeSize(specOf(text), DEFAULT_CONFIG);
    expect(size.signals.modules).toEqual(["analytics", "core", "home"]);
    // 5 files + 2 per extra module + 3 per sensitive path + 2 for dependencies.
    expect(size.score).toBe(5 + 2 * 2 + 3 + 2);
    expect(size.reasons.map((reason) => reason.code)).toEqual([
      "files",
      "modules",
      "sensitive",
      "dependencies",
    ]);
  });
});

describe("effort", () => {
  it("recommends more effort for planning than for implementing", () => {
    expect(recommendEffort("M")).toEqual({ plan: "high", implement: "medium" });
    expect(recommendEffort("XL")).toEqual({ plan: "max", implement: "high" });
  });

  it("scales task effort with files and sensitive paths", () => {
    const task = (files: string[]): Task => ({ id: "T1", title: "x", done: false, files });
    expect(recommendTaskEffort(task(["lib/a.dart"]), DEFAULT_CONFIG)).toBe("low");
    expect(recommendTaskEffort(task(["lib/a.dart", "lib/b.dart"]), DEFAULT_CONFIG)).toBe("medium");
    expect(recommendTaskEffort(task(["lib/auth/a.dart"]), DEFAULT_CONFIG)).toBe("high");
  });

  it("lets the model raise the effort, with its reasons, and never lower it", () => {
    const raised = specOf(
      STANDARD.replace(
        "kind: standard",
        "kind: standard\neffort:\n  review: max\n  reason: Fechas ambiguas",
      ).replace(
        "  - verify: flutter test test/features/home\n",
        "$&  - effort: high — toca la caché\n",
      ),
    );
    expect(recommendEffort("M", raised)).toEqual({
      plan: "max",
      implement: "high",
      raisedBy: ["Fechas ambiguas", "toca la caché"],
    });
    const ES: CardContext = {
      lang: "es",
      command: "specty",
      quickMaxFiles: 3,
      implicitTests: true,
    };
    expect(effortLine(recommendEffort("M", raised), ES)).toBe(
      "ESFUERZO RECOMENDADO: implementación alto · revisiones de la spec y del alcance: máximo (el modelo lo sube: Fechas ambiguas; toca la caché)",
    );
    const lowered = specOf(
      STANDARD.replace("kind: standard", "kind: standard\neffort:\n  review: low\n  reason: Fácil"),
    );
    expect(recommendEffort("M", lowered)).toEqual({ plan: "high", implement: "medium" });
    const task = (level: Task["effort"]): Task => ({
      id: "T1",
      title: "x",
      done: false,
      files: ["lib/auth/a.dart"],
      ...(level !== undefined ? { effort: level } : {}),
    });
    expect(recommendTaskEffort(task({ level: "max" }), DEFAULT_CONFIG)).toBe("max");
    expect(recommendTaskEffort(task({ level: "low" }), DEFAULT_CONFIG)).toBe("high");
  });
});
