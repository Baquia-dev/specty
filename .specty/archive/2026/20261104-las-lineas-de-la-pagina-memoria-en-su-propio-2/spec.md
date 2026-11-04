---
kind: quick
---

# Las líneas de la página Memoria, en su propio archivo

## Objetivo

`packages/ui/src/memory/memory-page.ts` pasa de 300 líneas de código. Las líneas bajo cada fila (la de una entrada, lo que espera y la de un cambio, con quién lo lleva y hace cuánto) pasan a `memory/memory-lines.ts` como funciones puras que reciben el traductor, junto a `memory-view.ts`. La página dice lo mismo que antes.

## Archivos

- modificar packages/ui/src/memory/memory-page.ts — usa las líneas del archivo nuevo
- crear packages/ui/src/memory/memory-lines.ts — `entryLine`, `waitsFor`, `changeLine`, `heldBy` y `ago`, puras
- crear packages/ui/src/memory/memory-lines.test.ts — las líneas en español y en inglés

## Tareas

- [x] T1: Las líneas bajo cada fila, en `memory-lines.ts`
  - files: packages/ui/src/memory/memory-page.ts, packages/ui/src/memory/memory-lines.ts, packages/ui/src/memory/memory-lines.test.ts
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/memory/memory-lines.test.ts --include src/memory/memory-page.test.ts --include src/memory/memory-waiting.test.ts --include src/memory/memory-actions.test.ts && pnpm typecheck && pnpm lint && pnpm exec knip
  - type: refactor

## Cierre

### Resumen

entryLine, waitsFor, changeLine, heldBy y ago pasan a memory/memory-lines.ts como funciones puras con el traductor; la página las llama y baja a 284 líneas
