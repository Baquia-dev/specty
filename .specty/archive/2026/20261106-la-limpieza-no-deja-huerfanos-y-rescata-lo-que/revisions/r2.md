---
kind: standard
epic: 20261106-ninguna-carpeta-ni-worktree-huerfano
slice: C2
---

# La limpieza no deja huérfanos y rescata lo que tienen

## Objetivo

Hoy la limpieza no poda los registros de git de worktrees cuya carpeta ya no existe, no quita nunca la carpeta de un cambio terminado que tiene algo sin commit, no barre las carpetas fantasma de `.worktrees/` ni de la carpeta hermana y deja carpetas vacías en `.specty/changes/` (P198). Con este corte, `specty prune`, y también `new`, `close` y `cancel` al terminar, podan esos registros y quitan esas carpetas, guardando antes en una ref de rescate lo que tengan, y dicen lo que hicieron.

## Fuera de alcance

- Los avisos de `doctor` y `status` sobre los huérfanos y las refs de rescate: es el corte C3.
- Quitar la carpeta de un cambio abierto, la de uno terminado en la que trabaja una conversación viva según el guard o la carpeta en la que corre el proceso: siguen quedándose.
- Borrar ramas o refs de rescate: la limpieza de ramas sigue igual, y las refs quedan hasta que la persona las borre.
- Las carpetas fuera de `.worktrees/` y de la carpeta hermana, y las entradas de esas dos que no son carpetas (archivos, enlaces simbólicos).
- Cambiar cómo `close` quita su propia carpeta (`leaveChangeFolder`): si queda por tener algo sin commit, la quita la limpieza del final.
- La UI.

## Supuestos

- A1: La limpieza (`cleanUp`, en `flow/prune.ts`) la ejecutan `specty prune` y, al terminar, `new` (antes de crear su carpeta, como hoy), `close` y `cancel`; estos dos, desde la carpeta principal, porque la suya puede haberse ido ya. Hace, en orden: `git worktree prune`, que olvida los registros de worktrees cuya carpeta ya no existe salvo los bloqueados (cuántos es la diferencia entre los registros sin carpeta de antes y los de después); quita las carpetas de cambios terminados; barre las carpetas fantasma; borra la carpeta hermana si queda vacía; y borra las carpetas de `.specty/changes/` sin ningún archivo, en la carpeta principal y en cada worktree, de abajo arriba con `rmdir`, así que un archivo que llegue entretanto la deja en su sitio.
  - impacto: alto
- A2: La carpeta de un cambio terminado que hoy se quita (cerrado e incorporado, o cancelado; nunca la principal, la del proceso ni la de una conversación viva) se quita también con algo sin commit (`git status --porcelain` no vacío): primero lo guarda en una ref de rescate encima de su HEAD, y después `git worktree remove --force`, que se lleva lo que git ignora. Sin nada sin commit sigue sin `--force`. Una bloqueada sigue quedándose: si git no la quita después de guardarla, se borra la ref recién creada, para no dejar una nueva en cada limpieza.
  - impacto: alto
- A3: Las carpetas fantasma que se barren son las subcarpetas de `.worktrees/` y de la carpeta hermana que git no tiene como worktree (`ghostFolders`, de C1), salvo la del proceso; las que tienen un repositorio propio (una carpeta `.git`, o un archivo `.git` que apunta a una carpeta de git que existe), que no son de Specty; y las que se llaman como un cambio abierto que perdió su carpeta (`lostChanges`), que recupera `specty restore`. Las subcarpetas se leen antes de preguntar a git por sus worktrees, para no tomar por fantasma la que `git worktree add` está creando. Su rescate no tiene padre, y después se borran enteras.
  - impacto: alto
- A4: El rescate (`rescueFolder`, en `flow/rescue.ts`) hace un commit con un índice temporal (`GIT_INDEX_FILE` en la carpeta `specty/` de git, `index-<pid>-<uuid>`, como `treeWith`, así que `prune` borra el que deje un proceso que murió) y con la carpeta como árbol de trabajo (`-C <carpeta> --git-dir=<carpeta común de git> --work-tree=<carpeta>`). Parte del árbol del padre, o de uno vacío; añade los cambios de lo que tiene seguimiento (`add -u`) y lo sin seguimiento que git no ignora (`ls-files -o --exclude-standard`, con el `.gitignore` de la carpeta principal además, porque una carpeta fantasma no suele tener el suyo); y hace `commit-tree` con el asunto «wip: lo que `<nombre>` tenía sin commit al quitar su carpeta». Si el árbol es el del padre, no hay nada que guardar ni ref. La ref es `refs/specty/rescue/<nombre>/<AAAAMMDDHHMMSS>`, con la hora en UTC y `<nombre>` el de la carpeta, con `-` en lugar de lo que no cabe en una ref; se crea solo si no existe (`update-ref` con el valor anterior vacío) y, si existe, se prueba con `-2`, `-3`… No mueve ninguna rama ni el índice de nadie. Si git falla en cualquier paso, la carpeta se queda con lo que tiene y la salida da la razón de git.
  - impacto: alto
