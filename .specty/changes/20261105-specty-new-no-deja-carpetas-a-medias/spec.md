---
kind: standard
epic: 20261105-pendientes-de-las-unidades
slice: C3
---

# specty new no deja carpetas a medias

## Objetivo

Cuando otro proceso del clon tiene bloqueada la configuración de git (`.git/config.lock`), `specty new` falla al ligar la rama a su cambio (`git config branch.<rama>.specty`) y deja la worktree y su rama sin cambio dentro; al repetirlo crea el id con `-2` (P103, P128). Con este cambio, `new` reintenta esa escritura unas veces con espera y, si aun así no puede, quita la carpeta y la rama que acababa de crear, y su tarjeta dice qué falló, qué deshizo y que se puede repetir.

## Fuera de alcance

- `new` sin worktree (`git.worktrees: false` y sin `--worktree`): también reintenta, porque es la misma escritura, pero no deshace la rama a la que ya cambió la carpeta.
- Otras escrituras de la configuración de git en otros comandos, como la del enlace de una conversación o la de `init`.
- Fallos de `new` después de ligar la rama, como la preparación de la carpeta, que ya tiene su propio aviso.

## Supuestos

- A1: Reintentar cualquier fallo de esa escritura basta: el bloqueo es la causa conocida, y el mensaje de git puede llegar traducido, así que no se distingue por su texto. Se espera 50, 100, 200, 400 y 800 ms entre intentos, seis intentos en total y algo más de 1,5 s en el peor caso; otro proceso solo tiene el bloqueo mientras escribe.
  - impacto: alto
- A2: Deshacer es `git worktree remove --force <carpeta>` y `git branch -D <rama>`. El `--force` hace falta porque la carpeta lleva los hooks copiados sin versionar, y los dos funcionan con la configuración aún bloqueada (comprobado con git 2.50: `branch -D` solo avisa de que no pudo quitar la sección de la rama).
- A3: La tarjeta es la del fallo de git (`gitFailedCard`, código 1) con una línea más que nombra la carpeta y la rama que se quitaron; su SIGUIENTE ya pide corregir lo que hizo fallar a git y volver a ejecutar el comando. Al repetirlo, el cambio recibe el mismo id, sin `-2`.

## Criterios de aceptación

- AC1: CUANDO `specty new --worktree` encuentra la configuración de git bloqueada por otro proceso y este la suelta mientras `new` reintenta ENTONCES crea el cambio con su carpeta y su rama ligada al cambio.
- AC2: CUANDO la escritura de la configuración de git sigue fallando tras los reintentos ENTONCES `new` no deja ni la carpeta ni la rama que creó, termina con código 1 y su tarjeta dice el error de git y qué deshizo; al repetirlo, el cambio sale con el mismo id.
- AC3: CUANDO la escritura falla y luego funciona ENTONCES `markBranch` la reintenta hasta que funciona; si falla todas las veces, lanza el error de git del último intento.
- AC4: CUANDO la tarjeta del fallo de git dice qué deshizo `new` ENTONCES lo dice en español y en inglés.

## Diseño

- `flow/branches.ts`: `markBranch(git, branch, id, waits = LOCK_WAITS)` ejecuta `git config` con `git.run` y, si falla, espera el siguiente plazo de `waits` y lo repite; acabados los plazos, lanza `GitError` con el último resultado. Su `git` pasa a ser `Pick<Git, "run">`, para que el test le dé un git simulado y unos plazos de 0 ms.
- `commands/new.ts`: `newInWorktree` liga la rama con `markOrUndo`. Si `markBranch` lanza un `GitError`, este quita la worktree y la rama y devuelve `gitFailedCard(gitFailure(error), cards, { folder, branch })`. Otro error sigue subiendo. Para no pasar de 50 líneas, `newInWorktree` deja de guardar `subagent` en una constante.
- Core, `cards/git-failed.ts`: `gitFailedCard(detail, ctx, undone?)` añade, con `undone`, la línea «Specty deshizo lo que había creado: la carpeta X y la rama Y.», con la carpeta y la rama, y su versión en inglés.

## Archivos

- modificar packages/core/src/cards/git-failed.ts — la línea de lo que se deshizo
- modificar packages/core/test/cards/git-failed.test.ts — esa línea en español y en inglés
- modificar packages/cli/src/flow/branches.ts — `markBranch` reintenta
- modificar packages/cli/src/commands/new.ts — `new` deshace la carpeta y la rama si no puede ligarla
- crear packages/cli/test/new-locked-config.test.ts — `markBranch` con un git simulado y `new` con `.git/config.lock`
- modificar docs/ARCHITECTURE.md — qué hace `new` si no puede ligar la rama

## Tareas

- [x] T1: La tarjeta del fallo de git dice qué se deshizo
  - files: packages/core/src/cards/git-failed.ts, packages/core/test/cards/git-failed.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/git-failed.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint && pnpm sources
  - type: fix
- [x] T2: new reintenta y, si no puede, deshace la carpeta y la rama
  - files: packages/cli/src/flow/branches.ts, packages/cli/src/commands/new.ts, packages/cli/test/new-locked-config.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/new-locked-config.test.ts test/worktrees.test.ts test/git-failed.test.ts && pnpm typecheck && pnpm lint && pnpm exec knip
  - type: fix
- [ ] T3: La documentación
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: El test de AC1 suelta el bloqueo mientras `new` corre — lo suelta poco después de que aparezca la carpeta, con más de un segundo de margen sobre los reintentos; si `new` llegara a ligar la rama después de soltarlo, el test pasa igual, y AC3 comprueba los reintentos con un git simulado.
