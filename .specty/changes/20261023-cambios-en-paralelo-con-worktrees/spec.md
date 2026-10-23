---
kind: standard
---

# Cambios en paralelo con worktrees

## Objetivo

Specty permite trabajar varios cambios a la vez, cada uno con su propio agente. `specty new --worktree "<título>"` crea el cambio en una worktree de git nueva, con su rama y su carpeta, sin tocar la carpeta actual ni lo que otra sesión esté haciendo en ella. Hoy un segundo cambio exige terminar el primero o cambiar de rama en la misma carpeta, y eso le movería los archivos a la sesión que trabaja ahí.

## Fuera de alcance

- Que el guard bloquee las escrituras de un agente en la carpeta de otro cambio: necesita core y la CLI, y con la documentación pasaría del máximo de 2 módulos. Va en el siguiente cambio.
- `specty status` y los comandos de la persona sobre todas las worktrees, eligiendo el cambio según su fase.
- Avisos de archivos compartidos entre cambios y la integración con `main` antes de aceptar.
- La Bandeja de la UI con los cambios de todas las worktrees: necesita el servidor local de §15.
- Borrar la worktree al cerrar o fusionar el cambio.
- `specty new` sin `--worktree`: sigue creando la rama desde la actual, en la misma carpeta.

## Supuestos

- A1: La worktree va fuera del repositorio, en una carpeta hermana de la principal, `<carpeta principal>.worktrees/<id>` (en este repo, `Specty/specty.worktrees/<id>`), porque dentro del repo la verían como archivos sin seguimiento las herramientas y los tests de la otra carpeta.
  - impacto: alto
- A2: Por defecto la rama nueva parte de la rama principal y no de la actual, porque un cambio en paralelo no debe heredar el trabajo sin fusionar de otro; la principal es la de `origin/HEAD` y, sin remoto, la primera que exista de `init.defaultBranch`, `main` y `master`; si no existe ninguna se usa HEAD, y `--from <rama>` la fija a mano.
  - impacto: alto
- A3: Specty no instala las dependencias en la worktree nueva, porque eso depende del stack y puede tardar minutos; la salida pide hacerlo antes de abrir el agente.
  - impacto: alto
- A4: Se copian tal cual los archivos de hooks de agente que gestiona Specty (`.claude/settings.local.json`, `.claude/settings.json` y `.cursor/hooks.json`) cuando existen y git no los sigue; los versionados ya llegan con la rama, los hooks de git se comparten entre worktrees y una configuración global, como la de Codex, vale para cualquier carpeta; ningún otro archivo sin seguimiento se copia.
- A5: `new --worktree` no mira el cambio en curso ni el código sin spec de la carpeta actual, porque no los toca: la worktree nueva parte limpia de su base.
- A6: Una worktree anidada se reconoce porque aparece en `git worktree list` del mismo repositorio; cualquier otro repositorio anidado sin seguimiento sigue contando como hoy.

## Criterios de aceptación

- AC1: CUANDO se ejecuta `specty new --worktree "<título>"` ENTONCES existe la carpeta `<carpeta principal>.worktrees/<id>` en la rama `specty/<id>` con el esqueleto de la spec, `specty next` en esa carpeta muestra el cambio en borrador, y la carpeta actual sigue en su rama y con sus archivos como estaban.
- AC2: CUANDO la carpeta actual tiene un cambio en curso o código sin spec ENTONCES `new --worktree` crea el cambio igual, y `new` sin `--worktree` sigue bloqueando con un SIGUIENTE que propone `--worktree`.
- AC3: CUANDO no se pasa `--from` ENTONCES la rama nueva parte de la rama principal, aunque la carpeta actual esté en otra rama.
- AC4: CUANDO se pasa `--from <rama>` ENTONCES la rama nueva parte de esa rama, y si no existe el comando se bloquea sin crear la carpeta ni la rama.
- AC5: CUANDO la carpeta actual tiene archivos de hooks de agente que git no sigue ENTONCES la worktree nueva los tiene con el mismo contenido.
- AC6: CUANDO se crea el cambio ENTONCES la salida dice la carpeta, la rama, la base y los archivos copiados, y el SIGUIENTE pide instalar las dependencias y abrir allí un agente con `specty next`.
- AC7: CUANDO `git.branchPerChange` es `false` ENTONCES `new --worktree` se bloquea y explica que necesita una rama por cambio.
- AC8: CUANDO dentro del repositorio hay otra worktree (por ejemplo, `.claude/worktrees/x`) ENTONCES no aparece como código sin spec, `task done` no la da por fuera de alcance y los commits de Specty no la incluyen.

