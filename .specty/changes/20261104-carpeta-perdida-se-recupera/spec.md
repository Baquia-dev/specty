---
kind: standard
epic: 20261104-sesiones-con-su-carpeta
slice: C2
---

# La carpeta perdida de un cambio abierto se ve y se recupera desde la terminal

## Objetivo

Hoy, si alguien borra la carpeta de un cambio abierto o git la «poda», el cambio desaparece de `specty status` aunque su rama siga ahí, y no hay forma de recuperarla. Con este cambio, `status` lista ese cambio como «sin carpeta», con el comando que la recupera, y `specty restore <id>`, que pueden ejecutar el agente o la persona, recrea la carpeta desde la rama en `.worktrees/<id>`, con los hooks del agente copiados y preparada. Es la parte central del corte C2 de la épica `20261104-sesiones-con-su-carpeta` (AC6 en `status`, AC7 y AC8).

## Fuera de alcance

- `specty next` con los cambios sin carpeta, `EnterWorktree` y `specty enter` ante una carpeta perdida, y la conversación enlazada a una carpeta perdida (AC6 en `next`, AC9 y AC10 de la épica): van en el cambio de la épica que sigue a este.
- La UI: es el corte C3.
- Un cambio cuyo `state.json` nunca llegó a su rama (un borrador sin proponer ni aprobar): no se puede leer de la rama, así que no se detecta.
- Recuperar lo que no estaba confirmado en la rama, una rama borrada o la carpeta principal, y los cambios sin rama propia (`git.branchPerChange: false`), como dice la épica.
- Recrear la carpeta en la carpeta hermana de antes de ADR 0018: se recrea siempre en `.worktrees/<id>`.

## Supuestos

- A1: Un cambio sin carpeta es uno cuya rama marcó `specty new` (`branch.<rama>.specty = <id>` en la configuración de git) y que ningún worktree con carpeta existente tiene sacada: git lista ese worktree con la carpeta borrada, o ya no lo lista. Está abierto si en la punta de su rama existe `.specty/changes/<id>/state.json` y su fase no es `done` ni `cancelled`; un cambio cerrado o cancelado ya no tiene esa carpeta en su rama, porque se archivó.
  - impacto: alto
- A2: Para no leer de más en cada `status`, un solo `git cat-file --batch-check` dice qué ramas sin carpeta tienen aún su `state.json`; solo de esas (casi nunca alguna) se leen el estado y el título de la spec. Medido en Specty el 2026-11-04: 34 ramas marcadas.
- A3: `specty restore` no decide nada sobre permisos, como crear la carpeta en `specty new`: lo ejecutan el agente o la persona, sin terminal de persona, y toma el bloqueo del cambio (`lockChange`), así que dos a la vez no recuperan la misma carpeta.
- A4: La recuperación quita con `git worktree remove` solo los registros de git de esa rama cuya carpeta ya no existe, saca la rama existente sin crear otra ni moverla (`git worktree add <carpeta> <rama>`), copia los hooks del agente y el `go.work` como `addWorktree` y la prepara como `prepareWorktree`.
- A5: Si en `.worktrees/<id>` hay una carpeta que git no reconoce como la worktree de esa rama, Specty prueba `git worktree repair <carpeta>`. Si con eso git la reconoce, la carpeta queda recuperada tal como estaba; si no, `restore` no la toca, falla y dice cuál es.
- A6: `restore` de un cambio que tiene su carpeta, o de un id sin cambio abierto con rama, falla sin tocar nada y dice por qué.
- A7: En `status`, el cambio sin carpeta sale con su fase y a quién espera, leídos de su rama, y la marca «sin carpeta» en lugar de quién lo lleva; `status --json` lo trae con `lost: true` y sin `folder`. `openChanges`, que usan la UI, `next` y la memoria, no cambia en este cambio.

## Criterios de aceptación

- AC1: CUANDO la carpeta de un cambio abierto ya no existe y su rama sigue, la liste git o no ENTONCES `specty status` lo lista con la marca «sin carpeta» y el comando `specty restore <id>`, y `status --json` lo trae con `lost: true`.
- AC2: CUANDO el agente o la persona ejecutan `specty restore <id>` de un cambio sin carpeta ENTONCES Specty recrea la carpeta desde su rama en `.worktrees/<id>`, con los hooks del agente copiados y preparada; la salida dice que lo no confirmado en la rama no vuelve y cómo entrar, y `status` vuelve a mostrar el cambio en su carpeta.
- AC3: CUANDO en `.worktrees/<id>` hay una carpeta que git no reconoce como la worktree del cambio y `git worktree repair` no la recupera ENTONCES `specty restore` no la toca, falla y dice qué carpeta debe apartar la persona.
- AC4: CUANDO `specty restore <id>` nombra un cambio que tiene su carpeta, o un id sin cambio abierto con rama ENTONCES falla sin tocar nada y dice por qué: la carpeta del cambio, o que no hay un cambio sin carpeta con ese id.

