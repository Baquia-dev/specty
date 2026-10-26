---
kind: standard
follows:
  - 20261025-specty-audit-el-informe-de-un-cambio
---

# El paquete de exportadores: OpenSpec, Spec Kit y Kiro

## Objetivo

PRODUCT.md promete para la versión 1 exportar a OpenSpec, GitHub Spec Kit y Kiro, y ARCHITECTURE §2 prevé el paquete `packages/exporters` (`@baquia-dev/specty-exporters`), con funciones puras sobre el modelo de core, pero no existe. Ahora existe: `exportSpec` convierte una spec de Specty en los archivos de cada formato, con su estructura y en el idioma de la spec, según el mapeo de formats.md §10.

## Fuera de alcance

- El comando `specty export`: es el cambio siguiente.
- Importar desde esos formatos.
- Validar lo exportado con las herramientas de cada formato.

## Supuestos

- A1: La estructura de cada formato sale de su documentación pública vigente. OpenSpec: `openspec/changes/<id>/` con `proposal.md`, `design.md`, `tasks.md` y `specs/<capacidad>/spec.md` (`## ADDED Requirements`, `### Requirement:`, `#### Scenario:` con **WHEN** y **THEN**). Spec Kit: `specs/<id>/` con `spec.md`, `plan.md` y `tasks.md`. Kiro: `.kiro/specs/<nombre>/` con `requirements.md`, `design.md` y `tasks.md`.
- A2: Los encabezados y las palabras clave de cada formato (WHEN, THEN, SHALL, MUST) van en inglés, como los espera cada herramienta; el texto de la spec va tal cual, en su idioma.
- A3: Un criterio `CUANDO … ENTONCES …` (o `WHEN … THEN …`) se parte en su condición y su resultado; uno que no sigue esa forma va entero como resultado.

## Criterios de aceptación

- AC1: CUANDO se exporta una spec a OpenSpec ENTONCES salen `proposal.md` (Why, What Changes, Impact), `design.md` (supuestos, diseño y riesgos), `tasks.md` (una casilla por tarea, marcada si está hecha) y `specs/<capacidad>/spec.md`, con un requisito por criterio y su escenario WHEN/THEN.
- AC2: CUANDO se exporta a Spec Kit ENTONCES salen `spec.md` (historia de usuario con sus escenarios, requisitos funcionales FR-001…, supuestos y fuera de alcance), `plan.md` (resumen, diseño, archivos y riesgos) y `tasks.md` (T001… con sus rutas).
- AC3: CUANDO se exporta a Kiro ENTONCES salen `requirements.md` (introducción y criterios EARS numerados), `design.md` y `tasks.md`, donde cada tarea cita los criterios que cubre (`_Requirements: 1.1_`).
- AC4: CUANDO alguien lee ARCHITECTURE §2 y formats.md §10 ENTONCES encuentra el paquete y el mapeo tal como está implementado.

## Diseño

- `packages/exporters`: paquete privado del monorepo, como core, con sus tests y un 90 % de cobertura. `src/index.ts` da `exportSpec(spec, format, context)`, que devuelve rutas relativas y contenidos, sin escribir nada; `context` lleva el id, la rama, la fecha y la petición literal.
- `src/scenario.ts` parte un criterio; `src/openspec.ts`, `src/speckit.ts` y `src/kiro.ts`, uno por formato.

## Archivos

- crear packages/exporters/package.json — el paquete
- crear packages/exporters/tsconfig.json — sin tipos de Node, como core
- crear packages/exporters/tsconfig.test.json — los tests
- crear packages/exporters/vitest.config.ts — tests y cobertura
- crear packages/exporters/src/index.ts — `exportSpec`
- crear packages/exporters/src/scenario.ts — condición y resultado de un criterio
- crear packages/exporters/src/openspec.ts — OpenSpec
- crear packages/exporters/src/speckit.ts — Spec Kit
- crear packages/exporters/src/kiro.ts — Kiro
- crear packages/exporters/test/exporters.test.ts — los tres formatos
- modificar pnpm-lock.yaml — el paquete nuevo en el monorepo
- modificar docs/ARCHITECTURE.md — §2
- modificar docs/formats.md — §10

## Tareas

- [ ] T1: El paquete y OpenSpec
  - files: packages/exporters/package.json, packages/exporters/tsconfig.json, packages/exporters/tsconfig.test.json, packages/exporters/vitest.config.ts, packages/exporters/src/index.ts, packages/exporters/src/scenario.ts, packages/exporters/src/openspec.ts, packages/exporters/test/exporters.test.ts, pnpm-lock.yaml
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-exporters test
- [ ] T2: Spec Kit y Kiro
  - files: packages/exporters/src/index.ts, packages/exporters/src/speckit.ts, packages/exporters/src/kiro.ts, packages/exporters/test/exporters.test.ts, docs/ARCHITECTURE.md, docs/formats.md
  - ac: AC2, AC3, AC4
  - verify: pnpm check
