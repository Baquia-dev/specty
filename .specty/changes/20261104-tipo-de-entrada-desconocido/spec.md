---
kind: quick
---

# Un tipo de entrada desconocido en memory add

## Objetivo

Resuelve P1. Hoy commander rechaza un `--kind` desconocido de `specty memory add` con su propio mensaje en inglés y sin el siguiente paso de Specty. Con este cambio, `memory add` lo valida él mismo y lo rechaza con una tarjeta propia, en español y en inglés: dice el tipo que no conoce, que no anotó nada y qué tipos hay, como hace `specty new` con su `--kind`.

## Archivos

- modificar packages/cli/src/commands/memory.ts — `memory add` valida `--kind` en vez de commander
- modificar packages/core/src/cards/memory-refusals.ts — el rechazo de un tipo de entrada desconocido
- crear packages/cli/test/memory-kind.test.ts — el rechazo de un `--kind` desconocido, en español y en inglés

## Tareas

- [x] T1: `memory add` rechaza un tipo de entrada desconocido con su propia tarjeta
  - files: packages/cli/src/commands/memory.ts, packages/core/src/cards/memory-refusals.ts, packages/cli/test/memory-kind.test.ts
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/memory-kind.test.ts test/memory.test.ts && pnpm typecheck && pnpm lint && pnpm exec knip
  - type: fix
