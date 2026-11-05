---
kind: standard
epic: 20261105-temporales-se-borran
slice: C4
---

# prune borra los restos de los procesos que murieron

## Objetivo

Un proceso de Specty que muere a mitad deja restos en las carpetas de git que nadie borra: la escritura a medias de un archivo (`<archivo>.<pid>.tmp`), la verificación en vivo de `task done` o `accept` (`common/specty/runs/<cambio>.json`) y el índice temporal con el que lee el árbol (`specty/index-*`). Con este cambio, `specty prune` los borra, sin tocar los de un proceso que sigue vivo, y su tarjeta dice cuántos.

## Fuera de alcance

- Las escrituras a medias fuera de la carpeta común de Specty (`.git/common/specty/`), como las de `.git/specty/` de cada worktree o las de la carpeta del cambio.
- Las ejecuciones en vivo que no se pueden leer: `prune` solo borra las de un proceso que ya no existe.
- Borrar estos restos en otros comandos, como `specty new`: solo `prune`.
- La carpeta temporal del sistema: cortes C1 y C2.

## Supuestos

- A1: Una escritura a medias es un archivo de `.git/common/specty/`, a cualquier profundidad, cuyo nombre acaba en `.<pid>.tmp` (como las de `writeText` y los borradores de los bloqueos), y es de un proceso muerto cuando ese pid no existe en la máquina (`alive` de `store/lock.ts`). No se miran las copias de `backups/`, que guardan archivos de la persona tal cual.
  - impacto: alto
- A2: Una verificación en vivo es un archivo `.git/common/specty/runs/<cambio>.json` que se puede leer, y es de un proceso muerto cuando su `pid` no existe, la misma regla con la que el servidor de la UI ya la borra.
- A3: Un índice temporal de git es un archivo `index-*` de la carpeta `specty/` propia de cada worktree: `.git/specty/` para la principal y `.git/worktrees/<nombre>/specty/` para las demás, también la de una worktree cuya carpeta ya no existe. Es viejo cuando su fecha de modificación tiene más de una hora respecto a la hora de la sesión; uno más reciente puede ser de un proceso vivo, porque `treeWith` lo usa unos segundos.
  - impacto: alto
- A4: La tarjeta de `prune` añade la sección «RESTOS DE PROCESOS QUE MURIERON» tras la del registro de unidades y antes de «QUEDAN», con una línea por tipo de resto que borró y su número; sin restos no sale, y con alguno ya no dice que no había nada que limpiar.

## Criterios de aceptación

- AC1: CUANDO se ejecuta `specty prune` y quedan escrituras a medias, ejecuciones en vivo de procesos que ya no existen o índices temporales de más de una hora ENTONCES los borra y su tarjeta dice cuántos de cada tipo, sin tocar los de un proceso vivo ni un índice reciente.
- AC2: CUANDO salen los textos nuevos de la tarjeta de `prune` ENTONCES salen en español y en inglés.

## Diseño

- Core: `pruneCard` (`cards/parallel.ts`) recibe un `leftovers` opcional, `{ writes, runs, indexes }`, y lo pinta en la sección nueva con las líneas «Escrituras a medias: N.», «Verificaciones cortadas: N.» e «Índices temporales de git de más de una hora: N.» («Half-done writes», «Cut-off verifications», «Temporary git indexes over an hour old»), solo las que no son cero. Cuentan para «No había nada que limpiar.».
- CLI: `store/leftovers.ts` con `removeLeftovers(git, now)`, que devuelve los tres números. Primero borra las ejecuciones en vivo muertas (`readRuns` y `clearRun` de `store/runs.ts`), después recorre `.git/common/specty/` sin `backups/` en busca de escrituras a medias, y al final los índices de la carpeta `specty/` del directorio común y de cada `worktrees/*/`. El directorio común es el padre de `git.gitPath("common")`. `commands/prune.ts` lo llama tras las demás limpiezas, con `session.environment.now()`, y pasa el resultado a la tarjeta.

## Archivos

- modificar packages/core/src/cards/parallel.ts — la sección de los restos en la tarjeta de `prune`, en español e inglés
- crear packages/core/test/cards/prune-leftovers.test.ts — los textos nuevos de la tarjeta en los dos idiomas
- crear packages/cli/src/store/leftovers.ts — encontrar y borrar los restos de los procesos que murieron
- modificar packages/cli/src/commands/prune.ts — borrar los restos y pasar cuántos a la tarjeta
- crear packages/cli/test/prune-leftovers.test.ts — los criterios de `prune` con los restos
- modificar packages/cli/test/prune-units.test.ts — la escritura a medias que debe quedar es la de un proceso vivo
- modificar docs/ARCHITECTURE.md — la limpieza (§9) cuenta qué restos borra `prune`
- modificar docs/formats.md — las ejecuciones en vivo, los índices temporales y las escrituras a medias en las carpetas de git

## Tareas

- [ ] T1: La tarjeta de prune dice qué restos borró
  - files: packages/core/src/cards/parallel.ts, packages/core/test/cards/prune-leftovers.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/prune-leftovers.test.ts test/cards/prune-units.test.ts test/cards/prune-live.test.ts test/cards/parallel.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint
- [ ] T2: prune borra los restos de los procesos que murieron
  - files: packages/cli/src/store/leftovers.ts, packages/cli/src/commands/prune.ts, packages/cli/test/prune-leftovers.test.ts, packages/cli/test/prune-units.test.ts, docs/ARCHITECTURE.md, docs/formats.md
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/prune-leftovers.test.ts test/prune-units.test.ts test/prune-live.test.ts test/prune.test.ts && pnpm typecheck && pnpm lint && pnpm knip

## Riesgos

- R1: Un pid que el sistema ya dio a otro proceso hace pasar por vivo el resto de uno muerto — queda hasta una limpieza posterior; nunca se borra lo de un proceso vivo.
