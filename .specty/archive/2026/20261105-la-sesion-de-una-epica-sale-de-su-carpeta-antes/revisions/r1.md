---
kind: standard
---

# La sesión de una épica sale de su carpeta antes de repartir los cortes

## Objetivo

Con Claude Code, la sesión principal entra en la carpeta de la épica con `EnterWorktree`, y desde allí Claude Code encierra a sus subagentes en esa carpeta: no pueden escribir en las carpetas de sus cortes, así que el reparto no funciona (P101, medido en C10). Con este cambio, la tarjeta de la épica pide salir de su carpeta sin borrarla (`ExitWorktree` con `action: "keep"`) antes de lanzar los encargos, y `specty next` en la carpeta principal le sigue trayendo a esa conversación la tarjeta de su épica, en lugar de pedirle volver a entrar. Además, en el flujo en orden, `new` de un corte pide salir de la carpeta en la que está la sesión antes de entrar en la del corte (P102).

## Fuera de alcance

- Repetir las mediciones `epic` y `epic-subagent` y actualizar ARCHITECTURE §16: necesitan los experimentos de C10, que entran en esta rama solo al aceptar. Se miden y se documentan en un cambio aparte, sobre main, en cuanto este se cierre.
- Una sesión de Claude Code que la persona abrió directamente en la carpeta de la épica: `ExitWorktree` no la saca, y sus subagentes siguen encerrados. La salida es abrirla en la carpeta principal.
- Los subagentes de Codex, OpenCode y Cursor, que entran con `specty enter` y no necesitan salir de ninguna carpeta.
- Que el SIGUIENTE de `close` de un corte pida volver a su épica (la otra mitad de P102): hoy ya pide salir de la carpeta con `ExitWorktree`, y nombrar la épica a la que volver haría el cambio demasiado grande. Queda anotado en la memoria.

## Supuestos

- A1: Claude Code limita a sus subagentes a las carpetas de trabajo de su sesión. Si la sesión está en la worktree de la épica, no pueden escribir en las carpetas de sus cortes. Tras `ExitWorktree` con `action: "keep"`, la sesión vuelve a la carpeta principal, que contiene `.worktrees/`, y sus subagentes sí escriben allí. Así lo mide C10 y lo comprueba AC5 con Claude Code real.
  - impacto: alto
- A2: `ExitWorktree` con `action: "keep"` deja la carpeta y su rama como están, y los ajustes que instala `specty init` lo permiten sin preguntar.
- A3: Tras `ExitWorktree`, los comandos de la sesión siguen trayendo el mismo `CLAUDE_CODE_SESSION_ID`, y la conversación sigue ligada a la carpeta de la épica, porque el guard no ve `ExitWorktree`. Así `specty next` en la carpeta principal sabe cuál es su épica.
- A4: Solo Claude Code entra en la carpeta de un cambio moviendo su sesión entera (`worktreeByName` en «sí»). Las demás herramientas entran con `specty enter` y su sesión no cambia de carpeta, así que no tienen de dónde salir.

## Criterios de aceptación

- AC1: CUANDO `specty next` en la carpeta de una épica aprobada, que vive en su propia worktree, trae encargos con Claude Code ENTONCES su SIGUIENTE pide primero salir de la carpeta de la épica sin borrarla, con `ExitWorktree` y `action: "keep"`, porque desde ella los subagentes no escriben en las carpetas de sus cortes; después, lanzar los encargos y, cuando terminen, ejecutar `specty next` en la carpeta principal.
- AC2: CUANDO la épica vive en la carpeta principal, la herramienta entra en las carpetas con `specty enter` o no reparte cortes ENTONCES el SIGUIENTE de la tarjeta de la épica es el de hoy.
- AC3: CUANDO la conversación ligada a una épica aprobada que reparte sus cortes ejecuta `specty next` fuera de la carpeta de la épica y queda algún corte listo, huérfano o en curso ENTONCES recibe la tarjeta de la épica, con sus cortes, sus encargos y una línea que dice que la lleva desde fuera de su carpeta, y su SIGUIENTE pide lanzar los encargos, o esperar a los subagentes, y volver a ejecutar `specty next` allí mismo, sin pedir volver a la carpeta de la épica.
- AC4: CUANDO todos los cortes de esa épica están cerrados o ninguno puede empezar, la épica no reparte sus cortes, o el cambio ligado no es una épica aprobada ENTONCES `specty next` fuera de su carpeta pide volver a ella, como hoy.
- AC5: CUANDO la sesión principal de Claude Code entra en la épica con `EnterWorktree`, sale con `ExitWorktree` y `action: "keep"` y lanza un subagente, con los permisos de las evals (`acceptEdits`) ENTONCES el subagente entra en la carpeta de su corte con `specty enter` y escribe allí con Write sin error, y `specty next` en la carpeta principal le trae a la sesión la tarjeta de la épica.
- AC6: CUANDO la sesión de Claude Code crea un cambio con `specty new` desde la carpeta de otro cambio, como la worktree de su épica ENTONCES el SIGUIENTE pide salir antes de esa carpeta sin borrarla, con `ExitWorktree` y `action: "keep"`, y después entrar en la del cambio nuevo con `EnterWorktree` y `name`; desde la carpeta principal, o con `--subagent`, el SIGUIENTE es el de hoy.

## Diseño

- `ChangeView` gana `inWorktree`, solo para una épica: vive en una worktree propia, no en la carpeta principal. La CLI lo calcula en `changeView` comparando su carpeta con la primera de `git worktree list`.
- `cards/epic.ts`:
  - con encargos, si `inWorktree` y la herramienta mueve su sesión (`worktreeByName` en «sí»), el SIGUIENTE pide antes `ExitWorktree` con `action: "keep"` (AC1);
  - `awayEpicCard(epic, folder, ctx)`: la tarjeta de la épica para su conversación fuera de su carpeta, con el bloque «TU ÉPICA», sus cortes y sus encargos, y un SIGUIENTE que no la manda de vuelta. Devuelve `undefined` si la épica no reparte o no queda ningún corte listo ni en curso.