## Diseño

- Core: `cards/restore.ts` con la salida de `restore` (recuperada, o el motivo por el que no) en español y en inglés, que reutiliza `carryOnText` y las líneas del `go.work` de `cards/new.ts`. `StatusEntry.lost` y su texto en la línea de `status`. La API pública de core (`cards/index.ts`) añade lo que usa el CLI.
- CLI: `flow/lost.ts` detecta los cambios sin carpeta (A1, A2) y los recupera (A4, A5). `flow/branches.ts` da la rama y el id de cada rama marcada. `addWorktree` (`flow/worktree.ts`) saca también una rama que ya existe. `commands/restore.ts` toma el bloqueo y da la salida; se registra en `commands/agent-commands.ts`. `commands/status.ts` añade los cambios sin carpeta.
- Docs: ARCHITECTURE §6 (el comando y `lost` en `status --json`) y §9 (las carpetas perdidas y su recuperación).

## Archivos

- crear packages/core/src/cards/restore.ts — la salida de `specty restore`, en español y en inglés
- modificar packages/core/src/cards/new.ts — exportar las líneas del `go.work` copiado para `restore`
- modificar packages/core/src/cards/status.ts — `lost` en `StatusEntry` y su texto en la línea
- modificar packages/core/src/cards/index.ts — exportar la salida de `restore`
- crear packages/core/test/cards/restore.test.ts — los textos de `restore` y de la marca «sin carpeta»
- crear packages/cli/src/flow/lost.ts — detectar los cambios sin carpeta y recuperar su carpeta
- modificar packages/cli/src/flow/branches.ts — la rama y el id de cada rama marcada
- modificar packages/cli/src/flow/worktree.ts — `addWorktree` saca una rama que ya existe
- modificar packages/cli/src/commands/status.ts — los cambios sin carpeta en `status`
- crear packages/cli/src/commands/restore.ts — `specty restore <id>`
- modificar packages/cli/src/commands/agent-commands.ts — registrar `restore`
- crear packages/cli/test/lost-status.test.ts — `status` con un cambio sin carpeta
- crear packages/cli/test/restore.test.ts — `specty restore` de punta a punta
- modificar docs/ARCHITECTURE.md — el comando, `lost` en `status --json` y las carpetas perdidas

## Tareas

- [x] T1: La salida de `restore` y la marca «sin carpeta» en `status`
  - files: packages/core/src/cards/restore.ts, packages/core/src/cards/new.ts, packages/core/src/cards/status.ts, packages/core/src/cards/index.ts, packages/core/test/cards/restore.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/restore.test.ts test/cards/status-away.test.ts test/cards/status-holder.test.ts test/cards/new.test.ts && pnpm typecheck && pnpm lint
- [ ] T2: `status` detecta los cambios sin carpeta desde sus ramas
  - files: packages/cli/src/flow/lost.ts, packages/cli/src/flow/branches.ts, packages/cli/src/commands/status.ts, packages/cli/test/lost-status.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/lost-status.test.ts test/status-away.test.ts test/activity.test.ts test/prune.test.ts && pnpm typecheck && pnpm lint
- [ ] T3: `specty restore <id>` y la documentación
  - files: packages/cli/src/flow/lost.ts, packages/cli/src/flow/worktree.ts, packages/cli/src/commands/restore.ts, packages/cli/src/commands/agent-commands.ts, packages/cli/test/restore.test.ts, docs/ARCHITECTURE.md
  - ac: AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/restore.test.ts test/lost-status.test.ts test/commands-named.test.ts test/worktrees.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: Leer las ramas en cada `status` lo hace más lento con muchas ramas. Mitigación: un solo proceso de git para todas (A2), y solo sobre las ramas marcadas sin carpeta.
- R2: Dos sesiones recuperan la misma carpeta a la vez. Mitigación: `restore` toma el bloqueo del cambio (A3).
- R3: `git worktree repair` toca registros de git. Mitigación: solo se ejecuta sobre la carpeta del cambio, y si git no la reconoce después, Specty no toca la carpeta.
