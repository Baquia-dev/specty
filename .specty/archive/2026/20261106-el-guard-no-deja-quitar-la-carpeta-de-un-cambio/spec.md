---
kind: standard
---

# El guard no deja quitar la carpeta de un cambio abierto

## Objetivo

Hoy la carpeta de un cambio abierto se puede quitar sin pasar por `specty close` ni `specty cancel` (P204). Basta `git worktree remove` desde el shell, o `worktree_remove` de Code Mode de OpenCode 2.2 (`opencode_worktree_remove`), que el guard deja pasar sin juzgar. Con `--force` (o `force: true`) se pierde además lo que tenía sin commit. Con este cambio, el guard no deja que un agente quite así la carpeta de un cambio abierto, y le dice que la quitan `close` al cerrar el cambio o `cancel`, que antes guarda en la rama lo que tiene sin commit.

## Fuera de alcance

- `ExitWorktree` de Claude Code: su hook `WorktreeRemove` ya se niega a quitar la carpeta de un cambio.
- Borrar la carpeta con `rm` o con una herramienta de archivos: el guard ya lo juzga como un borrado de archivos.
- `git worktree move`, `git worktree add` y `worktree_create`: no quitan ninguna carpeta.
- La carpeta de un cambio terminado que `close` o `cancel` dejaron (una conversación trabaja en ella, o tenía algo sin commit): la quita la limpieza (épica 20261106-ninguna-carpeta-ni-worktree-huerfano), y quitarla a mano sigue pasando.
- Lo que la persona ejecuta en su terminal: el guard solo juzga al agente.

## Supuestos

- A1: `git worktree remove` quita la worktree que nombra su primer argumento que no es una opción (`-f` o `--force`, que pueden ir dos veces). Ese argumento es una ruta, resuelta desde donde corre el comando tras sus `cd` y sus `git -C`, o, como en git, el final de la ruta de una worktree registrada (`git worktree remove <id>`). El guard toma como quitadas todas las worktrees que encajan por ruta o por final de ruta. Un argumento con variables, `~` o comillas invertidas no se juzga, como las demás rutas que el análisis no sabe situar; tras un `cd` a una carpeta desconocida, solo encaja por el final de la ruta.
  - impacto: alto
- A2: `opencode_worktree_remove` quita la worktree de su `directory`, resuelta desde la carpeta del evento, como hace OpenCode (comprobado en el código de OpenCode 2.2.5: su entrada es `{ directory, force? }` y pide el permiso `edit`). Sin `directory`, no se juzga.
- A3: La carpeta de un cambio abierto es una worktree registrada en la que Specty ve un cambio que no está en `done` ni en `cancelled`: la misma que `specty status` lista con «en `<carpeta>`» (`locateChanges`). El guard solo la busca cuando la acción quita alguna worktree. La niega con o sin `--force`, también en modo delegado y también si es la carpeta en la que trabaja la propia conversación: quitarla no es una decisión de la persona, cancelar el cambio sí.
  - impacto: alto
- A4: La negativa tiene su propia regla, `change-folder`, y en el shell va justo después de la de los comandos de la persona, antes que las demás, para que el agente vea este motivo y no otro (por ejemplo, el de correr fuera de su carpeta). Dice qué carpeta es y de qué cambio, que se queda mientras el cambio siga abierto y que con `--force` se perdería lo que tiene sin commit. Propone `specty cancel <id>` si el cambio ya no sigue, que guarda en su rama lo que tiene sin commit y quita la carpeta, y `specty close`, que la quita al cerrarlo.
- A5: Todo texto nuevo está en español y en inglés, en `packages/core/src/cards/`.

## Criterios de aceptación