## Diseño

- `flow/worktree.ts` (nuevo):
  - `mainBranch(git)` aplica A2 y devuelve la rama principal, o nada para usar HEAD.
  - `worktreeFolder(git, id)` toma la worktree principal (la primera de `git worktree list --porcelain`) y devuelve `<dirname>/<basename>.worktrees/<id>`.
  - `addWorktree(…)` ejecuta `git worktree add -b <rama> <carpeta> <base>` y copia los archivos de A4; devuelve la carpeta y lo copiado.
- `commands/new.ts`: con `worktree`, exige `git.branchPerChange`, se salta las comprobaciones de cambio en curso y de código sin spec (A5), resuelve la base (`--from` o A2), crea la worktree y escribe la spec, `state.json` y `audit.jsonl` dentro de ella, con su `Git` y sus rutas (`createGit`, `repoPaths`). `state.baseCommit` es el commit de la base. `uniqueId` también da por ocupado un id cuya carpeta ya existe. El bloqueo por cambio en curso propone `specty new --worktree "<título>"`. Los textos nuevos van en español e inglés, junto a los que ya tiene el comando.
- `io/git.ts`: `worktrees()` lee `git worktree list --porcelain` (ruta y rama). De los archivos sin seguimiento se descartan las entradas `dir/` que son worktrees del repo; la lista solo se pide cuando aparece una entrada así, y las rutas se comparan ya resueltas (`realpath`).
- `flow/commits.ts`: al preparar el commit añade `:(exclude)<ruta>` por cada worktree anidada, para que `git add -A .` no la meta como repositorio embebido.
- `program.ts`: opciones `--worktree` y `--from <rama>`; `--from` sin `--worktree` es un error.
- `install/agents.ts` exporta la lista de archivos de hooks de agente, y la usan el instalador y la copia.

## Archivos

- modificar packages/cli/src/commands/new.ts — opción `--worktree`, base y salida; el bloqueo propone `--worktree`
- crear packages/cli/src/flow/worktree.ts — rama principal, carpeta, `git worktree add` y copia de los hooks del agente
- modificar packages/cli/src/program.ts — opciones `--worktree` y `--from`
- modificar packages/cli/src/install/agents.ts — lista de archivos de hooks del agente
- modificar packages/cli/src/io/git.ts — `worktrees()` y archivos sin seguimiento sin las worktrees anidadas
- modificar packages/cli/src/flow/commits.ts — no preparar las worktrees anidadas
- crear packages/cli/test/worktrees.test.ts — pruebas de punta a punta
- modificar docs/ARCHITECTURE.md — `new --worktree` en §6 y las worktrees en §9

## Tareas

- [x] T1: Las worktrees anidadas no cuentan como cambios
  - files: packages/cli/src/io/git.ts, packages/cli/src/flow/commits.ts, packages/cli/test/worktrees.test.ts
  - ac: AC8
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/worktrees.test.ts
  - type: fix
- [x] T2: `specty new --worktree`
  - files: packages/cli/src/flow/worktree.ts, packages/cli/src/commands/new.ts, packages/cli/src/program.ts, packages/cli/src/install/agents.ts, packages/cli/test/worktrees.test.ts
  - ac: AC1, AC2, AC3, AC4, AC5, AC6, AC7
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/worktrees.test.ts
- [ ] T3: Documentar los cambios en paralelo
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm check
  - type: docs

## Riesgos

- R1: La rama principal detectada no es la que el usuario espera, por ejemplo con un remoto que tiene otra rama por defecto — la salida dice siempre la base, y `--from` la fija.
- R2: Con enlaces simbólicos en la ruta (en macOS, `/var` y `/private/var`), una worktree anidada no se reconocería — las rutas se comparan ya resueltas, y los tests usan carpetas temporales resueltas.
- R3: Hasta el siguiente cambio, un agente puede escribir en la carpeta de otro cambio — el `task done` de ese cambio lo detecta si el archivo queda fuera de su alcance, y el bloqueo en el guard es el siguiente cambio de la serie.