- A5: El umbral que la épica deja a este corte (R2) es de 10 MB: la línea de una ref de rescate dice cuánto pesa lo que guardó (la suma de los blobs nuevos frente al padre) cuando llega a 10 MB.
  - impacto: medio
- A6: La salida de `prune` dice, además de lo de hoy, las carpetas fantasma borradas, cada ref de rescate con cómo ver lo guardado (`git show <ref>`, que enseña solo eso; `git log -p` enseñaría también la historia de la rama) y recuperarlo (`git worktree add <carpeta> <ref>`), cuántos registros de worktrees olvidó git y las carpetas vacías borradas; una carpeta que no se pudo guardar va en «QUEDAN» con la razón. `new`, `close` y `cancel` añaden a su tarjeta las carpetas fantasma borradas, las refs de rescate y las carpetas que no se pudieron guardar, y `close` y `cancel` también las carpetas de cambios terminados borradas, que `new` ya dice; los registros y las carpetas vacías solo los dice `prune`.
  - impacto: medio
- A7: Todo texto nuevo está en español y en inglés, en `packages/core/src/cards/`.

## Criterios de aceptación

- AC4: CUANDO se ejecuta `specty prune`, o terminan `new`, `close` o `cancel`, y git tiene registros de worktrees cuya carpeta ya no existe ENTONCES esos registros desaparecen (salvo los bloqueados), sin que dejen de detectarse los cambios abiertos sin carpeta, y la salida de `prune` dice cuántos.
- AC5: CUANDO la limpieza encuentra la carpeta de un cambio terminado con algo sin commit, y ninguna conversación viva trabaja en ella ENTONCES guarda eso en una ref de rescate encima del commit de su rama, quita la carpeta, y la salida nombra la ref y cómo recuperarla.
- AC6: CUANDO en `.worktrees/` o en la carpeta hermana hay una carpeta fantasma que no es la de un cambio abierto sin carpeta ENTONCES la limpieza guarda en una ref de rescate lo que git no ignora de ella, si hay algo, y la borra; y borra la carpeta hermana si queda vacía. CUANDO es la de un cambio abierto sin carpeta ENTONCES no la toca.
- AC7: CUANDO una carpeta de `.specty/changes/` no tiene ningún archivo ENTONCES la limpieza la borra.
- AC8: CUANDO el rescate de una carpeta falla ENTONCES la carpeta y lo que tiene se quedan, y la salida dice por qué.
- AC11: CUANDO salen los textos nuevos ENTONCES salen en español y en inglés.

## Diseño

- Core, `cards/parallel.ts`: `RescuedFolder` (`folder`, `ref`, `bytes`) y `UnsavedFolder` (`folder`, `reason`); `pruneCard` gana `ghosts`, `rescued`, `unsaved`, `records` y `empty`, opcionales; `cleanupBlocks` da las secciones que `new`, `close` y `cancel` añaden a su tarjeta; `rescueCommitSubject`, el asunto del commit de rescate. Se exportan en `cards/index.ts`.
- CLI, `flow/rescue.ts`: `rescueFolder(session, folder, parent?)` da `nothing`, `saved` (`ref`, `bytes`) o `failed` (`reason`).
- CLI, `flow/orphans.ts`: un buscador por tipo de huérfano, que C3 reutilizará para contarlos: `staleRecords(git)` (cuántos registros de worktrees no tienen carpeta), `sweepableGhosts(session)` (A3) y `emptyChangeFolders(git)` (A1).
- CLI, `flow/prune.ts`: `cleanUp(session)` da `Swept`, lo de `Cleanup` más `ghosts`, `rescued`, `unsaved`, `records` y `empty`; `removeFinished` rescata antes de quitar (A2); `cleanUpFrom(session, main)` la ejecuta desde la carpeta principal, y `withCleanup` añade a una tarjeta lo que hizo. La usan `commands/prune.ts`, `commands/new.ts` y `commands/finish.ts` (`close` y `cancel`).
- Docs: ARCHITECTURE §9 (la limpieza), formats.md §1 (las refs de rescate) y el glosario (`docs/dominio.md`, «Ref de rescate»).

