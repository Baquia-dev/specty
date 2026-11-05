---
kind: standard
---

# Al cerrar un corte, la sesión vuelve a su épica

## Objetivo

En una épica en orden, la sesión hace ella misma los cortes (por ejemplo, Claude Code con `subagents: false`): `new` de un corte liga su conversación a la carpeta del corte, y al cerrarlo el SIGUIENTE de `close` solo pide salir de esa carpeta y seguir en la principal. No nombra la épica, y `specty next` en la carpeta principal ya no la recuerda, porque la conversación quedó ligada al corte (P106). Con este cambio, si la conversación que cierra un corte está ligada a la carpeta de ese corte y su épica sigue abierta, `close` la vuelve a ligar a la carpeta de la épica, y su SIGUIENTE pide salir de la carpeta del corte sin borrarla (`ExitWorktree` con `action: "keep"`) y volver a la épica, nombrándola: en Claude Code con `EnterWorktree` y `name`, y en las demás herramientas con `specty enter`.

## Fuera de alcance

- Los subagentes que cierran su corte: sus comandos traen el id de la sesión principal, que está ligada a la épica y no al corte, y su SIGUIENTE sigue como hoy.
- El SIGUIENTE de `close` de un cambio que no es un corte, o de un corte cuya épica ya no está abierta.
- Llevar a la sesión de vuelta a la épica sin que lo haga el agente: Specty no mueve la carpeta de trabajo de la herramienta.

## Supuestos

- A1: Al cerrar, la conversación que hace los cortes en orden está ligada a la carpeta del corte, porque `new` de un corte desde la conversación de la épica la liga a él (`bindNew`), y entrar con `EnterWorktree` o con `specty enter` también. Los comandos de un subagente de Claude Code traen el `CLAUDE_CODE_SESSION_ID` de la sesión principal, que no está ligada al corte, así que la condición los deja fuera sin mirar la herramienta.
  - impacto: alto
- A2: Tras `ExitWorktree` con `action: "keep"`, Claude Code entra en la carpeta de la épica con `EnterWorktree` y `name: "<épica>"` cuando están instalados los hooks de worktree de Specty, que llevan ese nombre a la carpeta preparada del cambio. Sin ellos, el SIGUIENTE pide cambiar allí la carpeta de trabajo o abrir allí un agente, como la tarjeta «TU CAMBIO».
- A3: Volver a ligar la conversación a la épica al cerrar el corte no choca con el guard: la ligadura apunta a un cambio abierto suyo, y el guard la deja entrar en él.
- A4: `ExitWorktree` con `action: "keep"` funciona también con la carpeta del corte ya borrada (ARCHITECTURE §6) y no intenta borrar nada.

## Criterios de aceptación

- AC1: CUANDO un agente cierra un corte desde dentro de su carpeta, la conversación que cierra está ligada a esa carpeta, la herramienta es Claude Code con los hooks de worktree de Specty y la épica sigue abierta en su propia worktree ENTONCES el SIGUIENTE de `close` pide salir de la carpeta del corte con `ExitWorktree` y `action: "keep"` y volver a la épica, con su id y su carpeta, con `EnterWorktree` y `name: "<épica>"`, y después ejecutar `specty next`.
- AC2: CUANDO un agente cierra así un corte ENTONCES la conversación queda ligada a la carpeta de la épica, y `specty next` en la carpeta principal le pide volver a la épica en lugar de darle la tarjeta sin cambio.
- AC3: CUANDO la épica de ese corte vive en la carpeta principal ENTONCES el SIGUIENTE pide salir de la carpeta del corte con `ExitWorktree` y `action: "keep"` y seguir con la épica en la carpeta principal con `specty next`.
- AC4: CUANDO la herramienta entra en las carpetas con `specty enter` ENTONCES el SIGUIENTE pide volver a la épica con `specty enter <épica>`; y CUANDO es Claude Code sin los hooks de worktree de Specty ENTONCES pide cambiar a la carpeta de la épica la carpeta de trabajo de la sesión o abrir allí un agente.
- AC5: CUANDO la conversación que cierra no está ligada a la carpeta del corte (los comandos de un subagente, otra conversación o ninguna), el cambio no es un corte o su épica ya no está abierta ENTONCES el SIGUIENTE y la ligadura de la conversación son los de hoy.

