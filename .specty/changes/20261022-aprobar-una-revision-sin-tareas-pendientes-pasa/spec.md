---
kind: standard
follows:
  - 20261022-verificacion-completa-en-la-pestana-aceptacion
---

# Aprobar una revisión sin tareas pendientes pasa a aceptación

## Objetivo

Hoy, aprobar una revisión siempre deja el cambio en implementación, y solo `specty task done` lo lleva a aceptación al terminar la última tarea. Si se aprueba una revisión cuyas tareas ya están todas hechas (por ejemplo, al retirar un ajuste), el cambio queda atascado: `specty next` pide aceptar, `specty accept` lo rechaza porque la fase es implementación y ninguna tarea puede avanzarla. Con este cambio, aprobar sin tareas pendientes lleva directo a aceptación.

## Fuera de alcance

- Reparar un cambio que ya quedó atascado, o que `specty doctor` lo detecte: queda para otro cambio.
- La UI: su fuente de ejemplo no usa la máquina de estados.
- El diagrama de `docs/ARCHITECTURE.md` §4: añadir que aprobar sin tareas pendientes va a aceptación sería un tercer módulo; queda para un cambio de documentación.

## Supuestos

- A1: Al aprobar, la máquina recibe cuántas tareas quedan sin hacer. Si queda alguna, el cambio pasa a implementación, como hasta ahora; si no queda ninguna, pasa a aceptación, igual que tras la última tarea.
  - impacto: alto
- A2: Una épica sigue pasando a implementación al aprobarse, porque avanza por sus cambios hijos y no tiene tareas propias; una retro sigue terminando al aprobarse.
- A3: `specty approve` cuenta las tareas pendientes como `specty task done`: las de la spec que se aprueba cuyo estado en `state.json` no es `done`.

## Criterios de aceptación

- AC1: CUANDO una persona aprueba una revisión cuyas tareas están todas hechas ENTONCES el cambio pasa a aceptación y `specty accept` puede aceptarlo.
- AC2: CUANDO una persona aprueba una revisión con tareas pendientes ENTONCES el cambio pasa a implementación, como hasta ahora.
- AC3: CUANDO una persona aprueba una épica o una retro ENTONCES pasan a implementación y a terminado, como hasta ahora.

## Diseño

- **Máquina** (`packages/core/src/flow/machine.ts`): el evento `approve` lleva `remainingTasks`, como `taskDone`. La transición va a `done` en una retro, a `implementing` en una épica o con tareas pendientes, y a `acceptance` sin ellas.
- **CLI** (`packages/cli/src/commands/approve.ts`): calcula las tareas pendientes de la spec aprobada con el estado y las pasa en el evento.

## Archivos

- modificar packages/core/src/flow/machine.ts — aprobar sin tareas pendientes va a aceptación
- modificar packages/core/test/flow/machine.test.ts — tests de la transición
- modificar packages/cli/src/commands/approve.ts — contar las tareas pendientes
- modificar packages/cli/test/flow.test.ts — el ajuste retirado vuelve a aceptación

## Tareas

- [x] T1: La transición al aprobar sin tareas pendientes
  - files: packages/core/src/flow/machine.ts, packages/core/test/flow/machine.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/flow/machine.test.ts
- [x] T2: specty approve cuenta las tareas pendientes
  - files: packages/cli/src/commands/approve.ts, packages/cli/test/flow.test.ts
  - ac: AC1, AC2
  - verify: pnpm check
