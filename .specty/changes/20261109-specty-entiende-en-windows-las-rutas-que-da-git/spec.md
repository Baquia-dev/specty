---
kind: standard
---

# Specty entiende en Windows las rutas que da git

## Objetivo

Windows entra en la 0.1.0, y el run 42601745517 de la CI (main 2a1c7cc) tiene unos 80 tests de la CLI en rojo en `windows-latest` porque Specty no reconoce sus carpetas: git escribe las rutas con `/` (`C:/Users/…`) y Node, las carpetas que Specty construye y la persona las escriben con `\`. Además, al cerrar, cancelar o aceptar desde la sesión de la carpeta del cambio, git no puede borrarla («Permission denied»). Con este cambio, Specty lee en la forma de la plataforma cada ruta que le da git, y ejecuta git en la carpeta que nombra `-C`, así que reconoce la carpeta principal, las de `.worktrees/` y la común de git, y las borra al terminar como en macOS y Linux.

## Fuera de alcance

- Lanzar herramientas en Windows y los `specty` y herramientas simulados con scripts `sh` en los tests (`spawn git ENOENT` con un PATH de prueba, `\r\n`, `$(…)`, ccusage, prioridad): es otro cambio en paralelo.
- La extensión de VS Code en Windows: es otro cambio en paralelo.
- Una carpeta que la shell del propio agente tiene abierta en Windows al cerrar desde dentro: sigue quedándose, como hoy, con su línea «La carpeta … queda» y `specty prune` para después.
- Comparar rutas sin distinguir mayúsculas en Windows.
- Otras rutas de Windows que no vienen de git: la copia de `install` de un archivo fuera del repositorio (`backups\outsideC:\…`), el comando con `\` dentro del plugin de OpenCode y las rutas de Windows dentro de un comando de shell que juzga el guard.

## Supuestos

- A1: Git for Windows escribe con `/` las rutas absolutas que da: la raíz de `rev-parse --show-toplevel`, las de `rev-parse --git-path` en una worktree (en la carpeta principal son relativas, como `.git/specty`) y la carpeta de cada bloque `worktree …` de `worktree list --porcelain`; el log de Windows del run 42601745517 lo muestra («expected 'C:/Users/runneradmin/AppData/Local/Te…' to be 'C:\Users\…'»). Esas son todas las rutas que Specty lee de la salida de git: las demás que usa las construye con `node:path` o las lee de los archivos `.git` y `commondir`, ya con `resolve`.
  - impacto: alto
- A2: `resolve` de `node:path` deja una ruta en la forma de la plataforma: en Windows, `C:/Users/x` es `C:\Users\x`; en macOS y Linux, una ruta absoluta de git queda igual. Así, leer las rutas de git con él no cambia nada fuera de Windows.
  - impacto: medio
- A3: El «Permission denied» al borrar la carpeta del cambio viene del lanzador de git de Git for Windows (`cmd\git.exe` o `bin\git.exe`): arranca el git real como proceso hijo y se queda en la carpeta desde la que se lanzó mientras este corre. Specty ejecuta `git -C <principal> worktree remove <carpeta>` desde un `Git` cuya raíz es esa carpeta, así que el lanzador la retiene y git no puede borrarla; los tests que la borran desde la carpeta principal (como `specty prune`) sí pasan. Arrancar git en la carpeta que nombra `-C`, sin `-C`, hace lo mismo que hoy en todos los sistemas.
  - impacto: alto
- A4: Git y Node dan la misma ruta con las mismas mayúsculas para una carpeta (la letra de la unidad en mayúscula), así que basta con los separadores: las comparaciones siguen como hoy, por texto o con `resolved`.
  - impacto: medio
- A5: Varios tests comparan la salida tal cual de `git worktree list --porcelain`, o la ruta de las copias de `init`, con rutas de `node:path`: en Windows no coinciden nunca, por mucho que Specty lea bien a git. Se corrigen comparándolas en la forma de la plataforma, sin cambiar lo que comprueban.
  - impacto: medio

## Criterios de aceptación

- AC1: CUANDO git da una ruta (la raíz de la carpeta, una de su carpeta de git o la de una worktree) ENTONCES Specty la usa en la forma de la plataforma: en Windows, `C:/Users/x/repo` es `C:\Users\x\repo`, una relativa se resuelve desde la carpeta donde se le preguntó a git, y en macOS y Linux queda como la da git.
- AC2: CUANDO Specty lee la lista de worktrees de git ENTONCES cada una trae su carpeta en la forma de la plataforma, y su rama, su HEAD y si está bloqueada como hoy.
- AC3: CUANDO Specty ejecuta git con `-C <carpeta>` delante ENTONCES lo arranca en esa carpeta, resuelta desde la raíz de su `Git` (y cada `-C` desde la anterior), con el resto de los argumentos y la misma respuesta de git, así que en Windows `close`, `cancel` y `accept` pueden borrar la carpeta del cambio desde una sesión abierta en ella.

## Diseño

- `packages/cli/src/io/git-folders.ts` (nuevo): lo que git dice de las carpetas, en la forma de la plataforma, con el módulo de rutas como parámetro para probar Windows en cualquier sistema (`path.win32`). `fromGit(path, base, paths)` es `paths.resolve(base, path)`. `parseWorktrees(output, base, paths)` es el parser de `worktree list --porcelain` que hoy está dentro de `worktreeQueries`, con `fromGit` en la carpeta. `startedIn(root, args, paths)` quita los `-C` del principio y devuelve la carpeta donde arrancar git y el resto de los argumentos.
- `packages/cli/src/io/git.ts`: `findRoot` y `openRepository` pasan la raíz por `fromGit`, y `openRepository` también `specty` y `common` (hoy con `resolve` desde `cwd`, que ya es lo mismo); `gitPaths` devuelve siempre `fromGit(path, git.root)` en lugar de dejar tal cual una ruta absoluta; `worktreeQueries` usa `parseWorktrees`; `runner` ejecuta git con `startedIn(root, args)`. La memoria de `git-memo.ts` sigue con los argumentos originales: la clave y lo que cambia no se tocan.
- Los tests: `support.ts` gana `worktreeList(cwd)`, la lista de git con cada carpeta en la forma de la plataforma, para los tests que la comparan con carpetas de `node:path`; `init-reversible` busca la carpeta de las copias con `join`.
- ARCHITECTURE §16: la línea de Windows dice que las rutas que da git se leen en la forma de la plataforma y que git arranca en la carpeta de `-C`.

## Archivos

- crear packages/cli/src/io/git-folders.ts — las rutas que da git en la forma de la plataforma, la lista de worktrees y dónde arranca git
- crear packages/cli/src/io/git-folders.test.ts — las tres funciones con rutas de Windows (`path.win32`) y de POSIX, y `-C` con git de verdad
- modificar packages/cli/src/io/git.ts — usa esas funciones en la raíz, las rutas de la carpeta de git, la lista de worktrees y el arranque de git
- modificar packages/cli/test/support.ts — `worktreeList`, la lista de worktrees de git con las carpetas en la forma de la plataforma
- modificar packages/cli/test/prune-commands.test.ts — compara la lista de worktrees con `worktreeList`
- modificar packages/cli/test/prune-orphans.test.ts — compara la lista de worktrees con `worktreeList`
- modificar packages/cli/test/restore.test.ts — compara la lista de worktrees con `worktreeList`
- modificar packages/cli/test/worktree-hooks.test.ts — compara la lista de worktrees con `worktreeList`
- modificar packages/cli/test/init-reversible.test.ts — busca la carpeta de las copias con el separador de la plataforma
- modificar docs/ARCHITECTURE.md — §16: cómo lee Specty las rutas de git en Windows

## Tareas

- [x] T1: Specty lee en la forma de la plataforma las rutas que da git y arranca git en la carpeta de `-C`
  - files: packages/cli/src/io/git-folders.ts, packages/cli/src/io/git-folders.test.ts, packages/cli/src/io/git.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run src/io/git-folders.test.ts test/git-paths.test.ts test/git-memo.test.ts test/worktree-reads.test.ts test/worktrees.test.ts test/cancel-folder.test.ts test/epic-return.test.ts && pnpm lint && pnpm typecheck
  - type: fix
- [x] T2: Los tests comparan la lista de worktrees y la carpeta de las copias en la forma de la plataforma
  - files: packages/cli/test/support.ts, packages/cli/test/prune-commands.test.ts, packages/cli/test/prune-orphans.test.ts, packages/cli/test/restore.test.ts, packages/cli/test/worktree-hooks.test.ts, packages/cli/test/init-reversible.test.ts
  - ac: —
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/prune-commands.test.ts test/prune-orphans.test.ts test/restore.test.ts test/worktree-hooks.test.ts test/init-reversible.test.ts && pnpm lint && pnpm typecheck
  - type: test
- [ ] T3: ARCHITECTURE explica cómo lee Specty las rutas de git en Windows
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: Quitar `-C` y arrancar git en esa carpeta cambia el mensaje cuando la carpeta no existe (Node no puede arrancar git allí, en vez de «cannot change to»). Mitigación: Specty solo pone `-C` con carpetas que git lista o que acaba de usar, y el fallo sigue siendo un fallo con su motivo.
- R2: Sin Windows aquí, algo más de las rutas de git puede seguir fallando allí. Mitigación: las funciones se prueban con `path.win32`, y la sesión principal lee el siguiente run de la CI.