## Archivos

- modificar packages/core/src/cards/parallel.ts — las líneas y secciones nuevas de la limpieza y el asunto del commit de rescate
- modificar packages/core/src/cards/index.ts — exporta lo nuevo de `parallel.ts`
- crear packages/core/test/cards/prune-orphans.test.ts — los textos nuevos de la limpieza, en español y en inglés
- crear packages/cli/src/flow/rescue.ts — guarda una carpeta en una ref de rescate
- crear packages/cli/src/flow/orphans.ts — encuentra los registros sin carpeta, las carpetas fantasma que se barren y las carpetas vacías de `.specty/changes/`
- modificar packages/cli/src/flow/prune.ts — `cleanUp`, el rescate al quitar una carpeta terminada, `cleanUpFrom` y `withCleanup`
- modificar packages/cli/src/commands/prune.ts — usa `cleanUp` y pasa lo nuevo a su tarjeta
- crear packages/cli/test/prune-rescue.test.ts — la limpieza rescata la carpeta de un cambio terminado, o la deja si no puede
- crear packages/cli/test/prune-orphans.test.ts — `prune` poda los registros, barre las carpetas fantasma y borra las carpetas vacías
- modificar packages/cli/src/commands/new.ts — limpia con `cleanUp` y su tarjeta dice lo nuevo
- modificar packages/cli/src/commands/finish.ts — `close` y `cancel` limpian al terminar, desde la carpeta principal
- crear packages/cli/test/prune-commands.test.ts — `new`, `close` y `cancel` también podan los registros
- modificar docs/ARCHITECTURE.md — la limpieza de §9
- modificar docs/formats.md — las refs de rescate en §1
- modificar docs/dominio.md — el término «Ref de rescate»

## Tareas

- [x] T1: Los textos de la limpieza nueva, en español y en inglés
  - files: packages/core/src/cards/parallel.ts, packages/core/src/cards/index.ts, packages/core/test/cards/prune-orphans.test.ts
  - ac: AC4, AC5, AC6, AC7, AC8, AC11
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/prune-orphans.test.ts test/cards/parallel.test.ts test/cards/prune-leftovers.test.ts test/cards/prune-live.test.ts test/cards/prune-units.test.ts test/cards/close.test.ts && pnpm typecheck && pnpm lint
  - type: feat
- [x] T2: La limpieza guarda en una ref de rescate lo sin commit de la carpeta de un cambio terminado
  - files: packages/cli/src/flow/rescue.ts, packages/cli/src/flow/prune.ts, packages/cli/src/commands/prune.ts, packages/cli/test/prune-rescue.test.ts
  - ac: AC5, AC8
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/prune-rescue.test.ts test/prune.test.ts test/cancel-folder.test.ts test/session-end-binding.test.ts test/prune-leftovers.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: feat
- [x] T3: La limpieza poda los registros, barre las carpetas fantasma y borra las carpetas vacías
  - files: packages/cli/src/flow/orphans.ts, packages/cli/src/flow/prune.ts, packages/cli/src/commands/prune.ts, packages/cli/test/prune-orphans.test.ts
  - ac: AC4, AC6, AC7
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/prune-orphans.test.ts test/prune-rescue.test.ts test/prune.test.ts test/lost-folder.test.ts test/restore.test.ts test/ghost-folders.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: feat
- [x] T4: `new`, `close` y `cancel` limpian al terminar
  - files: packages/cli/src/commands/new.ts, packages/cli/src/commands/finish.ts, packages/cli/src/flow/prune.ts, packages/cli/test/prune-commands.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/prune-commands.test.ts test/prune.test.ts test/cancel-folder.test.ts test/ghost-folders.test.ts test/session-return.test.ts test/sessions.test.ts test/worktrees.test.ts test/close-turn.test.ts test/epic-closed-slices.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: feat
- [x] T5: La documentación cuenta la limpieza nueva y las refs de rescate
  - files: docs/ARCHITECTURE.md, docs/formats.md, docs/dominio.md
  - ac: AC4, AC5, AC6, AC7
  - verify: pnpm typecheck && pnpm lint && pnpm sources && pnpm knip
  - type: docs

## Riesgos

