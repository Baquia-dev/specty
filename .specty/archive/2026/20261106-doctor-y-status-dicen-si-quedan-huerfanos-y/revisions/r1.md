---
kind: standard
epic: 20261106-ninguna-carpeta-ni-worktree-huerfano
slice: C3
---

# doctor y status dicen si quedan huérfanos y refs de rescate

## Objetivo

La limpieza de C2 quita los huérfanos al terminar `new`, `close`, `cancel` y `prune`, pero nada dice si quedan entre una y otra, ni que hay refs de rescate con trabajo guardado (P208). Con este corte, `specty doctor` avisa de cada tipo de huérfano con cuántos hay y remite a `specty prune`, y cuenta las refs de rescate con cómo ver y recuperar la más reciente; `specty status` dice en una línea cuántos huérfanos quedan. Sin huérfanos ni refs, no dicen nada.

## Fuera de alcance

- Limpiar: `doctor` y `status` solo cuentan; lo quita `specty prune`, como hoy.
- Datos nuevos en `status --json`, en la UI o en la extensión de VS Code: solo cambia el texto de las tarjetas.
- Borrar refs de rescate, o que `status` las cuente.

## Supuestos

- A1: Un huérfano cuenta si la limpieza de `specty prune`, ejecutada desde esa misma carpeta, lo quitaría. Son cuatro tipos. Los registros de worktrees cuya carpeta ya no existe, salvo los bloqueados, que git no poda: `staleRecords` deja de contarlos, con un `locked` nuevo en cada worktree que da `git.worktrees()`, y la cuenta de `prune` sigue saliendo igual. Las carpetas de cambios terminados que `cleanUp` quitaría: no las de una conversación viva, ni las que aún no están en su rama destino, ni la principal, ni la del proceso. Las carpetas fantasma de `sweepableGhosts`, salvo la del proceso. Y las carpetas sin archivos de `.specty/changes/`.
  - impacto: alto
- A2: Contar no toca nada. La parte de `removeFinished` (`flow/prune.ts`) que decide qué carpetas de cambios terminados se quitan, y por qué se quedan las demás, pasa a `flow/orphans.ts` como `finishedFolders`, junto con `workingFolders`. `removeFinished` la usa, así que la limpieza hace lo mismo que antes. `countOrphans(session)` da cuántos hay de cada tipo.
  - impacto: medio
- A3: En `doctor`, los huérfanos y las refs de rescate son avisos («AVISOS»), que no lo ponen en rojo. Sale una línea por cada tipo que tiene alguno, con cuántos y lo que hará `specty prune`, y otra si hay refs de rescate. Esa línea dice cuántas hay y cuál es la más reciente, por la hora de su nombre y después por el nombre. Dice cómo verla con `git show <ref>`, como la salida de `prune`: la épica decía `git log -p`, que C2 descartó porque enseña también la historia de la rama. Dice cómo recuperarla con `git worktree add <carpeta> <ref>`, cómo listar las demás y que quedan hasta que la persona las borre.
  - impacto: medio
- A4: `status` añade la sección «LIMPIEZA» con una línea: el total de huérfanos, que los quita `specty prune` y que `specty doctor` los cuenta por tipo. Las refs de rescate no salen en `status`: A6 de la épica solo las pide en `doctor`.
  - impacto: medio
- A5: Todo texto nuevo está en español y en inglés, en `packages/core/src/cards/`: los de `doctor`, en un archivo propio, `cards/doctor-cleanup.ts`, como `doctor-agents.ts`, porque `cards/doctor.ts` se acerca al límite de líneas.

## Criterios de aceptación

- AC9: CUANDO hay huérfanos de algún tipo (registros sin carpeta, carpetas de cambios terminados, carpetas fantasma, carpetas vacías de `.specty/changes/`) ENTONCES `specty doctor` avisa de cada tipo con cuántos hay y remite a `specty prune`, y `specty status` lo dice en una línea; CUANDO no hay ninguno ENTONCES no dicen nada.
- AC10: CUANDO hay refs de rescate ENTONCES `specty doctor` dice cuántas, con cómo ver una y recuperarla.
- AC11: CUANDO salen los textos nuevos ENTONCES salen en español y en inglés.

## Diseño