## Diseño

- core `cards/land.ts`: el `left` de `leaveFolderNext` gana `epic` opcional, con el id de la épica, su carpeta, si esa carpeta es la principal (`inMain`) y si Claude Code entra por nombre (`byName`). Sin `epic`, el texto es el de hoy. Con `epic`, el texto depende de la herramienta de `ctx.tool`: las que entran con `specty enter` (`worktreeByName` indirecto) vuelven con `specty enter <épica>`; las demás salen con `ExitWorktree` y `action: "keep"` y vuelven con `EnterWorktree` y `name`, o cambiando la carpeta de trabajo si no hay hooks; con la épica en la carpeta principal, siguen allí con `specty next`.
- cli `flow/epic.ts`: `returnToEpic(session, id, folder)` devuelve la épica a la que vuelve la conversación que cierra el corte `id` en `folder`, y la vuelve a ligar a la carpeta de la épica. Lee la ligadura de `session.conversation`, que debe apuntar a `folder`; la épica del `frontmatter` de la spec del corte, archivada o no (`findChange`); y la carpeta de la épica entre los cambios abiertos (`locateChanges`). Sin alguno de los tres, devuelve `undefined` y no toca nada.
- cli `flow/land.ts`: `landChange`, cuando el agente cierra desde dentro de la carpeta, llama a `returnToEpic` antes de borrarla y pone la épica en `left`, con `byName` de `entersByName` en la carpeta principal.

## Archivos

- modificar packages/core/src/cards/land.ts — el SIGUIENTE para volver a la épica tras cerrar un corte
- modificar packages/cli/src/flow/epic.ts — la épica a la que vuelve la conversación que cierra un corte, y su nueva ligadura
- modificar packages/cli/src/flow/land.ts — la épica en lo que deja la incorporación, antes de borrar la carpeta
- modificar packages/core/test/cards/incorporation.test.ts — los textos del SIGUIENTE con épica, por herramienta y por carpeta
- crear packages/cli/test/epic-return.test.ts — `close` de un corte con Claude Code: SIGUIENTE, ligadura y los casos que no cambian
- modificar docs/ARCHITECTURE.md — §6 (paso 5 del cierre) y §10 (una sesión, una worktree)

## Tareas

- [ ] T1: El SIGUIENTE de cerrar un corte nombra la épica a la que volver
  - files: packages/core/src/cards/land.ts, packages/core/test/cards/incorporation.test.ts
  - ac: AC1, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/incorporation.test.ts && pnpm typecheck
- [ ] T2: `close` de un corte vuelve a ligar la conversación a su épica y se lo dice
  - files: packages/cli/src/flow/epic.ts, packages/cli/src/flow/land.ts, packages/cli/test/epic-return.test.ts
  - ac: AC1, AC2, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/epic-return.test.ts test/delegated-integration.test.ts test/session-return.test.ts && pnpm typecheck
- [ ] T3: ARCHITECTURE cuenta la vuelta a la épica al cerrar un corte
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/incorporation.test.ts
  - type: docs

## Riesgos

- R1: Otra sesión trabaja la verificación por unidades y toca la incorporación (`flow/integrate.ts`, `commands/integrate.ts`). Mitigación: este cambio no toca esos archivos, y `propose` avisa si comparte alguno.
- R2: La conversación queda ligada a la épica aunque el agente no vuelva a ella. Mitigación: es la ligadura que ya tenía antes de empezar el corte, y queda libre cuando la épica se cierra.
