---
kind: standard
---

# Los tests de la CLI tardan menos

## Objetivo

La unidad cli de la verificación completa tarda unos 4 minutos y corre en casi todos los cambios. Medido el 2026-11-05: sus 1188 tests suman 3051 s; en `test/flow.test.ts` (13 tests, 16 s) se lanzaron 1468 procesos de git, a unos 9 ms cada uno, unos 13 s, y crear los repositorios de los tests (`tempRepo`) solo era el 5 % de ellos. El resto son las consultas de cada comando de Specty: por cada sesión, la raíz y las rutas `specty` y `common` en tres procesos, y la rama, HEAD, la lista de worktrees y la configuración, preguntadas varias veces (`symbolic-ref HEAD` 218 veces en 86 sesiones). Con este cambio, cada comando abre su sesión con un solo proceso de git y recuerda unos instantes esas respuestas, así que los tests, el guard y cada comando lanzan menos git.

## Fuera de alcance

- Crear los repositorios de los tests desde una plantilla: son el 5 % de los procesos.
- Recordar respuestas que dependen de los archivos de la carpeta (`diff`, `ls-files`, `status`): cambian sin pasar por git.
- Cambiar qué consulta cada comando o en qué orden.

## Supuestos

- A1: `git rev-parse --show-toplevel --git-path specty --git-path common` da en un proceso la raíz y las dos rutas, que hoy son tres. Las rutas que da relativas lo son a la carpeta desde la que se pregunta, así que se resuelven contra ella. Fuera de un repositorio sale con error, como hoy `--show-toplevel`.
  - impacto: alto
- A2: Cada `Git` recuerda durante 2 s la respuesta de `branch()`, `head()`, `config(key)` y `worktrees()`. Solo cambian con un comando de git: si el propio `Git` ejecuta uno que no está en la lista de los que solo leen (`rev-parse`, `diff`, `ls-files`, `ls-tree`, `log`, `show`, `cat-file`, `merge-base`, `status`, `for-each-ref`, `write-tree`, `read-tree`, `config --get`, `symbolic-ref` sin valor nuevo y `worktree list`), olvida todas. Los 2 s acotan lo que otro proceso pudo cambiar entretanto, como el servidor de `specty ui`, que usa el mismo `Git` durante horas.
  - impacto: alto
- A3: Una respuesta que falla o está vacía también se recuerda, porque es la respuesta (sin rama, sin HEAD, sin la clave). Un `output` que lanza `GitError` no se recuerda.
- A4: Los tests que ya existen no cambian y siguen pasando: el cambio no altera lo que responde git, solo cuántas veces se le pregunta.
  - impacto: alto

## Criterios de aceptación

- AC1: CUANDO un comando de Specty abre su sesión ENTONCES git se ejecuta una sola vez para la raíz y las rutas `specty` y `common` de su carpeta.
- AC2: CUANDO un mismo `Git` consulta varias veces en 2 s la rama, HEAD, una clave de configuración o la lista de worktrees, y entre medias solo ejecuta comandos que leen ENTONCES git responde a cada consulta una sola vez.
- AC3: CUANDO entre dos consultas el propio `Git` ejecuta un comando que puede cambiarlas (un commit, un `switch`, un `worktree add`, un `config` que escribe) ENTONCES la siguiente consulta vuelve a preguntar a git y da la respuesta nueva.
- AC4: CUANDO pasan más de 2 s desde una consulta ENTONCES la siguiente vuelve a preguntar a git.
- AC5: CUANDO se ejecutan los tests de la CLI ENTONCES pasan sin cambios y `test/flow.test.ts` lanza al menos un 25 % menos procesos de git que los 1468 de hoy.
  - test: manual

## Diseño

- `io/git-memo.ts` (nuevo): `recentAnswers(ttlMs, now)` guarda respuestas por clave con su hora, las da mientras no pasaron `ttlMs`, y `forget()` las borra; `onlyReads(args)` dice si un comando de git solo lee.
- `io/git.ts`: `openRepository(cwd)` hace la pregunta de A1 y da la raíz y las dos rutas, que `createGit` recibe para empezar `gitPaths` con ellas. El `runner` llama a `forget()` antes de un comando que no solo lee, y `head`, `branch`, `config` y `worktrees` pasan por las respuestas recientes.
- `session.ts`: `openSession` abre con `openRepository` en lugar de `findRoot`.
- Docs: ARCHITECTURE §10, el párrafo del rendimiento del guard (`gitPaths`).

## Archivos

- crear packages/cli/src/io/git-memo.ts — respuestas recientes de las consultas de git y qué comandos solo leen
- modificar packages/cli/src/io/git.ts — abrir el repositorio con un proceso y recordar las consultas
- modificar packages/cli/src/session.ts — abrir la sesión con `openRepository`
- crear packages/cli/test/git-memo.test.ts — AC1 a AC4
- modificar docs/ARCHITECTURE.md — las consultas de git recordadas y la apertura en un proceso

## Tareas

- [x] T1: Cada comando abre su sesión con un proceso de git y recuerda unos instantes sus consultas
  - files: packages/cli/src/io/git-memo.ts, packages/cli/src/io/git.ts, packages/cli/src/session.ts, packages/cli/test/git-memo.test.ts
  - ac: AC1, AC2, AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/git-memo.test.ts test/git-paths.test.ts test/flow.test.ts test/enter.test.ts test/worktree-hooks.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: perf
- [x] T2: La documentación de las consultas recordadas
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: Una consulta recordada podría quedar vieja si otro proceso cambia la rama, HEAD, la configuración o las worktrees en esos 2 s — es el mismo margen que ya hay entre dos consultas seguidas, y el propio `Git` olvida todo tras cualquier comando que pueda cambiarlas.