- Core: `DoctorLine` gana `stale-records`, `finished-folders`, `ghost-folders` y `empty-change-folders`, con `count`, y `rescue-refs`, con `count` y `latest`. Sus textos, en `CLEANUP_WRITERS` (`cards/doctor-cleanup.ts`), que `cards/doctor.ts` añade a los suyos. `statusCard` gana un último parámetro opcional, `orphans`, el total, que por defecto es 0; con más de 0, añade la sección «LIMPIEZA».
- CLI, `io/git.ts`: `Worktree.locked`, de la línea `locked` de `git worktree list --porcelain`.
- CLI, `flow/orphans.ts`: `staleRecords` sin los bloqueados; `finishedFolders` y `workingFolders`, traídos de `flow/prune.ts`; y `countOrphans(session)`, que da `{ records, finished, ghosts, empty }`.
- CLI, `flow/rescue.ts`: `rescueRefs(git)`, las refs de rescate, la más reciente primero.
- CLI, `commands/doctor.ts`: `cleanupWarnings`, con las líneas nuevas, entre los avisos; `commands/status.ts` pasa el total a `statusCard`.
- Docs: ARCHITECTURE §6 (`status`), §9 (`workingFolders` en `flow/orphans.ts`) y §14 (`doctor`).

## Archivos

- crear packages/core/src/cards/doctor-cleanup.ts — los textos de `doctor` sobre los huérfanos y las refs de rescate
- modificar packages/core/src/cards/doctor.ts — los códigos nuevos de `DoctorLine` y sus textos
- modificar packages/core/src/cards/status.ts — la sección «LIMPIEZA» con el total de huérfanos
- crear packages/core/test/cards/doctor-cleanup.test.ts — los textos nuevos de `doctor` y `status`, en español y en inglés
- modificar packages/cli/src/io/git.ts — `locked` en cada worktree de `worktrees()`
- modificar packages/cli/src/flow/orphans.ts — `staleRecords` sin los bloqueados, `finishedFolders`, `workingFolders` y `countOrphans`
- modificar packages/cli/src/flow/prune.ts — `removeFinished` usa `finishedFolders`, y `workingFolders` viene de `orphans.ts`
- modificar packages/cli/src/flow/rescue.ts — `rescueRefs`
- modificar packages/cli/src/commands/doctor.ts — avisa de los huérfanos y las refs de rescate
- modificar packages/cli/src/commands/status.ts — pasa el total de huérfanos a su tarjeta
- crear packages/cli/test/doctor-orphans.test.ts — `doctor` y `status` cuentan los huérfanos y las refs de rescate, y callan sin ellos
- modificar docs/ARCHITECTURE.md — lo nuevo de `doctor` y `status`, y dónde vive `workingFolders`

## Tareas

- [ ] T1: Los textos de los huérfanos y las refs de rescate, en español y en inglés
  - files: packages/core/src/cards/doctor-cleanup.ts, packages/core/src/cards/doctor.ts, packages/core/src/cards/status.ts, packages/core/test/cards/doctor-cleanup.test.ts
  - ac: AC9, AC10, AC11
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/doctor-cleanup.test.ts test/cards/doctor.test.ts test/cards/status-fronts.test.ts test/cards/status-holder.test.ts test/cards/status-away.test.ts test/cards/status-turn.test.ts test/cards.test.ts && pnpm typecheck && pnpm lint
  - type: feat
- [ ] T2: `doctor` y `status` cuentan los huérfanos y las refs de rescate
  - files: packages/cli/src/io/git.ts, packages/cli/src/flow/orphans.ts, packages/cli/src/flow/prune.ts, packages/cli/src/flow/rescue.ts, packages/cli/src/commands/doctor.ts, packages/cli/src/commands/status.ts, packages/cli/test/doctor-orphans.test.ts
  - ac: AC9, AC10
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/doctor-orphans.test.ts test/prune-orphans.test.ts test/prune-rescue.test.ts test/prune.test.ts test/prune-commands.test.ts test/lost-status.test.ts test/lost-folder.test.ts test/status-json.test.ts test/status-away.test.ts test/front-status.test.ts test/memory-status.test.ts test/doctor-worktrees.test.ts test/doctor-enter.test.ts test/cancel-folder.test.ts test/session-end-binding.test.ts test/restore.test.ts test/ghost-folders.test.ts test/git-memo.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: feat
- [ ] T3: La documentación cuenta los avisos de `doctor` y `status`
  - files: docs/ARCHITECTURE.md
  - ac: AC9, AC10
  - verify: pnpm typecheck && pnpm lint && pnpm sources && pnpm knip
  - type: docs

## Riesgos

- R1: `status` se hace más lento al buscar los huérfanos, y lo lee la extensión de VS Code — los buscadores leen carpetas y la lista de worktrees, y solo miran el estado de los cambios terminados; sin carpetas fantasma no busca los cambios sin carpeta.
- R2: Un aviso que `prune` no quita nunca, como el registro de una worktree bloqueada — los bloqueados no cuentan, y cada tipo cuenta solo lo que la limpieza quitaría desde esa carpeta.
