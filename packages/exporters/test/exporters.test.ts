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
      condition: "llueve",
      result: "se moja",
    });
    expect(scenarioOf("WHEN it rains THEN it gets wet")).toEqual({
      condition: "it rains",
      result: "it gets wet",
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

describe("exportSpec to Spec Kit", () => {
  const dir = "specs/20261024-saludo-personalizado";
  const out = exported("speckit");

  it("writes the spec, the plan and the tasks of a feature (AC2)", () => {
    expect([...out.keys()]).toEqual([`${dir}/spec.md`, `${dir}/plan.md`, `${dir}/tasks.md`]);
    const feature = out.get(`${dir}/spec.md`);
    for (const part of [
      "# Feature Specification: Saludo personalizado",
      "**Feature Branch**: `specty/20261024-saludo-personalizado`",
      "**Created**: 2026-10-24",
      '**Input**: User description: "que salude por nombre"',
      "### User Story 1 - Saludo personalizado (Priority: P1)\n\nLa app saluda por nombre.",
      "1. **When** se pasa «Ana», **Then** imprime «Hola, Ana».",
      "2. **When** no se pasa nombre, **Then** imprime «Hola, mundo».",
      "- **FR-001**: CUANDO se pasa «Ana» ENTONCES imprime «Hola, Ana». (AC1)",
      "## Assumptions\n\n- A1: El nombre llega como argumento. (high impact)",
      "## Out of Scope\n\n- Traducciones.",
    ]) {
      expect(feature).toContain(part);
    }
    const plan = out.get(`${dir}/plan.md`);
    expect(plan).toContain("# Implementation Plan: Saludo personalizado");
    expect(plan).toContain("## Project Structure\n\n- Modify `src/app.ts`: saludo");
    expect(plan).toContain("## Risks\n\n- R1: Un nombre vacío");
    expect(out.get(`${dir}/tasks.md`)).toBe(
      [
        "# Tasks: Saludo personalizado",
        "",
        "- [x] T001 [US1] Saludar por nombre in `src/app.ts`, `src/app.test.ts`",
        "- [ ] T002 [US1] Mensaje por defecto in `src/app.ts`",
        "",
      ].join("\n"),
    );
  });
});

describe("exportSpec to Kiro", () => {
  const dir = ".kiro/specs/saludo-personalizado";
  const out = exported("kiro");

  it("writes requirements in EARS, the design and tasks that cite them (AC3)", () => {
    expect([...out.keys()]).toEqual([
      `${dir}/requirements.md`,
      `${dir}/design.md`,
      `${dir}/tasks.md`,
    ]);
    expect(out.get(`${dir}/requirements.md`)).toBe(
      [
        "# Requirements Document",
        "",
        "## Introduction",
        "",
        "La app saluda por nombre.",
        "",
        "## Requirements",
        "",
        "### Requirement 1",
        "",
        "**User Story:** que salude por nombre",
        "",
        "#### Acceptance Criteria",
        "",
        "1. WHEN se pasa «Ana» THE SYSTEM SHALL imprime «Hola, Ana».",
        "2. WHEN no se pasa nombre THE SYSTEM SHALL imprime «Hola, mundo».",
        "",
      ].join("\n"),
    );
    const design = out.get(`${dir}/design.md`);
    expect(design).toContain("# Design Document\n\n## Overview\n\nLa app saluda por nombre.");
    expect(design).toContain("## Components and Interfaces\n\n- Modify `src/app.ts`: saludo");
    expect(out.get(`${dir}/tasks.md`)).toBe(
      [
        "# Implementation Plan",
        "",
        "- [x] 1. Saludar por nombre",
        "  - Files: `src/app.ts`, `src/app.test.ts`",
        "  - _Requirements: 1.1_",
        "- [ ] 2. Mensaje por defecto",
        "  - Files: `src/app.ts`",
        "  - _Requirements: 1.2_",
        "",
      ].join("\n"),
    );
  });

  it("keeps a task without criteria without them, and the title as the user story (AC3)", () => {
    const bare = parseSpec(
      "---\nkind: quick\n---\n\n# Ajuste\n\n## Objetivo\n\nAjustar.\n\n## Archivos\n\n- modificar a.ts — ajuste\n\n## Tareas\n\n- [ ] T1: Ajustar\n  - files: a.ts\n  - verify: true\n",
    ).spec;
    const files = new Map(
      exportSpec(bare, "kiro", { id: "ajuste" }).map((file) => [file.path, file.content]),
    );
    expect(files.get(".kiro/specs/ajuste/requirements.md")).toContain("**User Story:** Ajuste");
    expect(files.get(".kiro/specs/ajuste/tasks.md")).toBe(
      "# Implementation Plan\n\n- [ ] 1. Ajustar\n  - Files: `a.ts`\n",
    );
    const speckit = exportSpec(bare, "speckit", { id: "ajuste" });
    const feature = speckit.find((file) => file.path.endsWith("spec.md"))?.content;
    expect(feature).not.toContain("**Input**");
    expect(feature).not.toContain("## Requirements");
  });
});
