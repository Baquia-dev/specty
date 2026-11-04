---
kind: standard
follows:
  - 20261104-carpeta-perdida-se-recupera
---

# next, enter y EnterWorktree llevan a recuperar una carpeta perdida

## Objetivo

Desde el cambio anterior, `specty status` lista los cambios abiertos sin carpeta y `specty restore <id>` recupera su carpeta. Pero `specty next` no los nombra; una conversación enlazada a una carpeta perdida oye «No hay un cambio activo»; `EnterWorktree` con el id del cambio devuelve una carpeta que no existe, o crea otra worktree vacía en `.claude/worktrees/`, y `specty enter` dice que el cambio no tiene carpeta. Con este cambio, las cuatro salidas llevan a `specty restore <id>`. Es el resto del corte C2 de la épica `20261104-sesiones-con-su-carpeta`: AC6 en `next`, AC9 y AC10.

## Fuera de alcance

- La UI: es el corte C3.
- Recuperar la carpeta dentro del hook `WorktreeCreate` o de `specty enter`: prepararla puede pasar del tiempo del hook (A9 de la épica); lo hace `specty restore`.
- Los cambios sin carpeta en la tarjeta de un cambio activo: `next` los lista solo sin cambio activo, donde ya lista los huérfanos; `status` los lista siempre.
- El modo sin worktrees (P77 de la memoria).

## Supuestos

- A1: Los cambios sin carpeta son los de `lostChanges` (`flow/lost.ts`), los mismos que lista `status`.
- A2: El enlace de una conversación apunta a la carpeta perdida de un cambio si esa carpeta ya no existe y, o bien git la sigue listando para la rama del cambio, o bien se llama como el id del cambio (`.worktrees/<id>` y la carpeta hermana de antes de ADR 0018 lo hacen).
  - impacto: alto
- A3: `namedWorktree` deja de tomar por preparada una carpeta que git lista pero que no existe. Así `specty enter` no enlaza la conversación a ella, y el hook `WorktreeCreate` no la devuelve como si existiera.
- A4: El hook `WorktreeCreate` mira si el nombre es el id de un cambio sin carpeta antes de crear nada, y solo si Specty abre su sesión en la carpeta del evento; sin ella, sigue como hoy.
- A5: La tarjeta de una conversación enlazada a una carpeta perdida gana a la lista de cambios sin carpeta, como la de volver gana a la de huérfanos: la conversación tiene un cambio y lo primero es recuperarlo.

## Criterios de aceptación

- AC1: CUANDO se ejecuta `specty next` sin cambio activo y sin enlace a un cambio abierto, y hay cambios abiertos sin carpeta ENTONCES la salida los lista, cada uno con su fase y su título, y dice que su carpeta se recupera con `specty restore <id>` en lugar de crear otro cambio; `SIGUIENTE:` sigue con `specty new`.
- AC2: CUANDO Claude Code pide `EnterWorktree` con el id de un cambio abierto sin carpeta, la liste git o no ENTONCES el hook `WorktreeCreate` falla sin crear ninguna worktree, y su mensaje dice que la carpeta se perdió y que se recupera con `specty restore <id>`.
- AC3: CUANDO el agente ejecuta `specty enter <id>` de un cambio abierto sin carpeta ENTONCES la salida dice que la carpeta se perdió y le pide `specty restore <id>` y volver a entrar, sin enlazar la conversación a la carpeta perdida.
- AC4: CUANDO una conversación enlazada a la carpeta perdida de un cambio abierto ejecuta `specty next` fuera de ella, o el guard responde a su `SessionStart` ENTONCES la salida nombra el cambio y dice que su carpeta se perdió, y `SIGUIENTE:` le pide `specty restore <id>` y seguir su salida para volver, no `specty new`.

## Diseño

- Core: en `cards/rejoin.ts`, el bloque de los cambios sin carpeta y la variante de la tarjeta de volver para una carpeta perdida (`OwnChangeView.lost`); `NextView.lost` en `cards/next.ts`; la salida de `enter` para una carpeta perdida en `cards/enter.ts`, y el motivo `lost` de `worktreeHookRefusal` en `cards/hooks.ts`. La API pública (`cards/index.ts`) añade lo que usa el CLI.
- CLI: `commands/next.ts` pasa los cambios sin carpeta; `conversationChange` (`enforce/sessions.ts`) devuelve el cambio de una carpeta perdida con `lost`; `commands/enter.ts` responde a un id sin carpeta; `enforce/worktree-hooks.ts` filtra las carpetas que no existen en `namedWorktree` y rechaza en `create` el id de un cambio sin carpeta.
- Docs: ARCHITECTURE §6 (`enter`), §7 (`next` y la conversación con la carpeta perdida) y §10 (el hook `WorktreeCreate`).

## Archivos

- modificar packages/core/src/cards/rejoin.ts — el bloque de los cambios sin carpeta y la tarjeta de volver con la carpeta perdida
- modificar packages/core/src/cards/next.ts — `lost` en `NextView` y su bloque en la tarjeta sin cambio activo
- modificar packages/core/src/cards/enter.ts — la salida de `enter` para una carpeta perdida
- modificar packages/core/src/cards/hooks.ts — el motivo `lost` del hook `WorktreeCreate`
- modificar packages/core/src/cards/index.ts — exportar la salida nueva de `enter`
- crear packages/core/test/cards/lost-folder.test.ts — los textos, en español y en inglés
- modificar packages/cli/src/commands/next.ts — los cambios sin carpeta y el enlace a una carpeta perdida
- modificar packages/cli/src/enforce/sessions.ts — `conversationChange` con la carpeta perdida
- modificar packages/cli/src/commands/enter.ts — un id sin carpeta lleva a `restore`
- modificar packages/cli/src/enforce/worktree-hooks.ts — `namedWorktree` sin carpetas que no existen y `create` ante un cambio sin carpeta
- crear packages/cli/test/lost-folder.test.ts — `next`, `enter`, el hook y el `SessionStart` de punta a punta
- modificar docs/ARCHITECTURE.md — `next`, `enter` y el hook ante una carpeta perdida

## Tareas

- [x] T1: Los textos de los cambios sin carpeta en `next`, `enter` y el hook
  - files: packages/core/src/cards/rejoin.ts, packages/core/src/cards/next.ts, packages/core/src/cards/enter.ts, packages/core/src/cards/hooks.ts, packages/core/src/cards/index.ts, packages/core/test/cards/lost-folder.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/lost-folder.test.ts test/cards/rejoin.test.ts && pnpm typecheck && pnpm lint
- [x] T2: `next`, `enter` y el hook llevan a `specty restore`, y la documentación
  - files: packages/cli/src/commands/next.ts, packages/cli/src/enforce/sessions.ts, packages/cli/src/commands/enter.ts, packages/cli/src/enforce/worktree-hooks.ts, packages/cli/test/lost-folder.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/lost-folder.test.ts test/session-return.test.ts test/enter.test.ts test/worktree-hooks.test.ts test/worktrees.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: `next` sin cambio activo lee las ramas en cada `SessionStart`. Mitigación: es la misma lectura que `status` (un proceso de git para todas las ramas marcadas sin carpeta).
- R2: Filtrar en `namedWorktree` las carpetas que no existen cambia lo que reciben `enter` y el hook. Mitigación: una carpeta que no existe no sirve a ninguno; el hook rechaza antes el id de un cambio sin carpeta.
