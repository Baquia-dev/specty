---
kind: quick
---

# El cierre no aconseja una sesión nueva cuando los cambios van a subagentes

## Objetivo

Cuando Claude Code reparte en subagentes y `subagents` no es `false`, el cierre y la aceptación de un quick dejan de decir «Para el siguiente cambio conviene una sesión nueva…»: el siguiente cambio ya arranca en un subagente limpio, y el contexto que se mide es el de la sesión principal, que solo coordina. Sin subagentes (`subagents: false`), el aviso sigue como hoy; la línea de consumo de ccusage no cambia.

## Archivos

- modificar packages/cli/src/flow/usage.ts — el aviso no lee el contexto cuando Claude Code reparte los cambios en subagentes
- modificar packages/core/src/cards/index.ts — exportar `toSubagents`, que usa la CLI
- modificar packages/cli/test/fresh-session.test.ts — el aviso con `subagents: false` y su silencio con subagentes
- modificar docs/ARCHITECTURE.md — §13 y §16: el aviso se calla cuando los cambios van a subagentes
- modificar docs/formats.md — §6, `subagents`: también deja callado el aviso de sesión nueva

## Tareas

- [ ] T1: Callar el aviso de sesión nueva cuando los cambios van a subagentes
  - files: packages/cli/src/flow/usage.ts, packages/core/src/cards/index.ts, packages/cli/test/fresh-session.test.ts, docs/ARCHITECTURE.md, docs/formats.md
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/fresh-session.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: fix
