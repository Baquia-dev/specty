---
kind: quick
---

# Tras pedir cambios, la propuesta del ajuste sigue protegiendo las tareas hechas y las pendientes

## Objetivo

Hoy `checkAdjusting` solo corre en `adjusting`. Si la persona pide cambios a un ajuste, el cambio pasa a `review`, y la propuesta siguiente puede modificar o borrar una tarea hecha sin `done-task-changed`. También puede añadir tareas o cambiar criterios en un ajuste pedido mientras se implementa, sin `pending-tasks-only`. Además, `approve` valida en `review`. Con este cambio, las dos reglas corren también en `review` cuando el cambio tiene una revisión aprobada, como la de los cortes cerrados de P185 (`ADJUSTMENT_PHASES`). En `review`, solo la revisión de un ajuste tiene una revisión aprobada, así que la revisión inicial sigue igual. `pending-tasks-only` sigue aplicándose solo a un ajuste pedido mientras se implementa. La CLI ya pasa `approved` y `doneTasks` en cualquier fase.

## Archivos

- modificar packages/core/src/validate/phase.ts — `checkAdjusting` corre en las fases de un ajuste (`ADJUSTMENT_PHASES`)
- modificar packages/core/test/validate/phase.test.ts — las dos reglas en `review` con una revisión aprobada, y no en la revisión inicial
- modificar docs/formats.md — §2: las reglas del ajuste también en su revisión
- modificar docs/ARCHITECTURE.md — §12: lo mismo

## Tareas

- [ ] T1: Las reglas de las tareas hechas y de las tareas pendientes corren también en la revisión de un ajuste
  - files: packages/core/src/validate/phase.ts, packages/core/test/validate/phase.test.ts, docs/formats.md, docs/ARCHITECTURE.md
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/validate/phase.test.ts test/validate/closed-slices.test.ts && pnpm typecheck && pnpm lint
