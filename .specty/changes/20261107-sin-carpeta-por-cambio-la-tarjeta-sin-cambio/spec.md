---
kind: quick
---

# Sin carpeta por cambio, la tarjeta sin cambio activo pide new en la propia sesión

## Objetivo

Con `git.worktrees: false` o `git.branchPerChange: false`, `specty new` crea cada cambio en la carpeta en la que se ejecuta, así que el encargo de la tarjeta sin cambio activo falla (P263): `new --subagent` deja el cambio en la carpeta principal, `specty enter` no le encuentra carpeta y el `new` de un segundo subagente se rechaza (`in-progress`) mientras el primero sigue abierto. Con esa configuración, la tarjeta sin cambio activo es la de `subagents: false`: pide `specty new` en la propia sesión. La CLI lo dice a las tarjetas con un dato nuevo de `CardContext`, `changeFolders: false`, que `sessionFrom` pone cuando `new` no da carpeta propia a cada cambio. Los cambios huérfanos que lista la tarjeta siguen con su «ENCARGO PARA RETOMAR», porque viven en su propia carpeta (los de la carpeta principal son su cambio activo, no salen ahí), y la tarjeta de una épica no cambia: con `git.worktrees: false` el `new` de un corte en la carpeta de la épica se rechaza igual, con o sin subagentes, así que pedirlo en la sesión no lo arreglaría; queda como pendiente aparte.

## Archivos

- modificar packages/core/src/cards/view.ts — `CardContext.changeFolders`: `false` cuando `new` no da carpeta propia a cada cambio
- modificar packages/core/src/cards/idle.ts — sin carpeta por cambio, la tarjeta sin cambio activo no reparte en subagentes
- modificar packages/cli/src/session.ts — `sessionFrom` pone `changeFolders: false` con `git.worktrees: false` o `git.branchPerChange: false`
- modificar packages/core/test/cards/idle-subagents.test.ts — con `changeFolders: false`, la tarjeta es la de `subagents: false`
- modificar packages/cli/test/front-start.test.ts — el guard y `next` piden `specty new` en la sesión sin carpeta por cambio; el test del encargo usa una configuración con carpeta por cambio
- modificar packages/cli/test/front-start-codex.test.ts — el test del encargo en Codex usa una configuración con carpeta por cambio
- modificar docs/formats.md — §6: `subagents` y `git.worktrees` dicen que sin carpeta por cambio los cambios que pide el usuario no van a subagentes
- modificar docs/ARCHITECTURE.md — §7, «Tarjeta sin cambio activo»: la condición incluye la carpeta por cambio

## Tareas

- [x] T1: Sin carpeta por cambio, la tarjeta sin cambio activo pide new en la propia sesión
  - files: packages/core/src/cards/view.ts, packages/core/src/cards/idle.ts, packages/cli/src/session.ts, packages/core/test/cards/idle-subagents.test.ts, packages/cli/test/front-start.test.ts, packages/cli/test/front-start-codex.test.ts, docs/formats.md, docs/ARCHITECTURE.md
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/front-start.test.ts test/front-start-codex.test.ts && pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/idle-subagents.test.ts && pnpm typecheck && pnpm lint
  - type: fix
