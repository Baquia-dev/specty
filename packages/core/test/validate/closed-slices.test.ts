// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, parseSpec, type ValidationContext, validateSpec } from "../../src";
import { check, fixture, specOf } from "../helpers";

const FIRST = "20261106-inicio-de-sesion";
const SECOND = "20261106-panel";

const EPIC = `---
kind: epic
---

# Panel del estudiante

## Objetivo

El estudiante ve su progreso de un vistazo.

## Fuera de alcance

- Exportar el progreso.

## Supuestos

- A1: El progreso ya se guarda por curso.

## Criterios de aceptación

- AC1: CUANDO el estudiante inicia sesión ENTONCES llega a su panel.
- AC2: CUANDO el estudiante abre su panel ENTONCES ve su progreso por curso.
- AC3: CUANDO el estudiante abre un curso de su panel ENTONCES ve sus notas.

## Cortes

- C1: Inicio de sesión
  - ac: AC1
- C2: Panel
  - ac: AC2
  - depends: C1
- C3: Notas por curso
  - ac: AC3
  - depends: C1
`;

const approved = specOf(EPIC);

/** The epic adjusted while it is implemented, with the given slices closed by a change. */
function adjusting(closed: Readonly<Record<string, string>>): Partial<ValidationContext> {
  return {
    phase: "adjusting",
    approved,
    previous: approved,
    closedSlices: new Map(Object.entries(closed)),
  };
}

const CLOSED = "closed-slice-changed";

function closedErrors(text: string, ctx: Partial<ValidationContext>): string[] {
  return check(text, ctx).filter((label) => label.startsWith(`${CLOSED}:`));
}

function diagnosticsOf(text: string, ctx: Partial<ValidationContext>) {
  const parsed = parseSpec(text);
  return validateSpec(parsed.spec, {
    phase: "adjusting",
    config: DEFAULT_CONFIG,
    locations: parsed.locations,
    ...ctx,
  }).filter((entry) => entry.code === CLOSED);
}

describe("an epic's adjustment and its closed slices", () => {
  it("AC1: rejects a closed slice whose title, `ac` or `depends` changes, naming the slice and its change", () => {
    const ctx = adjusting({ C1: FIRST, C2: SECOND });
    const title = EPIC.replace("- C1: Inicio de sesión", "- C1: Inicio de sesión con Google");
    expect(closedErrors(title, ctx)).toEqual([`${CLOSED}:C1`]);
    const ac = EPIC.replace(
      "- C1: Inicio de sesión\n  - ac: AC1",
      "- C1: Inicio de sesión\n  - ac: AC1, AC2",
    );
    expect(closedErrors(ac, ctx)).toEqual([`${CLOSED}:C1`]);
    const depends = EPIC.replace("  - ac: AC2\n  - depends: C1\n", "  - ac: AC2\n");
    expect(closedErrors(depends, ctx)).toEqual([`${CLOSED}:C2`]);

    const [found] = diagnosticsOf(title, ctx);
    expect(found?.severity).toBe("error");
    expect(found?.target).toBe("C1");
    expect(found?.line).toBe(parseSpec(title).locations.items.C1);
    expect(found?.message).toContain(`El corte C1 ya se cerró con el cambio ${FIRST}`);
    expect(found?.message).toContain("lleva lo que falte a un corte nuevo");
  });

  it("AC1: says it in English for an English epic", () => {
    const english = fixture("epic.en.md");
    const ctx = {
      phase: "adjusting" as const,
      approved: specOf(english),
      previous: specOf(english),
      closedSlices: new Map([["C1", FIRST]]),
    };
    const text = english.replace("- C1: API contracts and typed models", "- C1: API contracts");
    const [found] = diagnosticsOf(text, ctx);
    expect(found?.target).toBe("C1");
    expect(found?.message).toContain(`Slice C1 was already closed by change ${FIRST}`);
    expect(found?.message).toContain("take what is missing to a new slice");
  });

  it("AC2: rejects removing a closed slice, also when the last proposal had removed it", () => {
    const removed = EPIC.replace(
      "- C3: Notas por curso\n  - ac: AC3\n  - depends: C1\n",
      "",
    ).replace("- AC3: CUANDO el estudiante abre un curso de su panel ENTONCES ve sus notas.\n", "");
    const ctx = adjusting({ C3: SECOND });
    expect(closedErrors(removed, ctx)).toEqual([`${CLOSED}:C3`]);
    const [found] = diagnosticsOf(removed, ctx);
    expect(found?.target).toBe("C3");
    expect(found?.severity).toBe("error");
    expect(found?.line).toBeUndefined();
    expect(found?.message).toContain(`El corte C3 ya se cerró con el cambio ${SECOND}`);

    const afterRemoval = { ...ctx, phase: "review" as const, previous: specOf(removed) };
    expect(closedErrors(removed, afterRemoval)).toEqual([`${CLOSED}:C3`]);
  });

  it("AC3: accepts new slices, and changing or removing the slices that are not closed", () => {
    const text = EPIC.replace("- C2: Panel", "- C2: Panel con el progreso")
      .replace("- C3: Notas por curso\n  - ac: AC3\n  - depends: C1\n", "")
      .concat("- C4: Notas y asistencia por curso\n  - ac: AC3\n  - depends: C1\n");
    expect(closedErrors(text, adjusting({ C1: FIRST }))).toEqual([]);
    expect(closedErrors(EPIC, adjusting({ C1: FIRST, C2: SECOND }))).toEqual([]);
  });

  it("AC3: only checks an adjustment, against an approved revision", () => {
    const text = EPIC.replace("- C1: Inicio de sesión", "- C1: Inicio de sesión con Google");
    const closedSlices = new Map([["C1", FIRST]]);
    expect(closedErrors(text, { phase: "review", closedSlices })).toEqual([]);
    expect(closedErrors(text, { phase: "draft", approved, closedSlices })).toEqual([]);
    expect(closedErrors(text, { phase: "review", approved, previous: approved })).toEqual([]);
  });

  it("AC4: keeps a slice narrowed while its change was open, and rejects changing it again", () => {
    const narrowed = EPIC.replace("- C2: Panel", "- C2: Panel sin notas");
    const ctx = {
      phase: "review" as const,
      approved,
      previous: specOf(narrowed),
      closedSlices: new Map([["C2", SECOND]]),
    };
    expect(closedErrors(narrowed, ctx)).toEqual([]);
    expect(closedErrors(EPIC, ctx)).toEqual([]);
    const again = EPIC.replace("- C2: Panel", "- C2: Panel con gráficas");
    expect(closedErrors(again, ctx)).toEqual([`${CLOSED}:C2`]);
  });
});
