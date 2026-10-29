---
kind: quick
---

# Con contract, un refactor no tiene que listar tests que no cambia

## Objetivo

Con `policy.tests: required` o `contract`, cada tarea de código de un cambio estándar tiene que listar algún test en sus archivos (`task-no-tests`). Para un `refactor` o un `perf` eso obliga a declarar como «modificar» tests que no cambian, porque su contrato son los tests que ya existen. Con `contract` ese contrato ya está protegido: `task done` no completa un refactor o un perf que quita aserciones de un test que ya existía. Desde este cambio, con `contract`, un `refactor` o un `perf` no tiene que listar tests. Con `required` o `recommended` sigue igual, porque nada más protege sus tests.

## Archivos

- modificar packages/core/src/validate/quality.ts — con `contract`, `refactor` y `perf` no necesitan tests en sus archivos
- modificar packages/core/test/validate/quality.test.ts — un refactor sin tests: válido con `contract`, error con `required`
- modificar docs/formats.md — §1: la regla de tests de cada tarea con cada política

## Tareas

- [ ] T1: Con contract, un refactor no tiene que listar tests que no cambia
  - files: packages/core/src/validate/quality.ts, packages/core/test/validate/quality.test.ts, docs/formats.md
  - verify: pnpm typecheck && pnpm lint && pnpm --filter @baquia-dev/specty-core exec vitest run test/validate test/cards
  - type: feat
