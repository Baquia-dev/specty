---
kind: standard
---

# Specty pregunta a git una vez por cada ruta de su carpeta

## Objetivo

Cada comando de Specty pregunta a git dónde está cada uno de sus archivos con un proceso nuevo, `git rev-parse --git-path <ruta>`, aunque ya lo preguntara: en dos tests del CLI, 100 de los 350 procesos de git eran esas preguntas, 41 de ellos por la misma ruta (`specty/retro`). Cada proceso son milisegundos de CPU, y la suite del CLI lanza cientos de miles en cada verificación completa. Además, los repositorios de los tests lanzan `git maintenance run --auto` tras cada commit. Con este cambio, cada comando pregunta a git una sola vez por la carpeta `specty/` de su worktree y otra por la común (`common/`), y los repositorios de los tests no lanzan el mantenimiento automático.

## Fuera de alcance

- Recordar la rama, las worktrees o la configuración de git dentro de un comando: un comando puede cambiarlas (`new`, `close`), y recordarlas pediría invalidarlas.
- Agrupar en un proceso varias consultas distintas de git.

## Supuestos

- A1: Git guarda toda ruta bajo `specty/` en la carpeta de git de la worktree, y toda ruta bajo `common/` en la carpeta común (`common` está en la lista de rutas comunes de git), así que la ruta de `specty/a/b` es la de `specty` seguida de `/a/b`. Comprobado con git 2.50 en una worktree y en el checkout principal.
  - impacto: alto
- A2: La carpeta de git de un `Git` no cambia durante su vida: cada uno está atado a la raíz de su carpeta, y una worktree nueva tiene su propio `Git`.
  - impacto: alto
- A3: Una ruta de otra carpeta de git (`info/exclude`, los hooks) se pregunta una vez y se recuerda igual; si la pregunta falla, no se recuerda.
- A4: `maintenance.auto=false` y `gc.auto=0` en el entorno de git de los tests no cambian lo que comprueba ningún test.

## Criterios de aceptación

- AC1: CUANDO un `Git` da varias rutas bajo `specty/` y bajo `common/` ENTONCES pregunta a git una sola vez por cada una de esas dos carpetas.
- AC2: CUANDO un `Git` da una ruta, en el checkout principal o en una worktree, bajo `specty/`, bajo `common/` u otra ENTONCES es la misma que da `git rev-parse --git-path` con la ruta entera.
- AC3: CUANDO un test hace un commit en su repositorio ENTONCES git no lanza `git maintenance run --auto`.

## Diseño

- `cli/io/git.ts`: `gitPath` sale de `gitPaths(runner, root)`, que recuerda en un `Map` la respuesta de cada pregunta (sin las que fallan). Una ruta cuyo primer tramo es `specty` o `common` se arma con la respuesta para ese tramo y el resto unido con `/`, antes de resolverla contra la raíz si git la dio relativa, como hoy; las demás se preguntan enteras.
- `cli/test/support.ts`: `GIT_ENV` añade `GIT_CONFIG_COUNT` con `maintenance.auto=false` y `gc.auto=0`.

## Archivos

- modificar packages/cli/src/io/git.ts — recordar las rutas de git
- crear packages/cli/test/git-paths.test.ts — AC1, AC2 y AC3
- modificar packages/cli/test/support.ts — sin mantenimiento automático en los tests
- modificar docs/ARCHITECTURE.md — las rutas de git que recuerda cada comando

## Tareas

- [x] T1: Cada Git pregunta a git una vez por la carpeta specty/ y otra por la común
  - files: packages/cli/src/io/git.ts, packages/cli/test/git-paths.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/git-paths.test.ts test/lock.test.ts test/delegate.test.ts && pnpm --filter @baquia-dev/specty typecheck
  - type: perf
- [x] T2: Los repositorios de los tests no lanzan el mantenimiento automático de git
  - files: packages/cli/test/support.ts, packages/cli/test/git-paths.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/git-paths.test.ts test/reuse.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: perf
- [ ] T3: La documentación de las rutas de git que recuerda cada comando
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm lint
  - type: docs
