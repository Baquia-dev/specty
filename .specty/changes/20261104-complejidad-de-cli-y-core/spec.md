---
kind: standard
---

# Las funciones demasiado complejas del CLI y de core, simplificadas

## Objetivo

Resuelve, en parte, P61. `specty check --all` falla en `complexity` (máximo 10) con seis funciones del CLI y de core: `scopeAdd` (11), `guard` (12), `guardContext` (13), `push` de la CI de GitHub (12), `newRefusalNext` (11) y `leadingOptions` (13). Este cambio las simplifica sacando a funciones con nombre las decisiones que mezclan, sin cambiar lo que hacen. Las de `exporters` y `vscode`, con la función larga de la UI (P60), van en el cambio siguiente, porque juntas pasarían de tres módulos.

## Fuera de alcance

- `clausesOf` (exporters) y `changesView` (vscode): el cambio siguiente.
- Cambiar lo que hacen estas funciones: los tests que ya existen son el contrato y no cambian.

## Supuestos

- A1: Basta con extraer funciones dentro de cada archivo, sin archivos nuevos; los tests que ya existen cubren lo que se mueve, porque ejecutan el CLI o la API pública de core.

## Criterios de aceptación

- AC1: CUANDO se ejecuta `specty check --all` con el CLI construido sobre este cambio ENTONCES `complexity` ya no señala ninguna de las seis funciones, ni las funciones nuevas.
  - test: manual
- AC2: CUANDO se ejecuta `pnpm check` ENTONCES pasa sin cambiar ningún test que ya existía.
  - test: manual

## Diseño

- `scopeAdd`: la tarea a la que se pide, la de `--task` o la activa, sale a `requestedTask(state, option)`.
- `guard`: el evento con su nombre y normalizado sale a `eventOf(agent, parsed, named)`, y el texto del error a `messageOf(error)`.
- `guardContext`: el `GuardChange` del cambio activo sale a `guardChange(session, active)`, con lo que ya calcula.
- `push`: la base del push, por el commit anterior o la rama por defecto del repositorio, sale a `pushBase(payload)`.
- `newRefusalNext`: el caso `in-progress` sale a `inProgressNext(refusal, t, command)`.
- `leadingOptions`: las opciones globales de git con valor van en un conjunto, y su valor se lee una vez.

## Archivos

- modificar packages/cli/src/commands/scope.ts — requestedTask
- modificar packages/cli/src/enforce/guard.ts — eventOf, messageOf y guardChange
- modificar packages/cli/src/flow/ci-github.ts — pushBase
- modificar packages/core/src/cards/new.ts — inProgressNext
- modificar packages/core/src/guard/git.ts — leadingOptions con un conjunto de opciones con valor

## Tareas

- [ ] T1: Las funciones complejas del CLI, simplificadas
  - files: packages/cli/src/commands/scope.ts, packages/cli/src/enforce/guard.ts, packages/cli/src/flow/ci-github.ts
  - ac: AC1, AC2
  - verify: pnpm typecheck && pnpm lint && pnpm knip && pnpm --filter @baquia-dev/specty exec vitest run test/commands.test.ts test/flow.test.ts test/delegate.test.ts test/ci-github.test.ts test/ci.test.ts test/front-guard.test.ts test/memory-guard.test.ts test/test-locks.test.ts test/antigravity-turn.test.ts
  - type: refactor
- [ ] T2: Las funciones complejas de core, simplificadas
  - files: packages/core/src/cards/new.ts, packages/core/src/guard/git.ts
  - ac: AC1, AC2
  - verify: pnpm typecheck && pnpm lint && pnpm --filter @baquia-dev/specty-core exec vitest run test/guard test/cards/new.test.ts
  - type: refactor
