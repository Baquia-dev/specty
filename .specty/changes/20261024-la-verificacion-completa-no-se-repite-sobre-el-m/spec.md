---
kind: standard
---

# La verificación completa no se repite sobre el mismo código

## Objetivo

En cada cambio, la verificación completa (`pnpm check` en este repositorio, varios minutos) corre en la última tarea y otra vez en `accept`, sobre el mismo commit; hoy se vio en los registros de cada cambio. Ahora cada verificación anota el código sobre el que corrió, y `accept` no repite la completa si la última con ese comando pasó sobre el mismo código: lo dice y sigue. Si el código cambió, o la última falló, se ejecuta como siempre.

## Fuera de alcance

- La verificación que sigue a incorporar la rama principal: el merge cambia el código, así que siempre corre.
- Reutilizar la verificación de una tarea en `task done`.

## Supuestos

- A1: El código es el árbol de trabajo sin la carpeta `.specty/`, que cambia con cada anotación; se identifica por un hash de sus entradas de primer nivel, tomado justo antes de verificar, sin tocar el índice.
- A2: Vale la verificación de una tarea cuyo comando es el completo, solo o tras `verify.quick`, y la que la persona lanza desde la UI; las dependencias instaladas y el entorno no entran en la cuenta.
- A3: Solo cuenta la última verificación con ese comando: si falló, se repite aunque una anterior pasara con el mismo código.

## Criterios de aceptación

- AC1: CUANDO una verificación corre en `task done`, en `accept` o desde la UI ENTONCES su entrada de la auditoría (`task.verified` o `change.verified`) guarda el código sobre el que corrió (`tree`).
- AC2: CUANDO la persona o el agente en modo delegado acepta y la última verificación con el comando completo pasó sobre el mismo código ENTONCES `accept` no la ejecuta otra vez, no pregunta, y dice dónde pasó.
- AC3: CUANDO el código cambió desde entonces, o la última verificación con ese comando falló ENTONCES `accept` la ejecuta como hasta ahora.
- AC4: CUANDO alguien lee ARCHITECTURE y formats.md ENTONCES encuentra la regla y el campo `tree`.

## Archivos

- modificar packages/cli/src/flow/verified.ts — el código verificado y la verificación que se puede reutilizar
- modificar packages/cli/src/flow/task-done.ts — `tree` en `task.verified`
- modificar packages/cli/src/commands/accept.ts — no repetir la verificación completa
- modificar packages/cli/src/server/runs.ts — `tree` en la verificación lanzada desde la UI
- crear packages/cli/test/reuse.test.ts — la reutilización y sus límites
- modificar docs/ARCHITECTURE.md — `accept` y la verificación desde la UI
- modificar docs/formats.md — §4: `tree`

## Tareas

- [x] T1: Cada verificación anota el código sobre el que corrió
  - files: packages/cli/src/flow/verified.ts, packages/cli/src/flow/task-done.ts, packages/cli/src/server/runs.ts, packages/cli/test/reuse.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/reuse.test.ts test/server.test.ts
- [ ] T2: accept no repite la verificación completa sobre el mismo código
  - files: packages/cli/src/flow/verified.ts, packages/cli/src/commands/accept.ts, packages/cli/test/reuse.test.ts, docs/ARCHITECTURE.md, docs/formats.md
  - ac: AC2, AC3, AC4
  - verify: pnpm check