- `cards/rejoin.ts`: `OwnChangeView` gana `epic`, la vista de la épica ligada. `rejoinCard` da `awayEpicCard` cuando la hay, y la tarjeta «TU CAMBIO» de hoy si no (AC3, AC4).
- `commands/next.ts`: si el cambio ligado es una épica en `implementing`, abre la sesión de su carpeta y le pasa su vista.
- `cards/new.ts`: `WorktreeCreated` gana `fromWorktree`, que la CLI pone cuando `new` corre en una carpeta que no es la principal. `carryOnText` antepone la salida (`ExitWorktree` con `action: "keep"`) en el caso de Claude Code y de una herramienta sin reconocer, nunca para un subagente ni para las que entran con `specty enter` (AC6).
- El modelo guionizado (`fake-model.ts`) gana estas opciones:
  - los permisos de las evals (`acceptEdits` con `--allowedTools`), en lugar de saltarlos;
  - las herramientas `EnterWorktree` y `ExitWorktree`;
  - un `specty` que ejecuta el bundle de la rama, primero en el PATH, como en las evals.
- Documentos: ARCHITECTURE §5 (la fila de `epic`), §7 (la tarjeta de una épica y la de fuera de su carpeta), §6 (`new` desde la carpeta de otro cambio) y §10 (subagentes y una sesión, una worktree).

## Archivos

- modificar packages/core/src/cards/view.ts — `inWorktree` en la vista de una épica
- modificar packages/core/src/cards/epic.ts — salir de la carpeta de la épica antes de repartir, y la tarjeta de la épica fuera de su carpeta
- modificar packages/core/src/cards/rejoin.ts — la conversación de una épica que reparte ve su tarjeta fuera de su carpeta
- modificar packages/core/src/cards/new.ts — salir de la carpeta de otro cambio antes de entrar en la del nuevo
- modificar packages/cli/src/flow/worktree.ts — si una carpeta es una worktree aparte de la principal
- modificar packages/cli/src/flow/views.ts — `inWorktree` en la vista de una épica
- modificar packages/cli/src/commands/next.ts — la vista de la épica ligada, fuera de su carpeta
- modificar packages/cli/src/commands/new.ts — `fromWorktree` en la tarjeta de `new`
- modificar packages/core/test/cards/epic.test.ts — la salida antes de repartir y la tarjeta fuera de la carpeta
- modificar packages/core/test/cards/rejoin.test.ts — la tarjeta de la épica en lugar de «TU CAMBIO»
- modificar packages/core/test/cards/new.test.ts — `new` desde la carpeta de otro cambio
- modificar packages/cli/test/session-return.test.ts — `next` fuera de la épica y `new` desde su carpeta
- modificar packages/cli/test/fake-model.ts — permisos de las evals, herramientas de worktrees y `specty` de la rama
- modificar packages/cli/test/subagents.test.ts — Claude Code real: la sesión sale de la épica y su subagente escribe en su corte
- modificar docs/ARCHITECTURE.md — §5, §6, §7 y §10

## Tareas

- [ ] T1: La tarjeta de la épica pide salir de su carpeta antes de repartir, y se ve desde fuera
  - files: packages/core/src/cards/view.ts, packages/core/src/cards/epic.ts, packages/core/src/cards/rejoin.ts, packages/core/test/cards/epic.test.ts, packages/core/test/cards/rejoin.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/epic.test.ts test/cards/rejoin.test.ts test/cards/budget.test.ts && pnpm typecheck
- [ ] T2: `specty next` le trae su épica a la conversación fuera de la carpeta de la épica
  - files: packages/cli/src/flow/worktree.ts, packages/cli/src/flow/views.ts, packages/cli/src/commands/next.ts, packages/cli/test/session-return.test.ts
  - ac: AC1, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/session-return.test.ts test/epic-subagents.test.ts && pnpm typecheck
- [ ] T3: `new` desde la carpeta de otro cambio pide salir de ella antes de entrar en la del nuevo
  - files: packages/core/src/cards/new.ts, packages/cli/src/commands/new.ts, packages/core/test/cards/new.test.ts, packages/cli/test/session-return.test.ts
  - ac: AC6
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/new.test.ts && pnpm --filter @baquia-dev/specty exec vitest run test/session-return.test.ts && pnpm typecheck
- [ ] T4: Con Claude Code real, la sesión sale de la épica y su subagente escribe en su corte
  - files: packages/cli/test/fake-model.ts, packages/cli/test/subagents.test.ts
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/subagents.test.ts test/agent-e2e.test.ts
  - type: test
- [ ] T5: ARCHITECTURE cuenta la salida de la carpeta de la épica antes de repartir y antes de entrar en un corte
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/epic.test.ts
  - type: docs

## Riesgos

- R1: Si Claude Code también encierra a los subagentes de una sesión que salió con `ExitWorktree`, el arreglo no basta. Mitigación: AC5 lo comprueba con Claude Code real antes de tocar el código, y la medición del cambio siguiente lo confirma con el modelo de verdad.
- R2: La sesión principal, ya fuera, podría volver a entrar en la épica por costumbre y lanzar desde allí. Mitigación: la tarjeta de dentro vuelve a pedir la salida mientras queden encargos.
- R3: Otros cambios abiertos tocan archivos cercanos, como las tarjetas de los subagentes de Codex, OpenCode y Cursor. Mitigación: `propose` avisa de los archivos compartidos, y al aceptar los conflictos van a `specty integrate`.
