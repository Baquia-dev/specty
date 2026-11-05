// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, parseSpec, validateSpec } from "../../src";
import { diagnostic } from "../../src/spec/diagnostics";
import { check, fixture } from "../helpers";

const STANDARD = fixture("standard.es.md");
const EPIC = "20261105-bandeja-por-paginas";

/** The standard example as slice C4 of `EPIC`, with a glob over hand-written code, matched by `count` files. */
function slice(count: number) {
  const glob = "lib/features/home/**";
  const text = STANDARD.replace(
    "kind: standard\n",
    `kind: standard\nepic: ${EPIC}\nslice: C4\n`,
  ).replace("\n## Tareas", `- modificar ${glob} — vista\n\n## Tareas`);
  const pages = Array.from({ length: count }, (_, index) => `lib/features/home/page_${index}.dart`);
  return { text, repo: { globMatches: { [glob]: pages } } };
}

describe("a slice over the split thresholds", () => {
  it("AC6: is narrowed and its epic adjusted, instead of being split into an epic", () => {
    const { text, repo } = slice(40);
    const codes = check(text, { repo });
    expect(codes).toContain("slice-split-required");
    expect(codes).not.toContain("split-required");

    const parsed = parseSpec(text);
    const found = validateSpec(parsed.spec, {
      phase: "draft",
      config: DEFAULT_CONFIG,
      locations: parsed.locations,
      repo,
    }).find((entry) => entry.code === "slice-split-required");
    expect(found?.severity).toBe("error");
    expect(found?.message).toContain(
      `y un corte no puede ser una épica: estréchalo a lo que cabe en un cambio y lleva el resto a cortes nuevos de la épica ${EPIC}, que se ajusta en su carpeta mientras se implementa`,
    );
    expect(found?.message).not.toContain("divídelo en una épica");

    const en = diagnostic("en", {
      code: "slice-split-required",
      params: { detail: "size XL", epic: EPIC },
    }).message;
    expect(en).toBe(
      `The slice is too large (size XL) and a slice cannot be an epic: narrow it to what fits in one change and take the rest to new slices of epic ${EPIC}, which is adjusted in its folder while it is implemented (\`adjust\`, the new slices in "Slices" with their \`depends\`, and \`propose\`); the person approves it again.`,
    );
  });

  it("AC6: still only warns when the slice is close to a threshold", () => {
    const { text, repo } = slice(11);
    const codes = check(text, { repo });
    expect(codes).toContain("size-near-split");
    expect(codes).not.toContain("slice-split-required");
  });
});
