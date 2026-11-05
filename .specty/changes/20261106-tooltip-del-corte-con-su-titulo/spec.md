---
kind: quick
---

# El tooltip del id de un corte da su título

## Objetivo

En la revisión de una épica (`specty ui`), el tooltip del id de un corte (C1 en «Depende de») dice el título del corte, «Corte C1: Asistencia por curso», y no solo «Corte C1»: `itemsOfReview` incluye los cortes de la revisión con su título, como ya incluye las tareas (P187).

## Archivos

- modificar packages/ui/src/components/item-refs.ts — `itemsOfReview` añade cada corte de `review.slices` con su título
- modificar packages/ui/src/components/item-tooltip.test.ts — el mapa de una revisión con cortes da el título de cada corte, y el tooltip lo muestra

## Tareas

- [x] T1: El tooltip del id de un corte da su título
  - files: packages/ui/src/components/item-refs.ts, packages/ui/src/components/item-tooltip.test.ts
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/components/item-tooltip.test.ts && pnpm typecheck
  - type: fix
