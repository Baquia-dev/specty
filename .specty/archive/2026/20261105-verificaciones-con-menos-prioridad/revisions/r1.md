---
kind: standard
---

# Los comandos de verificación corren con menos prioridad

## Objetivo

Las verificaciones que lanza Specty (la de cada tarea, la completa y la de una incorporación) corren con la misma prioridad que el editor, los agentes y el resto de la máquina, y mientras corre una suite el resto va a tirones: la terminal, el guard de cada sesión y la propia persona esperan a la CPU. Con este cambio, Specty baja la prioridad del comando de cada verificación nada más lanzarlo, y los procesos que ese comando lanza la heredan: la verificación usa la CPU que sobra, y lo interactivo va primero.

## Fuera de alcance

- Limitar los procesos que lanza cada verificación (los workers de Vitest, `-j` de make): depende de cada herramienta.
- Cambiar la prioridad de git y del resto de comandos que lanza Specty (`specty check`, `review`, `git.setup`, `git.afterLanding`).
- Una clave de la configuración para elegir la prioridad: 10 basta para ceder la CPU sin dejar la verificación sin ella.

## Supuestos

- A1: Bajar la prioridad es `os.setPriority(pid, 10)` sobre el proceso del comando nada más lanzarlo, también en Windows, donde Node la traduce a «por debajo de lo normal»; los procesos que lance después la heredan. Uno que el comando lanzara antes de bajarla la conservaría: es de mejor esfuerzo.
  - impacto: alto
- A2: Si el sistema no deja bajarla, el comando corre igual, con la prioridad que tenga.
- A3: Con menos prioridad, una verificación no tarda más en una máquina libre: solo cede la CPU cuando otro proceso la pide.

## Criterios de aceptación

- AC1: CUANDO Specty lanza un comando con menos prioridad ENTONCES corre con prioridad 10, y un proceso que ese comando lanza después también; sin pedirlo, con la de Specty.
- AC2: CUANDO Specty ejecuta la verificación de una tarea ENTONCES su comando corre con prioridad 10.
- AC3: CUANDO `accept` ejecuta la verificación completa ENTONCES su comando corre con prioridad 10.

## Diseño

- `cli/io/exec.ts`: `lowPriority` en `ExecOptions`; tras `spawn`, `setPriority(child.pid, 10)` dentro de un `try`.
- `cli/flow/live-run.ts` (la de una tarea, la completa de `accept` y la que comprueba los tests en rojo), `cli/flow/integrate.ts` y `cli/commands/integrate.ts` (la de una incorporación) y `cli/server/runs.ts` (la que lanza la UI) la piden.

## Archivos

- modificar packages/cli/src/io/exec.ts — menos prioridad
- modificar packages/cli/test/exec.test.ts — AC1
- modificar packages/cli/src/flow/live-run.ts — la piden la de una tarea y la completa
- modificar packages/cli/src/flow/integrate.ts — la pide la de una incorporación
- modificar packages/cli/src/commands/integrate.ts — la pide la de `specty integrate`
- modificar packages/cli/src/server/runs.ts — la pide la que lanza la UI
- crear packages/cli/test/verify-priority.test.ts — AC2 y AC3
- modificar docs/ARCHITECTURE.md — la prioridad de las verificaciones

## Tareas

- [ ] T1: execute puede lanzar un comando con menos prioridad
  - files: packages/cli/src/io/exec.ts, packages/cli/test/exec.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/exec.test.ts && pnpm --filter @baquia-dev/specty typecheck
  - type: perf
- [ ] T2: Las verificaciones de Specty corren con menos prioridad
  - files: packages/cli/src/flow/live-run.ts, packages/cli/src/flow/integrate.ts, packages/cli/src/commands/integrate.ts, packages/cli/src/server/runs.ts, packages/cli/test/verify-priority.test.ts
  - ac: AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/verify-priority.test.ts test/accept-live.test.ts test/live-run.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: perf
- [ ] T3: La documentación de la prioridad de las verificaciones
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm lint
  - type: docs
