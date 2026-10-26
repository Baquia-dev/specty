// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { check, fixture } from "../helpers";

const STANDARD = fixture("standard.es.md");

/** The standard example with a glob over hand-written code, matched by `count` files. */
function grown(count: number) {
  const glob = "lib/features/home/**";
  const text = STANDARD.replace("\n## Tareas", `- modificar ${glob} — vista\n\n## Tareas`);
  const pages = Array.from({ length: count }, (_, index) => `lib/features/home/page_${index}.dart`);
  return { text, repo: { globMatches: { [glob]: pages } } };
}

const SPLIT = /^(?:split-required|size-near-split)/;

describe("the split in the closing", () => {
  it("is not required again once the change grew after its approval", () => {
    const { text, repo } = grown(40);
    expect(check(text, { repo })).toContain("split-required");
    expect(check(text, { phase: "closing", repo }).filter((code) => SPLIT.test(code))).toEqual([]);
  });

  it("is not advised either when the change came near the limits", () => {
    const { text, repo } = grown(11);
    expect(check(text, { repo })).toContain("size-near-split");
    expect(check(text, { phase: "closing", repo }).filter((code) => SPLIT.test(code))).toEqual([]);
  });
});
