---
kind: quick
---

# La terminal de los hooks tampoco es de la persona

## Objetivo

Desde «Una terminal de agente no es una persona», la terminal de la CLI solo cuenta como persona si es una TTY real y su entorno no delata a un agente (`personAtTerminal`). La terminal de los hooks (`specty guard` y `specty hook`) seguía mirando solo la TTY; ahora aplica la misma regla. Además, el entorno de los tests quita también `CODEX_CI` y `CODEX_THREAD_ID`, para que los tests no detecten a Codex cuando se ejecutan desde él, y ARCHITECTURE §6 dice que los comandos de la persona exigen una TTY sin el entorno de un agente.

## Archivos

- modificar packages/cli/src/enforce/entry.ts — la terminal de los hooks usa `personAtTerminal` con el entorno
- crear packages/cli/test/terminal.test.ts — tests de la terminal del sistema y de la de los hooks
- modificar packages/cli/test/support.ts — `testEnv` quita `CODEX_CI` y `CODEX_THREAD_ID`
- modificar docs/ARCHITECTURE.md — §6: TTY real sin el entorno de un agente

## Tareas

- [ ] T1: La terminal de los hooks aplica la misma regla que la de la CLI
  - files: packages/cli/src/enforce/entry.ts, packages/cli/test/terminal.test.ts, packages/cli/test/support.ts, docs/ARCHITECTURE.md
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/terminal.test.ts test/hooks-entry.test.ts && pnpm --filter @baquia-dev/specty typecheck
