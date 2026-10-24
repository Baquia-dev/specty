---
kind: quick
---

# Dividir task.ts por responsabilidad

## Objetivo

`packages/cli/src/commands/task.ts` tiene 307 líneas de código y pasa el aviso de 300 porque mezcla dos responsabilidades. Una es el comando: las comprobaciones antes de verificar y la tarjeta que devuelve. La otra son los pasos que dejan rastro: ejecutar la verificación de la tarea y anotar `task.verified`, y luego marcarla hecha, marcar su casilla en la spec, anotar `task.completed` y hacer el commit. Esos pasos pasan a `flow/task-done.ts`, junto a `assertions`, `risk`, `lines` y `live-run`, sin cambiar el comportamiento.

## Archivos

- modificar packages/cli/src/commands/task.ts — se queda con las comprobaciones y la tarjeta
- crear packages/cli/src/flow/task-done.ts — `verifyTask` y `completeTask`, con `ticked` y `withoutStatus`

## Tareas

- [x] T1: Los pasos de task done que dejan rastro pasan a flow/task-done.ts
  - files: packages/cli/src/commands/task.ts, packages/cli/src/flow/task-done.ts
  - verify: pnpm check
  - type: refactor
