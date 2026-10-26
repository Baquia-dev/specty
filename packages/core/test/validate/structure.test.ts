// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, parseSpec, validateSpec } from "../../src";
import { check, fixture, withConfig } from "../helpers";

const STANDARD = fixture("standard.es.md");
const QUICK = fixture("quick.en.md");
const SPIKE = fixture("spike.es.md");

describe("valid examples", () => {
  it("accepts the standard example, warning only about T1 without tests", () => {
    expect(check(STANDARD)).toEqual(["task-no-tests:T1"]);
  });

  it("accepts the quick, retro and epic examples", () => {
    expect(check(QUICK)).toEqual([]);
    expect(check(fixture("retro.es.md"))).toEqual([]);
    expect(check(fixture("epic.en.md"))).toEqual([]);
  });

  it("accepts the spike example while closing", () => {
    expect(check(SPIKE, { phase: "closing" })).toEqual([]);
  });
});

describe("sections", () => {
  it("requires the sections of the kind", () => {
    const text = STANDARD.replace(
      "## Fuera de alcance\n\n- Cambios en la API del backend.\n- La vista del docente.\n\n",
      "",
    );
    expect(check(text)).toContain("section-required:section:outOfScope");
  });

  it("rejects sections the kind does not use", () => {
    const text = QUICK.replace(
      "## Files",
      "## Assumptions\n\n- A1: The label is static.\n\n## Files",
    );
    expect(check(text)).toEqual(["section-not-allowed:section:assumptions"]);
  });

  it("rejects empty sections", () => {
    const text = STANDARD.replace(
      '- A1: Las series por materia ya llegan en el provider actual; no hace falta cambiar la API.\n  - impacto: alto\n- A2: "Por periodo" agrupa por trimestres académicos.\n',
      "",
    );
    expect(check(text)).toContain("section-empty:section:assumptions");
  });

  it("only allows the Closing section while closing", () => {
    expect(check(SPIKE, { phase: "draft" })).toEqual(["closing-premature:section:closing"]);
  });

  it("requires findings and a decision to close a spike", () => {
    const text = SPIKE.replace("### Decisión", "### Otra cosa");
    expect(check(text, { phase: "closing" })).toEqual(["closing-incomplete:section:closing"]);
  });
});

describe("quick lane", () => {
  it("allows a single task", () => {
    const text = `${QUICK}- [ ] T2: Another task\n  - files: src/components/sign-in-button.tsx\n  - verify: pnpm test\n`;
    expect(check(text)).toEqual(["quick-limits"]);
  });

  it("lets an adjustment add tasks, but not files, once approved (AC1, AC2)", () => {
    const approved = parseSpec(QUICK).spec;
    const fix = `${QUICK}- [ ] T2: Format the label\n  - files: src/components/sign-in-button.tsx\n  - verify: pnpm test\n`;
    for (const phase of ["adjusting", "review"] as const) {
      expect(check(fix, { phase, approved }), phase).toEqual([]);
    }
    const files = fix.replace(
      "- modify src/components/sign-in-button.tsx — fix the label",
      "- modify src/components/sign-in-button.tsx — fix the label\n- modify src/a.ts — a\n- modify src/b.ts — b\n- modify src/c.ts — c",
    );
    expect(check(files, { phase: "adjusting", approved })).toContain("quick-limits");
  });

  it("limits the number of files", () => {
    const text = QUICK.replace(
      "- modify src/components/sign-in-button.tsx — fix the label",
      "- modify src/components/sign-in-button.tsx — fix the label\n- modify src/a.ts — a\n- modify src/b.ts — b\n- modify src/c.ts — c",
    );
    expect(check(text)).toEqual(["quick-limits"]);
    expect(check(text, { config: withConfig({ lanes: { quick: { maxFiles: 4 } } }) })).toEqual([]);
  });

  it("counts only code files, with the matches of a glob", () => {
    const files = [
      "- modify src/components/sign-in-button.tsx — fix the label",
      "- modify src/a.ts — a",
      "- modify src/b.ts — b",
      "- modify src/components/sign-in-button.test.tsx — the label",
      "- modify test/a.test.ts — a",
      "- modify docs/ui.md — the label",
    ];
    const text = QUICK.replace(
      "- modify src/components/sign-in-button.tsx — fix the label",
      files.join("\n"),
    );
    expect(check(text)).toEqual([]);
    const glob = text.replace("- modify src/b.ts — b", "- modify src/lib/** — b");
    // One match plus the glob itself: 4 code files.
    const repo = { globMatches: { "src/lib/**": ["src/lib/b.ts"] } };
    expect(check(glob)).toEqual([]);
    const { spec } = parseSpec(glob);
    const message = validateSpec(spec, { phase: "draft", config: DEFAULT_CONFIG, repo }).find(
      (entry) => entry.code === "quick-limits",
    )?.message;
    expect(message).toContain("4 code files, max 3");
  });

  it("rejects sensitive paths", () => {
    const text = QUICK.replaceAll(
      "src/components/sign-in-button.tsx",
      "src/auth/sign-in-button.tsx",
    );
    expect(check(text)).toEqual(["quick-limits"]);
  });
});
