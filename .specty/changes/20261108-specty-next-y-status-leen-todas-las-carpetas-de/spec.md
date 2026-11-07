---
kind: standard
---

# specty next y status leen todas las carpetas de cambio con un solo git worktree list

## Objetivo

`specty next` y `specty status` leen el cambio de cada carpeta abierta, y hoy lanzan tres procesos de git por carpeta: su rama (`symbolic-ref`), y dónde guarda git su `specty/` y su `common/` (`rev-parse --git-path`), una vez por cada lectura de todas las carpetas, que en un mismo comando son hasta tres. Con 10 carpetas abiertas eso son 38 procesos para `next` desde la carpeta principal, 87 desde una de cambio y unos 63 para `status`, de 1,2 a 2,2 s por llamada. Con este cambio, las demás carpetas se leen con el `git worktree list --porcelain` que ya se hace, que da el HEAD y la rama de cada una, y el número de procesos deja de crecer con las carpetas.

## Fuera de alcance

- Las demás lecturas por carpeta del servidor de `specty ui` que no pasan por `locateChanges` (`server/events.ts`).
- Los `Git` de la carpeta principal que crean `flow/prune.ts` y `commands/wait.ts`.
- Cambiar los 2 s durante los que un `Git` recuerda una lectura.
- Los archivos de las verificaciones que cambia otro corte en paralelo (`flow/live-run.ts`, `flow/process-budget.ts`, `commands/verify.ts`, `core/schema/verify.ts`).

## Supuestos

- A1: `git worktree list --porcelain` da de cada carpeta su commit de HEAD (`HEAD <commit>`) y su rama (`branch refs/heads/…`, o `detached` si no tiene), en el mismo instante en que lista las carpetas. En una rama sin commits da un HEAD de ceros, y entonces se pregunta a git en esa carpeta, como hoy.
  - impacto: alto
- A2: La carpeta de git de una worktree es la que nombra su archivo `.git` (`gitdir: …`, relativa a la carpeta si no es absoluta), o la carpeta `.git` misma en la principal, como la busca git. `rev-parse --git-path specty` da esa carpeta más `specty`, y `common` está en la carpeta común, la misma para todas las worktrees. Si el archivo no se puede leer, se pregunta a git como hoy.
  - impacto: alto
- A3: Si el `Git` de la sesión y los de las demás carpetas comparten lo recordado, y lo olvidan juntos tras cualquier comando de git de cualquiera de ellos que pueda mover una ref, escribir la configuración o tocar las worktrees, el resultado con varias sesiones a la vez es el mismo que hoy: lo que cambie otro proceso sigue acotado por los 2 s, como ya acepta ARCHITECTURE §10.
  - impacto: medio
- A4: Basta con cambiar `locateChanges` (`flow/changes.ts`): es lo que lee todas las carpetas en `next`, `status`, las decisiones de la persona desde cualquier carpeta, la memoria, la limpieza, las épicas y el servidor, que se benefician sin tocar su código.
  - impacto: medio

## Criterios de aceptación

- AC1: CUANDO `specty status` desde la carpeta de un cambio, o `specty next` desde la carpeta principal, lee las carpetas de cambio abiertas ENTONCES git lista las worktrees una vez y no se ejecuta ni `symbolic-ref` ni `rev-parse --git-path`, y con tres carpetas de cambio abiertas lanzan los mismos procesos de git que con una.
- AC2: CUANDO se lee otra carpeta a partir del listado ENTONCES su HEAD, su rama (ninguna si está separada) y las rutas de `specty/` y `common/` de su carpeta de git son las que da git en esa carpeta, también en la principal; en una rama sin commits pregunta a git y da lo mismo que git.
- AC3: CUANDO el `Git` de una carpeta, o el de la sesión que lo dio, ejecuta un comando de git que puede mover una ref, escribir la configuración o tocar las worktrees, o lo olvida todo (`forget`, como el servidor en cada petición) ENTONCES la siguiente lectura de HEAD o de la rama de cualquier carpeta da la respuesta nueva.
- AC4: CUANDO se miden con `GIT_TRACE` `specty next` y `specty status` en una carpeta de cambio de este repositorio, con sus carpetas de cambio abiertas ENTONCES lanzan menos procesos de git que antes del cambio, y ARCHITECTURE §10 da las cifras de antes y después.
  - test: manual

## Diseño

- `io/git-memo.ts`: `recall` olvida por generación. `forget` sube un contador, y una respuesta guardada con otro ya no vale, así que varios `Git` comparten una memoria sin registrarse en ella ni retenerse. `headAnswer(args, head)` da lo que git respondería a las preguntas por HEAD y su rama, y `rememberHead` la usa.
- `io/git.ts`: `Worktree` lleva `head`, el commit de HEAD, cuando la rama tiene commits. `Git.inWorktree(folder)` da un `Git` para otra carpeta del listado que comparte lo recordado con el que lo da. Responde HEAD y su rama con el listado de ese `Git`, que se recuerda como cualquier lectura, `common/` con la ruta del que lo da y `specty/` con la carpeta de git que nombra el archivo `.git`; lo demás lo pregunta a git en esa carpeta.
- `flow/changes.ts`: `sessionIn` usa `session.git.inWorktree(folder)` en lugar de `createGit`.
- Docs: ARCHITECTURE §10, el párrafo de las lecturas recordadas, con las cifras medidas.

## Archivos

- modificar packages/cli/src/io/git-memo.ts — recordar por generación y la respuesta a las preguntas por HEAD
- modificar packages/cli/src/io/git.ts — HEAD en el listado y el `Git` de otra carpeta
- modificar packages/cli/src/flow/changes.ts — leer las demás carpetas con el `Git` de la sesión
- crear packages/cli/test/worktree-reads.test.ts — AC1, AC2 y AC3
- modificar docs/ARCHITECTURE.md — las lecturas de las demás carpetas y las cifras

## Tareas

- [x] T1: Las demás carpetas se leen con el listado de worktrees y comparten lo recordado
  - files: packages/cli/src/io/git-memo.ts, packages/cli/src/io/git.ts, packages/cli/src/flow/changes.ts, packages/cli/test/worktree-reads.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/worktree-reads.test.ts test/git-memo.test.ts test/git-paths.test.ts && pnpm typecheck
  - type: perf
- [x] T2: La documentación de las lecturas de las demás carpetas, con lo medido
  - files: docs/ARCHITECTURE.md
  - ac: AC4
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: Una carpeta cuyo archivo `.git` no sigue la forma habitual daría una ruta de `specty/` equivocada. Mitigación: AC2 compara con lo que responde git en la carpeta principal y en una worktree, y si el archivo no se lee se pregunta a git.
- R2: Compartir lo recordado hace que un comando que escribe en una carpeta olvide también lo de las demás, y vuelvan a preguntar. Mitigación: es lo que pide el resultado con varias sesiones, y cuesta un `worktree list`, no uno por carpeta.
