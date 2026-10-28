---
kind: quick
---

# Con contract, un refactor no quita aserciones de un test que ya existía

## Objetivo

Un `refactor` o un `perf` no cambia lo que hace el código, así que tampoco debería cambiar lo que comprueban sus tests. Hoy, si una de esas tareas quita aserciones de un test que ya existía, `task done` lo completa igual y solo avisa. Con `policy.tests: contract`, donde los tests son el contrato, `task done` deja de completarla: dice qué aserciones quitó y de qué test, y pide devolverlas o explicárselo al usuario. Sin `contract`, sigue siendo un aviso. Es el AC12 del corte C4 de la épica «Tests como contrato».

## Archivos

- modificar packages/cli/src/commands/task.ts — con `contract`, un refactor o un perf que quita aserciones no se completa
- modificar packages/core/src/cards/task.ts — el rechazo con las aserciones quitadas
- modificar packages/cli/test/assertions.test.ts — rechazo con `contract`, aviso sin él
- modificar docs/formats.md — §6: `task done` y las aserciones quitadas con `contract`
- modificar docs/ARCHITECTURE.md — §4: los refactors con `contract`

## Tareas

- [ ] T1: Con contract, task done no completa un refactor que quita aserciones
  - files: packages/cli/src/commands/task.ts, packages/core/src/cards/task.ts, packages/cli/test/assertions.test.ts, docs/formats.md, docs/ARCHITECTURE.md
  - verify: pnpm typecheck && pnpm --filter @baquia-dev/specty exec vitest run test/assertions.test.ts && pnpm --filter @baquia-dev/specty-core exec vitest run test/cards
  - type: feat