- AC1: CUANDO un agente ejecuta `git worktree remove`, con o sin `--force`, sobre la carpeta de un cambio abierto, por su ruta absoluta o relativa, tras un `cd`, con `git -C` o por su nombre ENTONCES el guard lo bloquea antes de que ocurra, la carpeta sigue, y la negativa dice de qué cambio es y que la quitan `specty close` o `specty cancel`.
- AC2: CUANDO un agente de OpenCode llama a `worktree_remove` de Code Mode con la carpeta de un cambio abierto, también con `force: true` o con una ruta relativa ENTONCES el guard lo bloquea con la misma negativa.
- AC3: CUANDO lo que se quita es una worktree que no es la carpeta de un cambio abierto ENTONCES el guard lo deja pasar como hoy, desde el shell y desde OpenCode.
- AC4: CUANDO sale la negativa nueva ENTONCES sale en español y en inglés.

## Diseño

- `guard/git.ts` (core): `analyzeGit` devuelve también `removes`, el argumento de cada `git worktree remove` con los `-C` del comando, como hace con `commits`.
- `guard/shell.ts` (core): `ShellAnalysis.worktreeRemovals` da, por cada uno, el argumento tal cual (`name`, para encajar por final de ruta) y su ruta (`path`) cuando el análisis sabe situarla, relativa a donde empieza el comando o absoluta, como `placeCommit`. Los que llevan variables, `~` o comillas invertidas no salen.
- `guard/decide.ts` (core): un hecho nuevo del shell, `ShellFacts.removedFolders`, y una acción nueva, `{ kind: "remove-worktree", folders }`, con la regla `change-folder`. `decideShell` la niega justo después de la regla `human`. `OpenFolder` (`{ folder, id }`) va en `guard/worktrees.ts` y se exporta en `index.ts`; el texto es `openFolderDenial`, en `cards/change-folder.ts`.
- `enforce/actions.ts` (cli): `RawAction` gana `{ kind: "remove-worktree", path }`. `agents/opencode.ts` lee `opencode_worktree_remove` con `directory` como esa acción.
- `enforce/removals.ts` (cli, nuevo): `openFoldersRemoved` toma las worktrees de git que encajan por ruta real o por final de ruta, y de ellas las de un cambio abierto (`locateChanges`). `enforce/place.ts` lo llama para el shell y para la acción nueva.

## Archivos

- modificar packages/core/src/guard/git.ts — el argumento de cada `git worktree remove`
- modificar packages/core/src/guard/shell.ts — las worktrees que quita el comando, situadas
- modificar packages/core/src/guard/decide.ts — el hecho y la acción nuevos, y la regla `change-folder`
- modificar packages/core/src/guard/worktrees.ts — el tipo `OpenFolder`
- crear packages/core/src/cards/change-folder.ts — la negativa, en español y en inglés
- modificar packages/core/src/index.ts — exportar `OpenFolder`
- modificar packages/core/test/guard/shell.test.ts — el análisis de `git worktree remove`
- crear packages/core/test/guard/change-folder.test.ts — la decisión y sus textos
- modificar packages/cli/src/enforce/actions.ts — la acción `remove-worktree`
- crear packages/cli/src/enforce/removals.ts — qué carpetas de cambios abiertos quita una acción
- modificar packages/cli/src/enforce/place.ts — situar lo que quitan el shell y la acción nueva
- modificar packages/cli/src/agents/opencode.ts — `opencode_worktree_remove`
- crear packages/cli/test/remove-change-folder.test.ts — los criterios del shell, con el hook de Claude Code
- crear packages/cli/test/opencode-worktree-remove.test.ts — los criterios de OpenCode, con los eventos de su plugin
- modificar docs/ARCHITECTURE.md — el guard protege la carpeta de un cambio abierto; la fila de OpenCode

## Tareas

- [x] T1: El análisis del shell sabe qué worktrees quita `git worktree remove`
  - files: packages/core/src/guard/git.ts, packages/core/src/guard/shell.ts, packages/core/test/guard/shell.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/guard/shell.test.ts && pnpm lint
  - type: feat
- [x] T2: El guard niega quitar la carpeta de un cambio abierto
  - files: packages/core/src/guard/decide.ts, packages/core/src/guard/worktrees.ts, packages/core/src/cards/change-folder.ts, packages/core/src/index.ts, packages/core/test/guard/change-folder.test.ts
  - ac: AC1, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/guard/change-folder.test.ts test/guard/decide.test.ts test/guard/ghosts.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint
  - type: feat
