---
kind: quick
follows:
  - 20261022-aprobar-una-revision-sin-tareas-pendientes-pasa
---

# Esfuerzo tras la spec y diagrama de fases

## Objetivo

Dos textos dejan de contradecir lo que hace Specty. Una vez escrita la spec, `propose` y `approve` recomiendan el esfuerzo como «implementación X · revisiones de la spec y del alcance: Y», igual que la sugerencia de la UI, en lugar de un esfuerzo de «planificación» para una spec que ya está escrita. Y el diagrama de fases de ARCHITECTURE §4 muestra que aprobar una revisión sin tareas pendientes lleva directamente a acceptance.

## Archivos

- modificar packages/core/src/cards/text.ts — la línea de esfuerzo una vez escrita la spec
- modificar packages/core/test/cards.test.ts — su redacción, en español y en inglés

## Tareas

- [x] T1: Esfuerzo tras la spec y diagrama de fases
  - files: packages/core/src/cards/text.ts, packages/core/test/cards.test.ts
  - verify: pnpm check
  - type: fix
  - notes: Actualizar también la salida de `propose` en docs/formats.md §9 y el diagrama de docs/ARCHITECTURE.md §4 (aprobar sin tareas pendientes → acceptance).

## Cierre

### Resumen

La línea de esfuerzo dice implementación y revisiones de la spec y del alcance; formats.md §9 y el diagrama de ARCHITECTURE §4 al día
