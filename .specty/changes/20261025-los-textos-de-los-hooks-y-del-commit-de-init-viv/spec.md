---
kind: standard
follows:
  - 20261025-los-textos-de-init-y-sus-plantillas-viven-en-cor
---

# Los textos de los hooks y del commit de init viven en core

## Objetivo

Séptimo cambio de la serie que lleva a core los textos de la CLI, con lo que quedaba de `init`. Al instalar los hooks, `install/hooks.ts` arma en la CLI lo que dice del guard de cada herramienta y de los hooks de git, y sus avisos. `install/commit.ts` hace lo mismo con los avisos del commit de `init`, su asunto y la línea que lo nombra. Pasan a `core/src/cards/install.ts`, con tests. La salida y el commit de `init` no cambian ni una letra.

## Fuera de alcance

- Los textos de `doctor`, `uninstall` y los demás comandos, que llegan en los siguientes cambios de la serie.
- Cambiar cualquier texto: se mueven tal cual.

## Supuestos

- A1: Los nombres de las herramientas (Claude Code, Cursor) no se traducen, así que una sola línea con el nombre como parámetro sirve para las dos cuyos hooks viven en el repositorio.

## Criterios de aceptación

- AC1: CUANDO `specty init` instala el guard de cada herramienta y los hooks de git ENTONCES lo que dice, y sus avisos (Codex sin confianza, herramientas sin hooks, gestor de hooks a mano, comando fuera del PATH), son los mismos que antes y salen de core.
- AC2: CUANDO `specty init` hace su commit, o no lo hace por un cambio en curso o por archivos con cambios de la persona ENTONCES el asunto, la línea del commit y los avisos son los mismos que antes y salen de core.
- AC3: CUANDO se ejecutan los tests de core ENTONCES cubren cada texto, en español y en inglés.

## Archivos

- crear packages/core/src/cards/install.ts — los textos de los hooks y del commit de init
- modificar packages/core/src/cards/index.ts — exportarlos
- crear packages/core/test/cards/install.test.ts — sus tests
- modificar packages/cli/src/install/hooks.ts — pedir sus textos a core
- modificar packages/cli/src/install/commit.ts — pedir sus textos a core

## Tareas

- [x] T1: Core tiene los textos de los hooks y del commit de init
  - files: packages/core/src/cards/install.ts, packages/core/src/cards/index.ts, packages/core/test/cards/install.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-core typecheck && pnpm --filter @baquia-dev/specty-core test
  - type: refactor
- [x] T2: Los hooks y el commit de init piden sus textos a core
  - files: packages/cli/src/install/hooks.ts, packages/cli/src/install/commit.ts
  - ac: AC1, AC2
  - verify: pnpm check
  - type: refactor
