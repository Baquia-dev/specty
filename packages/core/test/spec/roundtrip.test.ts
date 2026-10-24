// SPDX-License-Identifier: Apache-2.0
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canonicalize, parseSpec, serializeSpec } from "../../src";
import { FIXTURES, fixture } from "../helpers";
import { specArbitrary } from "./arbitraries";

describe("round trip", () => {
  it.each(FIXTURES)("%s is already canonical and parses without diagnostics", (name) => {
    const text = fixture(name);
    const parsed = parseSpec(text);
    expect(parsed.diagnostics).toEqual([]);
    expect(serializeSpec(parsed.spec)).toBe(text);
  });

  it("rewrites tolerated variations into the canonical form", () => {
    const result = canonicalize(fixture("messy.es.md"));
    expect(result.diagnostics).toEqual([]);
    expect(result.text).toBe(fixture("messy.es.canonical.md"));
  });

  it("keeps a comment quoted as inline code in the canonical form (AC2)", () => {
    const quoted = "La pista `<!-- pista -->` se queda; esta <!-- no --> se va.";
    const result = canonicalize(`---\nkind: quick\n---\n\n# Título\n\n## Objetivo\n\n${quoted}\n`);
    expect(result.diagnostics).toEqual([]);
    expect(result.text).toContain("La pista `<!-- pista -->` se queda; esta  se va.");
  });

  it("is idempotent: canonicalizing canonical text changes nothing", () => {
    const once = canonicalize(fixture("messy.es.md"));
    const twice = canonicalize(once.text);
    expect(twice.text).toBe(once.text);
    expect(twice.hash).toBe(once.hash);
  });

  it("parse(serialize(spec)) returns the same spec for random specs", () => {
    fc.assert(
      fc.property(specArbitrary, (spec) => {
        const text = serializeSpec(spec);
        const parsed = parseSpec(text);
        expect(parsed.diagnostics).toEqual([]);
        expect(parsed.spec).toEqual(spec);
        expect(serializeSpec(parsed.spec)).toBe(text);
      }),
      { numRuns: 400 },
    );
  });
});
