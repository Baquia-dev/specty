---
kind: quick
---

# Las carpetas spec dentro del código no son tests

## Objetivo

`spec` y `specs` están entre las carpetas de tests por RSpec, así que cualquier archivo bajo una de ellas cuenta como test, también código como los 22 archivos de `packages/core/src/spec/` (el parser, el modelo, el hash…). Por eso entran solos en el alcance como tests implícitos, `max-lines` y `function-lines` los miden como tests y `criteria-tested` los contaría como tests de un criterio. `spec` y `specs` pasan a ser carpetas de tests solo fuera de una carpeta de código (`src`, `lib`, `app` o `main`), donde RSpec las pone (`spec/models/user_spec.rb`, `packages/x/spec/a_spec.rb`), también como raíz que refleja el código; las demás carpetas de tests (`test`, `tests`, `__tests__`…) no cambian, y `src/test/java` sigue siendo de tests.

## Archivos

- modificar packages/core/src/scope/tests.ts — `spec` y `specs` solo cuentan como carpeta de tests, y como raíz del reflejo, fuera de una carpeta de código
- modificar packages/core/test/scope/scope.test.ts — el código bajo `src/spec/` no es test; `spec/` en la raíz o en un paquete, y `src/test/`, sí
- modificar docs/formats.md — §6: qué carpetas cuentan como tests

## Tareas

- [ ] T1: Las carpetas spec dentro del código no son tests
  - files: packages/core/src/scope/tests.ts, packages/core/test/scope/scope.test.ts, docs/formats.md
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/scope && pnpm --filter @baquia-dev/specty-core typecheck
