---
kind: standard
---

# Los últimos fallos de Windows del CI

## Objetivo

Tras seis cambios de Windows, el run 42616529185 de la CI (main 5ba0e12) deja en `check (windows-latest, Node 22)` 16 tests en 13 archivos; Linux y macOS pasan. Este cambio arregla los de P395: el guard lee mal una `\` entre comillas dobles, no toma `C:\…` como ruta absoluta tras un `cd` y no reconoce la carpeta de un cambio que `git worktree remove` nombra por el final de su ruta con `\`; y los tests del guard, de la copia de `install` y del plugin de OpenCode esperaban rutas con `/`, sin comillas o sin escapar. Con él, el guard se comporta en Windows como en macOS y Linux, y esos tests comprueban lo mismo con la forma de cada plataforma. El resto de los 16 (el check de vulnerabilidades, la carpeta común de git en dos tests, la tarjeta de la épica, `doctor` y los `chmod`) va en un cambio siguiente, porque juntos el cambio era XL.

## Fuera de alcance

- Los otros fallos del run: `check-vulnerabilities`, `delegate`, `switch-log`, `epic-subagents`, `doctor-watchers`, `cancel-folder` y `prune-rescue`, en el cambio siguiente.
- Los fallos de Windows que aparezcan en el siguiente run detrás de los que hoy cortan cada test: se verán en ese run.
- Comandos de PowerShell o de `cmd.exe` en el guard: los agentes ejecutan sus comandos de shell con bash (Git Bash en Windows).
- Comparar rutas de Windows sin distinguir mayúsculas.
- Las copias de `install` de dos unidades distintas con la misma ruta: siguen yendo a `outside/<ruta sin la unidad>`.

## Supuestos

- A1: Los agentes ejecutan en Windows sus comandos de shell con bash (Git Bash), así que el guard los sigue leyendo como bash: fuera de comillas, una `\` escapa el carácter siguiente, y un test que mete una ruta `C:\…` sin comillas en un comando escribe en otra ruta; ese test es el que cambia, no el guard.
- A2: Entre comillas dobles, bash solo quita la `\` delante de `$`, `` ` ``, `"`, `\` o un salto de línea; delante de cualquier otro carácter se queda. Es lo que hace que `cd "C:\Users\ana"` llegue entero.
- A3: Una ruta que empieza por una letra de unidad con `\` o `/` (`C:\…`, `C:/…`) o por `\\` es absoluta en Windows; en macOS y Linux nadie escribe así una ruta relativa, así que el análisis del shell, que no sabe la plataforma, la toma como absoluta en todas.
- A4: Lo que ya hace bien el producto y solo esperaba mal el test: la copia de un archivo de fuera del repositorio va a `outside/<ruta>` sin la letra de unidad, y el plugin de OpenCode escribe el comando con `JSON.stringify`, que dobla las `\`. En Windows no hay bit de ejecución, así que el test solo lo espera fuera de Windows.
- A5: El guard da en sus mensajes la ruta como la resuelve la plataforma (`C:\…\src\x.ts`), no como la escribió el agente: los tests la esperan con `join`.

## Criterios de aceptación

- AC1: CUANDO el guard lee un comando con una ruta de Windows entre comillas dobles (`cd "C:\Users\ana\otro" && git commit -m x`) ENTONCES la toma como bash: la `\` se queda salvo delante de `$`, `` ` ``, `"`, `\` o un salto de línea, y el commit corre en `C:\Users\ana\otro`.
- AC2: CUANDO un comando nombra una ruta absoluta de Windows (`C:\…`, `C:/…` o `\\servidor\…`), también tras un `cd` o en `git -C`, ENTONCES el guard la ubica como absoluta y no dentro de la carpeta del `cd` anterior; un `cd` a ella mueve los comandos siguientes allí.
- AC3: CUANDO `git worktree remove` nombra en Windows la carpeta de un cambio abierto por el final de su ruta (`20261109-x` o `.worktrees\20261109-x`) ENTONCES el guard la reconoce como en macOS y Linux y la niega.
- AC4: CUANDO la CI corre en Windows ENTONCES los tests del guard (`enforce`, `ghost-folders`, `worktrees`), de la copia de `install` y del plugin de OpenCode comprueban lo mismo que en macOS y Linux, con las rutas entre comillas en los comandos de bash y la forma de la plataforma en lo que esperan.
  - test: manual

## Diseño

- `core/src/guard/tokens.ts`: entre comillas dobles, la `\` solo escapa `$`, `` ` ``, `"`, `\` y el salto de línea; delante de otro carácter se añade tal cual.
- `core/src/guard/shell.ts`: una sola comprobación de ruta absoluta (`/`, letra de unidad con `\` o `/`, `\\`) para `locate` y `enter`; una ruta absoluta de Windows pierde las barras finales salvo la de la raíz (`C:\`).
- `cli/src/enforce/removals.ts`: `endsWithName(folder, name, paths)` compara el final de la ruta por componentes enteros; con `path.win32`, `\` y `/` valen igual. `paths` es el de la plataforma salvo en los tests, como `fromGit`.
- Tests: los comandos de bash llevan las rutas entre comillas simples y esperan la ruta nativa (`join`); la copia de `outside/` se calcula sin la unidad; el bit de ejecución se espera solo fuera de Windows; y el comando del plugin, con `JSON.stringify`.

## Archivos

- modificar packages/core/src/guard/tokens.ts — la `\` entre comillas dobles, como bash
- modificar packages/core/src/guard/shell.ts — las rutas absolutas de Windows en `locate` y `enter`
- crear packages/core/test/guard/shell-windows.test.ts — los comandos con rutas de Windows (AC1, AC2)
- modificar packages/cli/src/enforce/removals.ts — el final de la ruta con `\` o `/` en Windows
- crear packages/cli/src/enforce/removals.test.ts — `endsWithName` con `path.win32` y `path.posix` (AC3)
- modificar packages/cli/test/enforce.test.ts — las rutas del repositorio entre comillas en los comandos
- modificar packages/cli/test/ghost-folders.test.ts — las rutas entre comillas en los comandos y la ruta nativa esperada
- modificar packages/cli/test/worktrees.test.ts — las rutas entre comillas en los comandos
- modificar packages/cli/test/install-files.test.ts — la copia sin la unidad y el bit de ejecución fuera de Windows
- modificar packages/cli/test/opencode-install.test.ts — el comando del plugin con `JSON.stringify`
- modificar docs/ARCHITECTURE.md — el análisis del shell y `git worktree remove` con rutas de Windows

## Tareas

- [ ] T1: El análisis del shell lee las rutas de Windows
  - files: packages/core/src/guard/tokens.ts, packages/core/src/guard/shell.ts, packages/core/test/guard/shell-windows.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/guard/shell-windows.test.ts test/guard/shell.test.ts && pnpm lint
  - type: fix
- [ ] T2: `git worktree remove` por el final de la ruta, también con `\`
  - files: packages/cli/src/enforce/removals.ts, packages/cli/src/enforce/removals.test.ts, docs/ARCHITECTURE.md
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run src/enforce/removals.test.ts test/remove-change-folder.test.ts && pnpm lint && pnpm typecheck
  - type: fix
- [ ] T3: Los tests del guard con las rutas entre comillas
  - files: packages/cli/test/enforce.test.ts, packages/cli/test/ghost-folders.test.ts, packages/cli/test/worktrees.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/enforce.test.ts test/ghost-folders.test.ts test/worktrees.test.ts && pnpm lint
  - type: test
- [ ] T4: La copia de `install` y el plugin de OpenCode con la forma de cada plataforma
  - files: packages/cli/test/install-files.test.ts, packages/cli/test/opencode-install.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/install-files.test.ts test/opencode-install.test.ts && pnpm lint && pnpm typecheck && pnpm knip
  - type: test

## Riesgos

- R1: Aquí no hay Windows: lo que se arregla allí solo se comprueba en la CI. Mitigación: el producto se prueba con `path.win32` y con rutas `C:\…` en el análisis del shell, que no depende de la plataforma; la sesión principal lee el siguiente run.
- R2: Un test que hoy se corta en Windows en su primera aserción puede tener otra detrás que también falle allí. Mitigación: se revisan las aserciones siguientes de cada test con la forma de Windows, y lo que quede lo dirá el siguiente run.