- [x] T3: El guard sabe qué carpetas de cambios abiertos quita un comando de shell
  - files: packages/cli/src/enforce/actions.ts, packages/cli/src/enforce/removals.ts, packages/cli/src/enforce/place.ts, packages/cli/test/remove-change-folder.test.ts
  - ac: AC1, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/remove-change-folder.test.ts test/ghost-folders.test.ts && pnpm lint
  - type: feat
- [x] T4: El guard juzga worktree_remove de OpenCode
  - files: packages/cli/src/agents/opencode.ts, packages/cli/test/opencode-worktree-remove.test.ts, docs/ARCHITECTURE.md
  - ac: AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/opencode-worktree-remove.test.ts test/opencode-session-move.test.ts test/opencode.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: feat

## Riesgos

- R1: Encajar por final de ruta niega quitar una worktree ajena que se llama como la carpeta de un cambio — solo encajan las worktrees registradas en este repositorio, y negar de más aquí no pierde nada: la persona puede quitarla en su terminal.
- R2: `locateChanges` abre una sesión por worktree y es lento con muchas — solo corre cuando la acción quita alguna worktree, que es raro.

## Cierre

### Resumen

El guard ya no deja que un agente quite la carpeta de un cambio abierto fuera de `specty close` y `specty cancel` (P204). Lo niega con `git worktree remove` desde el shell, con o sin `--force`, y con `worktree_remove` de Code Mode de OpenCode 2.2, también con `force: true`. La negativa tiene su propia regla, `change-folder`, dice de qué cambio es la carpeta, avisa de que con `--force` se perdería lo que tiene sin commit, y propone `specty cancel <id>` o `specty close`. En core, `analyzeGit` lee el argumento de cada `git worktree remove` y `analyzeShell` lo sitúa como los commits (`worktreeRemovals`); `decideGuard` niega con `ShellFacts.removedFolders` y con la acción nueva `remove-worktree`, justo después de la regla de los comandos de la persona. En la CLI, `enforce/removals.ts` busca, entre las worktrees de git que nombra la acción (por ruta real o por final de ruta, como git), las de un cambio abierto. OpenCode lee `opencode_worktree_remove` como esa acción. Quitar otra worktree pasa como antes. ARCHITECTURE §10 lo cuenta en «Carpetas de cambios abiertos» y en la fila de OpenCode. Los criterios tienen sus tests en core (`test/guard/shell.test.ts`, `test/guard/change-folder.test.ts`) y en la CLI (`test/remove-change-folder.test.ts`, `test/opencode-worktree-remove.test.ts`). La verificación completa pasó en la aceptación, y los tests ejecutan el 100 % de las líneas que añade el cambio.

### Desviaciones

- Las dos tareas del primer borrador pasaron a cuatro: `propose` avisó de que tocaban demasiados archivos y de que el `typecheck` de la primera compilaría tests de las siguientes. Los tests de la CLI se separaron en uno para el shell y otro para OpenCode.
- `decideGuard` superaba la complejidad máxima (11 de 10) con el caso nuevo: la lectura y la entrada salieron a `decideRead` y `decideEnter`.

### Decisiones

- Solo se protege la carpeta de un cambio abierto. La de un cambio terminado que `close` o `cancel` dejaron la quita la limpieza, y quitarla a mano sigue pasando.
- Se niega también en modo delegado y desde la propia carpeta: quitarla no es una decisión de la persona; cancelar el cambio sí.
- Para el shell, una worktree cuenta como quitada si encaja con el argumento por ruta o por final de ruta, como lo toma git. Un argumento con variables, `~` o comillas invertidas no se juzga, como las demás rutas que el análisis no sabe situar.
- `git worktree move` y `git worktree add` (o `worktree_create`) siguen sin juzgarse: no quitan ninguna carpeta.

### Pendientes

- P207: `packages/core/src/guard/decide.ts` pasa de 298 a 323 líneas de código (el aviso salta en 300). La propuesta es llevar los tipos de lo que juzga el guard a `guard/action.ts`.
