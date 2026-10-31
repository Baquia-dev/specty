---
kind: quick
---

# Regla para entrar en worktree con specty enter

## Objetivo

Fijar en el flujo de Specty (`flowBlock`) la regla explícita de que el agente debe entrar a la worktree con `specty enter <id>` y trabajar allí sin pedir abrir otra sesión ni alterar la configuración de ramas. Además, hacer imperativo el texto del SIGUIENTE de `specty new` eliminando la sugerencia que inducía al agente a detener su turno y pedir confirmación al usuario.

## Archivos

- modificar packages/core/src/agents-md.ts — regla explícita en flowLines para entrar con specty enter y no pedir otra sesión ni cambio de rama
- modificar packages/core/src/cards/new.ts — carryOnText directo e imperativo sin delegar en el agente la petición de otra sesión
- modificar docs/ARCHITECTURE.md — documentar la regla explícita de entrada a worktree en §10

## Tareas

- [ ] T1: Regla explícita de specty enter en flowLines y carryOnText imperativo
  - files: packages/core/src/agents-md.ts, packages/core/src/cards/new.ts, docs/ARCHITECTURE.md
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/agents-md.test.ts test/cards/new.test.ts
