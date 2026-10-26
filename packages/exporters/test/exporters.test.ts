// SPDX-License-Identifier: Apache-2.0
import { parseSpec } from "@baquia-dev/specty-core";
import { describe, expect, it } from "vitest";
import { type ExportContext, type ExportFormat, exportSpec, scenarioOf } from "../src";

const SPEC = `---
kind: standard
---

# Saludo personalizado

## Objetivo

La app saluda por nombre.

## Fuera de alcance

- Traducciones.

## Supuestos

- A1: El nombre llega como argumento.
  - impacto: alto
- A2: Sin nombre se usa «mundo».

## Criterios de aceptación

- AC1: CUANDO se pasa «Ana» ENTONCES imprime «Hola, Ana».
- AC2: CUANDO no se pasa nombre ENTONCES imprime «Hola, mundo».

## Diseño

Una función \`greet(name?)\`.

## Archivos

- modificar src/app.ts — saludo
- crear src/app.test.ts — prueba

## Tareas

- [x] T1: Saludar por nombre
  - files: src/app.ts, src/app.test.ts
  - ac: AC1
- [ ] T2: Mensaje por defecto
  - files: src/app.ts
  - ac: AC2

## Riesgos

- R1: Un nombre vacío — se trata como sin nombre.
`;

const spec = parseSpec(SPEC).spec;
const CONTEXT: ExportContext = {
  id: "20261024-saludo-personalizado",
  branch: "specty/20261024-saludo-personalizado",
  created: "2026-10-24",
  request: "que salude por nombre",
};
const exported = (format: ExportFormat) =>
  new Map(exportSpec(spec, format, CONTEXT).map((file) => [file.path, file.content]));

describe("a criterion's scenario", () => {
  it("is its condition and its result, or nothing when it has no such form (AC1)", () => {
    expect(scenarioOf("CUANDO llueve ENTONCES se moja")).toEqual({
      when: "llueve",
      then: "se moja",
    });
    expect(scenarioOf("WHEN it rains THEN it gets wet")).toEqual({
      when: "it rains",
      then: "it gets wet",
    });
    expect(scenarioOf("Siempre funciona")).toBeUndefined();
  });
});

describe("exportSpec to OpenSpec", () => {
  const dir = "openspec/changes/20261024-saludo-personalizado";
  const out = exported("openspec");

  it("writes a change folder: proposal, design, tasks and a spec delta (AC1)", () => {
    expect([...out.keys()]).toEqual([
      `${dir}/proposal.md`,
      `${dir}/design.md`,
      `${dir}/tasks.md`,
      `${dir}/specs/saludo-personalizado/spec.md`,
    ]);
    expect(out.get(`${dir}/proposal.md`)).toBe(
      [
        "# Saludo personalizado",
        "",
        "## Why",
        "",
        "La app saluda por nombre.",
        "",
        "## What Changes",
        "",
        "- Modify `src/app.ts`: saludo",
        "- Add `src/app.test.ts`: prueba",
        "",
        "## Impact",
        "",
        "- Affected code: `src/app.ts`, `src/app.test.ts`",
        "",
        "## Out of Scope",
        "",
        "- Traducciones.",
        "",
      ].join("\n"),
    );
    expect(out.get(`${dir}/tasks.md`)).toBe(
      [
        "## 1. Implementation",
        "",
        "- [x] 1.1 Saludar por nombre",
        "- [ ] 1.2 Mensaje por defecto",
        "",
      ].join("\n"),
    );
  });

  it("gives each criterion a requirement with its WHEN/THEN scenario (AC1)", () => {
    expect(out.get(`${dir}/specs/saludo-personalizado/spec.md`)).toContain(
      [
        "## ADDED Requirements",
        "",
        "### Requirement: AC1",
        "",
        "The system SHALL meet this criterion: CUANDO se pasa «Ana» ENTONCES imprime «Hola, Ana».",
        "",
        "#### Scenario: AC1",
        "",
        "- **WHEN** se pasa «Ana»",
        "- **THEN** imprime «Hola, Ana».",
      ].join("\n"),
    );
    const design = out.get(`${dir}/design.md`);
    expect(design).toContain(
      "## Assumptions\n\n- A1: El nombre llega como argumento. (high impact)\n- A2: Sin nombre se usa «mundo».",
    );
    expect(design).toContain("## Design\n\nUna función `greet(name?)`.");
    expect(design).toContain("## Risks\n\n- R1: Un nombre vacío — se trata como sin nombre.");
  });

  it("leaves out what the spec does not have, and keeps a criterion of another form whole (AC1)", () => {
    const bare = parseSpec(`---
kind: standard
---

# Mover el módulo

## Objetivo

El módulo vive en su sitio.

## Criterios de aceptación

- AC1: El módulo vive en su sitio nuevo.

## Archivos

- renombrar src/viejo.ts -> src/nuevo.ts
- borrar src/basura.ts — sobra

## Tareas

- [ ] T1: Mover
  - files: src/nuevo.ts
  - ac: AC1
`).spec;
    const out = new Map(
      exportSpec(bare, "openspec", { id: "mover" }).map((file) => [file.path, file.content]),
    );
    expect([...out.keys()]).toEqual([
      "openspec/changes/mover/proposal.md",
      "openspec/changes/mover/tasks.md",
      "openspec/changes/mover/specs/mover/spec.md",
    ]);
    expect(out.get("openspec/changes/mover/proposal.md")).toContain(
      "- Rename `src/viejo.ts` → `src/nuevo.ts`\n- Remove `src/basura.ts`: sobra",
    );
    expect(out.get("openspec/changes/mover/proposal.md")).not.toContain("## Out of Scope");
    expect(out.get("openspec/changes/mover/specs/mover/spec.md")).toContain(
      "#### Scenario: AC1\n\n- **THEN** El módulo vive en su sitio nuevo.",
    );
    const empty = parseSpec("---\nkind: quick\n---\n\n# Nada\n\n## Objetivo\n\nNada.\n").spec;
    expect(exportSpec(empty, "openspec", { id: "nada" }).map((file) => file.path)).toEqual([
      "openspec/changes/nada/proposal.md",
      "openspec/changes/nada/tasks.md",
    ]);
  });
});
