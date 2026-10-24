// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { parseSpec, serializeSpec } from "../../src";
import { fixture, label, lineOf } from "../helpers";

const codes = (text: string): string[] => parseSpec(text).diagnostics.map(label);

const MINIMAL = "---\nkind: quick\n---\n\n# Título\n\n## Objetivo\n\nAlgo.\n";

describe("parseSpec", () => {
  it("reads the standard example into the model", () => {
    const text = fixture("standard.es.md");
    const { spec, locations } = parseSpec(text);
    expect(spec.language).toBe("es");
    expect(spec.frontmatter).toEqual({ kind: "standard", follows: [], dependsOn: [] });
    expect(spec.title).toBe("Mi evolución académica");
    expect(spec.sections.assumptions?.items).toEqual([
      {
        id: "A1",
        text: "Las series por materia ya llegan en el provider actual; no hace falta cambiar la API.",
        impact: "high",
      },
      { id: "A2", text: '"Por periodo" agrupa por trimestres académicos.' },
    ]);
    expect(spec.sections.files?.items.map((entry) => entry.action)).toEqual([
      "modify",
      "modify",
      "create",
    ]);
    expect(spec.sections.tasks?.items[1]).toEqual({
      id: "T2",
      title: "Rediseñar la tarjeta de evolución",
      done: false,
      files: [
        "lib/features/analytics/analytics_estudiante_dashboard_cards.dart",
        "test/features/analytics/evolucion_card_test.dart",
      ],
      ac: ["AC1", "AC2"],
      verify: "flutter test test/features/analytics",
    });
    expect(locations.items.T2).toBe(lineOf(text, "- [ ] T2"));
    expect(locations.sections.risks).toBe(lineOf(text, "## Riesgos"));
    expect(locations.files["lib/features/home/home_estudiante_provider.dart"]).toBe(
      lineOf(text, "- modificar lib/features/home"),
    );
  });

  it("detects English specs", () => {
    const { spec } = parseSpec(fixture("quick.en.md"));
    expect(spec.language).toBe("en");
    expect(spec.sections.tasks?.items[0]?.type).toBe("fix");
  });

  it("keeps fenced blocks and their headings inside prose", () => {
    const text = `${MINIMAL}\n## Diseño\n\n\`\`\`md\n## Not a section\n<!-- kept -->\n\`\`\`\n`;
    const { spec, diagnostics } = parseSpec(text);
    expect(diagnostics).toEqual([]);
    expect(spec.sections.design).toBe("```md\n## Not a section\n<!-- kept -->\n```");
  });

  it("removes HTML comments outside code, including multi-line ones", () => {
    const text = MINIMAL.replace("Algo.", "Uno <!-- pista --> dos.\n<!-- a\nb -->\nTres.");
    expect(parseSpec(text).spec.sections.goal).toBe("Uno  dos.\nTres.");
  });

  it("reports a comment that never closes, at the line where it opens (AC1)", () => {
    const body = "Algo.\nOtra <!-- a --> línea <!-- sin cierre\n\n## Archivos\n\n- crear a.ts — a";
    const text = MINIMAL.replace("Algo.", body);
    const unclosed = parseSpec(text).diagnostics.find(({ code }) => code === "comment-unclosed");
    expect(unclosed).toMatchObject({ severity: "error", line: lineOf(text, "Otra <!--") });
    expect(unclosed?.message).toBe(
      "Un comentario `<!--` se abre y no se cierra: todo lo que sigue queda oculto. Ciérralo con `-->`.",
    );
    // One that closes several lines later is fine, as before.
    expect(codes(MINIMAL.replace("Algo.", "Algo.\n<!-- a\nb -->"))).toEqual([]);
    const english = parseSpec("---\nkind: quick\n---\n\n# Title\n\n## Goal\n\nX <!-- open\n");
    expect(english.diagnostics.find(({ code }) => code === "comment-unclosed")?.message).toContain(
      "everything after it is hidden",
    );
  });

  it("parses renames and backticked paths", () => {
    const text = `${MINIMAL}\n## Archivos\n\n- renombrar \`a b.ts\` -> src/c.ts — mover\n`;
    expect(parseSpec(text).spec.sections.files?.items).toEqual([
      { action: "rename", from: "a b.ts", path: "src/c.ts", reason: "mover" },
    ]);
  });

  it("reports frontmatter problems", () => {
    expect(codes("# T\n\n## Objetivo\n\nX.\n")).toEqual(["frontmatter-missing"]);
    expect(codes("---\nkind: standard\n# T\n")).toContain("frontmatter-unclosed");
    expect(codes("---\nkind: big\n---\n\n# T\n")).toEqual(["frontmatter-invalid"]);
    expect(codes("---\nkind: quick\nowner: me\n---\n\n# T\n")).toEqual(["frontmatter-invalid"]);
    expect(codes("---\nkind: [\n---\n\n# T\n")).toEqual(["frontmatter-invalid"]);
  });

  it("reads the dependencies a change may add, and writes them back", () => {
    const text = `---\nkind: quick\nallowedDependencies: [zod, "@angular/*"]\n---\n\n# T\n\n## Objetivo\n\nA.\n`;
    const { spec, diagnostics } = parseSpec(text);
    expect(diagnostics).toEqual([]);
    expect(spec.frontmatter.allowedDependencies).toEqual(["zod", "@angular/*"]);
    expect(serializeSpec(spec)).toContain('allowedDependencies:\n  - zod\n  - "@angular/*"\n');
    expect(serializeSpec(parseSpec(MINIMAL).spec)).not.toContain("allowedDependencies");
    expect(codes('---\nkind: quick\nallowedDependencies: [""]\n---\n\n# T\n')).toEqual([
      "frontmatter-invalid",
    ]);
  });

  it("reports layout problems", () => {
    expect(codes("---\nkind: quick\n---\n\n## Objetivo\n\nX.\n")).toEqual(["title-missing"]);
    expect(codes(`${MINIMAL}\n# Otro título\n`)).toEqual(["title-duplicate"]);
    expect(codes("---\nkind: quick\n---\n\n# T\nsuelto\n\n## Objetivo\n\nX.\n")).toEqual([
      "text-outside-section",
    ]);
    expect(codes(`${MINIMAL}\n## Notas\n\nX.\n`)).toEqual(["section-unknown"]);
    expect(codes(`${MINIMAL}\n## Objetivo\n\nOtra vez.\n`)).toEqual([
      "section-duplicate:section:goal",
    ]);
  });

  it("reports malformed list items", () => {
    const list = (body: string) => codes(`${MINIMAL}\n## Supuestos\n\n${body}\n`);
    expect(list("texto suelto")).toEqual(["line-invalid"]);
    expect(list("- sin id")).toEqual(["item-invalid"]);
    expect(list("- T1: tarea en supuestos")).toEqual(["item-prefix:T1"]);
    expect(list("- A1: uno\n- A1: dos")).toEqual(["item-duplicate:A1"]);
    expect(list("- A1: uno\n- Ninguno")).toEqual(["item-none-mixed"]);
    expect(list("- A1: uno\n  - color: rojo")).toEqual(["field-unknown:A1"]);
    expect(list("- A1: uno\n  - impacto: enorme")).toEqual(["field-invalid:A1"]);
    expect(list("```\n- A1: uno\n```")).toEqual(["fence-not-allowed"]);
  });

  it("reports invalid tasks and files", () => {
    const tasks = (body: string) => codes(`${MINIMAL}\n## Tareas\n\n${body}\n`);
    expect(tasks("- [ ] T1: x\n  - type: feature")).toEqual(["field-invalid:T1"]);
    expect(tasks("- [ ] T1: x\n  - ac: B1")).toEqual(["field-invalid:T1"]);
    expect(tasks("- [ ] T1: x\n  - files: /etc/hosts")).toEqual(["path-invalid:T1"]);
    expect(tasks("- [ ] T1: x\n  - verify: a\n  - verify: b")).toEqual(["field-duplicate:T1"]);
    const files = (body: string) => codes(`${MINIMAL}\n## Archivos\n\n${body}\n`);
    expect(files("- tocar src/a.ts")).toEqual(["file-action-unknown"]);
    expect(files("- modificar ../a.ts")).toEqual(["path-invalid"]);
    expect(files("- modificar src/")).toEqual(["path-invalid"]);
    expect(files("- renombrar src/a.ts — sin destino")).toEqual(["file-rename-target"]);
    expect(files("- crear src/a.ts\n- modificar src/a.ts")).toEqual(["file-duplicate:src/a.ts"]);
  });

  it("reads the effort the model recommends, for the review and for each task", () => {
    const text = MINIMAL.replace(
      "kind: quick",
      "kind: quick\neffort:\n  review: max\n  reason: Toca la caché compartida",
    );
    const tasks =
      "\n## Tareas\n\n- [ ] T1: x\n  - effort: high — reescribe el índice\n- [ ] T2: y\n  - effort: medium\n";
    const { spec, diagnostics } = parseSpec(`${text}${tasks}`);
    expect(diagnostics).toEqual([]);
    expect(spec.frontmatter.effort).toEqual({ review: "max", reason: "Toca la caché compartida" });
    expect(spec.sections.tasks?.items.map((task) => task.effort)).toEqual([
      { level: "high", reason: "reescribe el índice" },
      { level: "medium" },
    ]);
    expect(codes(`${MINIMAL}\n## Tareas\n\n- [ ] T1: x\n  - effort: enorme\n`)).toEqual([
      "field-invalid:T1",
    ]);
    expect(codes(MINIMAL.replace("kind: quick", "kind: quick\neffort:\n  review: max"))).toEqual([
      "frontmatter-invalid",
    ]);
  });
});
