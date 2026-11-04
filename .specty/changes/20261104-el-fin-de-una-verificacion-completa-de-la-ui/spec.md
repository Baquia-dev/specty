---
kind: quick
---

# El fin de una verificación completa de la UI llega con su turno ya libre

## Objetivo

Resuelve P84. Hoy el servidor de `specty ui` avisa del fin de una verificación completa (`heard(id, undefined)`) desde dentro de la ejecución, antes de que `oneAtATime` suelte su turno (`.git/common/specty/locks/full-verification.json`): quien oye el aviso aún encuentra el turno ocupado, y el test «AC2: frees the turn when it ends» de `runs-turn.test.ts` falla a veces con la máquina cargada. Con este cambio, el aviso de fin sale después de soltar el turno, y el test comprueba que el turno ya está libre en el momento mismo del aviso.

## Archivos

- modificar packages/cli/src/server/runs.ts — el aviso de fin de la verificación completa sale tras soltar su turno
- modificar packages/cli/test/server/runs-turn.test.ts — AC2 comprueba que el turno ya está libre en el momento del aviso de fin

## Tareas

- [ ] T1: El aviso de fin de una verificación completa de la UI llega con su turno ya libre
  - files: packages/cli/src/server/runs.ts, packages/cli/test/server/runs-turn.test.ts
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server/runs-turn.test.ts test/server/runs.test.ts && pnpm typecheck && pnpm lint
  - type: fix