- R1: Barrer una carpeta de `.worktrees/` que la persona puso allí — lo que git no ignora se guarda antes en una ref, y una carpeta con repositorio propio no se toca.
- R2: Un rescate grande, con dependencias que git no ignora — se aplica también el `.gitignore` de la carpeta principal, y la salida dice el peso desde 10 MB.
- R3: Podar los registros rompe la detección de los cambios sin carpeta o `specty restore` — un cambio sin carpeta se detecta por su rama, no por el registro; un test lo comprueba después de `specty prune`.
- R4: Una ref de rescate nueva en cada limpieza para una carpeta que git no deja quitar (bloqueada) — si la carpeta queda, la ref recién creada se borra.
- R5: `close` dice que su carpeta queda, porque tenía algo sin commit, y la limpieza del final la quita — la sección de la limpieza va después en la tarjeta y nombra la ref.

## Cierre

### Resumen

La limpieza ya no deja huérfanos (P198, corte C2 de la épica). `cleanUp`, en `flow/prune.ts`, la ejecutan `specty prune`, `new` antes de crear su carpeta, y `close` y `cancel` al terminar, estos dos desde la carpeta principal (`withCleanupFrom`). Primero `git worktree prune` olvida los registros de worktrees sin carpeta, salvo los bloqueados; un cambio abierto sin carpeta se sigue detectando por su rama, y `specty restore` lo recupera. Después quita las carpetas de cambios terminados, también con algo sin commit, que antes guarda en una ref de rescate encima de su HEAD, para luego usar `git worktree remove --force`. Barre las carpetas fantasma de `.worktrees/` y de la carpeta hermana (`sweepableGhosts`, en el nuevo `flow/orphans.ts`), salvo la del proceso, las que tienen un repositorio propio y las que se llaman como un cambio sin carpeta. Por último, borra la carpeta hermana si queda vacía y las carpetas sin archivos de `.specty/changes/`. El rescate (`rescueFolder`, en el nuevo `flow/rescue.ts`) hace un commit en `refs/specty/rescue/<nombre>/<AAAAMMDDHHMMSS>` con un índice temporal y la carpeta como árbol de trabajo, sin mover ninguna rama; si falla, la carpeta se queda y la salida da la razón de git. La tarjeta de `prune` (`cards/parallel.ts`) dice las carpetas fantasma, las refs de rescate con cómo verlas y recuperarlas (y su peso desde 10 MB), los registros olvidados y las carpetas vacías; `new`, `close` y `cancel` añaden lo suyo con `cleanupBlocks`. Los tests: `packages/cli/test/prune-orphans.test.ts` (AC4, AC6, AC7), `prune-rescue.test.ts` (AC5, AC8), `prune-commands.test.ts` (AC4) y `packages/core/test/cards/prune-orphans.test.ts` (AC4–AC8, AC11). La verificación completa pasó entera.

### Desviaciones

- Dos tests que ya existían adaptaron su preparación a la limpieza nueva, sin cambiar lo que comprueban. En `prune.test.ts`, la carpeta cancelada sigue bloqueada mientras se cierra el otro cambio, porque la limpieza del final de `close` ya la quitaría. En `worktrees.test.ts`, la carpeta que deja el test para comprobar el sufijo `-2` tiene un repositorio propio, porque `new` ya barre una carpeta fantasma vacía.
- `removeFinished` y su tipo dejaron de exportarse: fuera de `flow/prune.ts` solo se usa `cleanUp`.
- Para no pasar de 50 líneas por función, `cancel` quita su carpeta y arma sus líneas con `leaveCancelled` y `folderLines` (`commands/finish.ts`), y `new` añade lo de la limpieza con `withSweptAndPorts`.

### Decisiones

- Lo guardado en una ref de rescate se ve con `git show <ref>`, que enseña solo eso; el `git log -p` que la épica prevé para `doctor` (A6, corte C3) enseñaría también la historia de la rama.
- El umbral del peso (R2 de la épica) es de 10 MB.
- El rescate de una carpeta fantasma aplica también el `.gitignore` de la carpeta principal.
- Una carpeta de `.worktrees/` con un repositorio propio no se barre: no es de Specty.
- Si una carpeta se queda después de guardarla (por ejemplo, bloqueada), su ref recién creada se borra.
- `sweepableGhosts` olvida lo que `Git` recordaba (`git.forget()`) antes de pedir la lista de worktrees, para leerla después de las carpetas.

### Pendientes

- Corte C3: `doctor` y `status` cuentan los huérfanos con `flow/orphans.ts` y las refs de rescate.
