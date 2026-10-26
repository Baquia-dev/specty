---
kind: standard
follows:
  - 20261025-los-textos-de-ui-export-delegate-why-y-audit-viv
---

# Los textos del servidor y de los hooks viven en core

## Objetivo

Decimocuarto cambio de la serie que lleva a core los textos de la CLI. Aún arman los suyos:

- el servidor de `specty ui`: los rechazos y el arranque de la verificación completa, los rechazos de aprobar desde la UI, la página de la UI sin construir y «No hay un cambio activo»;
- los hooks: por qué el hook de las worktrees de Claude Code no crea o no borra una, y la línea del pre-commit cuando el commit no pasa `specty check --staged`.

Pasan a un `cards/server.ts` nuevo y a `cards/hooks.ts`, junto al mensaje del commit bloqueado. El servidor usa la tarjeta común de «No hay un cambio activo». La salida no cambia ni una letra.

## Fuera de alcance

- Qué hacen el servidor y los hooks: solo cambia dónde viven sus textos.
- Los textos de `check`, que llegan en el siguiente cambio de la serie.

## Supuestos

- A1: Los hooks importan core como ya lo hacen: el bundle de los hooks no cambia de partes (ARCHITECTURE §10).

## Criterios de aceptación

- AC1: CUANDO la UI pide la verificación completa o aprobar la spec y el servidor lo rechaza, o la verificación arranca, o la UI no está construida ENTONCES la respuesta es la misma que antes y sale de `cards/server.ts` de core.
- AC2: CUANDO el hook de las worktrees se niega a crear o borrar una, o el pre-commit falla por `specty check --staged` ENTONCES el mensaje es el mismo que antes y sale de `cards/hooks.ts` de core.
- AC3: CUANDO se ejecutan los tests de core ENTONCES cubren cada texto, en español y en inglés.

## Archivos

- crear packages/core/src/cards/server.ts — los textos del servidor de la UI
- modificar packages/core/src/cards/hooks.ts — los textos de los hooks de las worktrees y del pre-commit
- modificar packages/core/src/cards/index.ts — exportarlos
- crear packages/core/test/cards/server.test.ts — sus tests
- modificar packages/cli/src/server/runs.ts — pedir sus textos a core
- modificar packages/cli/src/server/actions.ts — pedir sus textos a core
- modificar packages/cli/src/server/http.ts — la página de la UI sin construir, desde core
- modificar packages/cli/src/enforce/worktree-hooks.ts — pedir sus textos a core
- modificar packages/cli/src/enforce/hook.ts — la línea del pre-commit, desde core

## Tareas

- [x] T1: Core tiene los textos del servidor y de los hooks
  - files: packages/core/src/cards/server.ts, packages/core/src/cards/hooks.ts, packages/core/src/cards/index.ts, packages/core/test/cards/server.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-core typecheck && pnpm --filter @baquia-dev/specty-core test
  - type: refactor
- [ ] T2: El servidor y los hooks piden sus textos a core
  - files: packages/cli/src/server/runs.ts, packages/cli/src/server/actions.ts, packages/cli/src/server/http.ts, packages/cli/src/enforce/worktree-hooks.ts, packages/cli/src/enforce/hook.ts
  - ac: AC1, AC2
  - verify: pnpm check
  - type: refactor
