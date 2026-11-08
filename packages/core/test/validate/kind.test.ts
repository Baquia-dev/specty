// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, parseSpec, type ValidationContext, validateSpec } from "../../src";
import { diagnostic } from "../../src/spec/diagnostics";
import { check, fixture, specOf } from "../helpers";

const STANDARD = fixture("standard.es.md");
const EPIC = fixture("epic.en.md");
const RETRO = fixture("retro.es.md");
const KIND_CODES = ["kind-fixed", "slice-epic"];

/** `text` with `kind` in its frontmatter. */
const asKind = (text: string, kind: string) => text.replace(/^kind: \w+$/m, `kind: ${kind}`);

/** The epic example as slice C4 of another epic. */
const SLICE = EPIC.replace(
  "kind: epic\n",
  "kind: epic\nepic: 20261105-bandeja-por-paginas\nslice: C4\n",
);

/** The diagnostic `code` of `text` validated in `ctx`, with its message. */
function found(text: string, code: string, ctx: Partial<ValidationContext>) {
  const parsed = parseSpec(text);
  return validateSpec(parsed.spec, {
    phase: "draft",
    config: DEFAULT_CONFIG,
    locations: parsed.locations,
    ...ctx,
  }).find((entry) => entry.code === code);
}

/** The kind rule's codes among `codes`. */
const kindCodes = (codes: readonly string[]) => codes.filter((code) => KIND_CODES.includes(code));

describe("the kind of a change", () => {
  it("lets a draft never approved take another kind, but not a retro's", () => {
    expect(kindCodes(check(EPIC, { kind: "standard" }))).toEqual([]);
    expect(kindCodes(check(STANDARD, { kind: "quick" }))).toEqual([]);
    expect(kindCodes(check(STANDARD, { kind: "epic", phase: "review" }))).toEqual([]);
    expect(kindCodes(check(asKind(STANDARD, "spike"), { kind: "standard" }))).toEqual([]);
  });

  it("checks nothing without the state's kind, or with the same one", () => {
    expect(kindCodes(check(SLICE))).toEqual([]);
    expect(kindCodes(check(EPIC, { approved: specOf(STANDARD), phase: "adjusting" }))).toEqual([]);
    const approved = { kind: "epic", approved: specOf(EPIC), phase: "adjusting" } as const;
    expect(kindCodes(check(EPIC, approved))).toEqual([]);
  });

  it("AC5: refuses another kind once the change was approved, and asks to put back its own", () => {
    const approved = specOf(STANDARD);
    for (const phase of ["adjusting", "review", "closing"] as const) {
      expect(check(EPIC, { kind: "standard", approved, phase })).toContain("kind-fixed");
    }
    const refused = found(EPIC, "kind-fixed", { kind: "standard", approved, phase: "adjusting" });
    expect(refused?.severity).toBe("error");
    expect(refused?.message).toBe(
      "The change was approved as standard and can no longer become epic; put back `kind: standard` in the frontmatter.",
    );
    const es = diagnostic("es", {
      code: "kind-fixed",
      params: { from: "standard", to: "epic", reason: "approved" },
    }).message;
    expect(es).toBe(
      "El cambio se aprobó como standard y ya no puede pasar a epic; vuelve a poner `kind: standard` en el frontmatter.",
    );
  });

  it("AC6: refuses a retro that changes its kind, and a draft that becomes a retro", () => {
    expect(check(asKind(RETRO, "standard"), { kind: "retro" })).toContain("kind-fixed");
    expect(check(asKind(STANDARD, "retro"), { kind: "standard" })).toContain("kind-fixed");
    const refused = found(asKind(RETRO, "standard"), "kind-fixed", { kind: "retro" });
    expect(refused?.severity).toBe("error");
    expect(refused?.message).toBe(
      "Una retro no cambia de tipo y ningún otro cambio pasa a ser una retro, que solo crea `specty retro`; vuelve a poner `kind: retro` en el frontmatter.",
    );
    const en = diagnostic("en", {
      code: "kind-fixed",
      params: { from: "standard", to: "retro", reason: "retro" },
    }).message;
    expect(en).toBe(
      "A retro does not change its kind and no other change becomes a retro, which only `specty retro` creates; put back `kind: standard` in the frontmatter.",
    );
  });

  it("AC7: refuses a slice that becomes an epic", () => {
    const codes = check(SLICE, { kind: "standard" });
    expect(codes).toContain("slice-epic");
    expect(codes).not.toContain("kind-fixed");
    const refused = found(SLICE, "slice-epic", { kind: "standard" });
    expect(refused?.severity).toBe("error");
    expect(refused?.message).toBe(
      "A slice cannot be an epic; put back `kind: standard` and, if it does not fit in one change, take the rest to new slices of epic 20261105-bandeja-por-paginas.",
    );
    const es = diagnostic("es", {
      code: "slice-epic",
      params: { from: "standard", epic: "20261105-bandeja-por-paginas" },
    }).message;
    expect(es).toBe(
      "Un corte no puede ser una épica; vuelve a poner `kind: standard` y, si no cabe en un cambio, lleva el resto a cortes nuevos de la épica 20261105-bandeja-por-paginas.",
    );
  });

  it("AC8: says how to turn a change too large into an epic in its own spec", () => {
    const es = diagnostic("es", { code: "split-required", params: { detail: "tamaño XL" } });
    expect(es.message).toBe(
      "El cambio es demasiado grande (tamaño XL); divídelo en una épica con cortes verticales, o en un spike si el problema es la incertidumbre. Para pasarlo a épica en esta misma spec, pon `kind: epic` en el frontmatter, cambia «Archivos» y «Tareas» por «Cortes» y vuelve a ejecutar `propose`: el cambio conserva su petición y lo que resuelve.",
    );
    const en = diagnostic("en", { code: "split-required", params: { detail: "size XL" } });
    expect(en.message).toBe(
      'The change is too large (size XL); split it into an epic with vertical slices, or into a spike if the problem is uncertainty. To turn it into an epic in this same spec, set `kind: epic` in the frontmatter, replace "Files" and "Tasks" with "Slices" and run `propose` again: the change keeps its request and what it resolves.',
    );
  });
});
