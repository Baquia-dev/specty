---
kind: standard
---

# Iconos de Lucide como datos: aceptación y revisión

## Objetivo

Última de las tres partes de «Iconos de Lucide como datos». `acceptance/` y `review/` toman sus iconos de `components/icons.ts`, así que la UI ya no carga ninguna clase de icono de `@lucide/angular` ni su plantilla compilada por icono. Biome impide que vuelvan a importarse.

## Fuera de alcance

- Cambiar cómo se ve algún icono.

## Supuestos

- A1: Basta con que Biome permita de `@lucide/angular` solo `LucideDynamicIcon` y sus tipos (`allowImportNames` de `noRestrictedImports`). El error dice de dónde tomar los iconos.

## Criterios de aceptación

- AC1: CUANDO se construye la UI tras esta parte ENTONCES ningún archivo importa clases de iconos de `@lucide/angular`, todo se ve igual y el bundle inicial ya no lleva sus plantillas.
- AC2: CUANDO alguien importa de `@lucide/angular` algo distinto de `LucideDynamicIcon` o sus tipos ENTONCES `pnpm lint` falla y dice que los iconos vienen de `components/icons.ts`.
- AC3: CUANDO alguien lee el documento de la UI ENTONCES no encuentra la migración como pendiente.

## Diseño

- Cada archivo de `acceptance/` y `review/` divide su importación de `@lucide/angular` como en las partes anteriores.
- `biome.json` añade, para `packages/ui/src/**`, `style/noRestrictedImports` con nivel error y `allowImportNames` para `LucideDynamicIcon`, `LucideIconData` y `LucideIconInput`.

## Archivos

- modificar packages/ui/src/acceptance/acceptance-actions.ts — iconos desde `icons.ts`
- modificar packages/ui/src/acceptance/acceptance-tab.ts — iconos desde `icons.ts`
- modificar packages/ui/src/acceptance/changes-view.ts — iconos desde `icons.ts`
- modificar packages/ui/src/acceptance/closing-view.ts — iconos desde `icons.ts`
- modificar packages/ui/src/acceptance/criterion-row.ts — iconos desde `icons.ts`
- modificar packages/ui/src/acceptance/full-verification.ts — iconos desde `icons.ts`
- modificar packages/ui/src/acceptance/trace-matrix.ts — iconos desde `icons.ts`
- modificar packages/ui/src/review/comments.ts — iconos desde `icons.ts`
- modificar packages/ui/src/review/assumption-row.ts — iconos desde `icons.ts`
- modificar packages/ui/src/review/delta-review.ts — iconos desde `icons.ts`
- modificar packages/ui/src/review/review-actions.ts — iconos desde `icons.ts`
- modificar packages/ui/src/review/spec-review.ts — iconos desde `icons.ts`
- modificar packages/ui/src/review/spec-sections.ts — iconos desde `icons.ts`
- modificar biome.json — solo `LucideDynamicIcon` y sus tipos de `@lucide/angular`
- modificar docs/ui.md — la migración terminada

## Tareas

- [x] T1: La aceptación toma sus iconos de icons.ts
  - files: packages/ui/src/acceptance/acceptance-actions.ts, packages/ui/src/acceptance/acceptance-tab.ts, packages/ui/src/acceptance/changes-view.ts, packages/ui/src/acceptance/closing-view.ts, packages/ui/src/acceptance/criterion-row.ts, packages/ui/src/acceptance/full-verification.ts, packages/ui/src/acceptance/trace-matrix.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/acceptance && pnpm sources
  - type: refactor
- [ ] T2: La revisión toma sus iconos de icons.ts, y Biome lo exige
  - files: packages/ui/src/review/comments.ts, packages/ui/src/review/assumption-row.ts, packages/ui/src/review/delta-review.ts, packages/ui/src/review/review-actions.ts, packages/ui/src/review/spec-review.ts, packages/ui/src/review/spec-sections.ts, biome.json
  - ac: AC1, AC2
  - verify: pnpm lint && pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/review && pnpm sources
  - type: refactor
- [ ] T3: Documentar la migración terminada
  - files: docs/ui.md
  - ac: AC3
  - verify: pnpm check
  - type: docs
