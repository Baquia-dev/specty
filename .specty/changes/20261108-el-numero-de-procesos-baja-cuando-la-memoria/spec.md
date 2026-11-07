---
kind: standard
epic: 20261108-las-verificaciones-limitan-sus-procesos-segun-2
slice: C2
---

# El número de procesos baja cuando la memoria disponible no alcanza para más

## Objetivo

Desde C1, cada comando de una verificación recibe en las variables de `verify.processes.env` los núcleos que le tocan por sus plazas, aunque la máquina no tenga memoria para tantos procesos. Con este cambio, Specty mide la memoria disponible al arrancar cada comando y el número baja hasta los procesos de `verify.processes.memoryMiB` que caben en la parte de esa memoria que le toca por sus plazas, nunca menos de 1. En macOS mide como el Monitor de Actividad, con `vm_stat`. Es el corte C2 de la épica `20261108-las-verificaciones-limitan-sus-procesos-segun-2`: sus AC2 y AC5.

## Fuera de alcance

- La línea por la salida de error que dice el número, las variables, la memoria, los núcleos y las plazas (AC6 de la épica), que es de C3: aquí la memoria medida queda en `budgetedEnv`, donde C3 la dirá.
- Medir o recortar la memoria mientras el comando corre: se mide una vez, al arrancar cada comando.
- Cambiar los sitios que arrancan las verificaciones (`runLive`, `verify --fresh` y la verificación de la UI): ya pasan por `budgetedEnv` desde C1.
- Cambiar `verify.slots`, la prioridad, el turno de la verificación completa o el valor por defecto de `memoryMiB` (512).
- La entrada `verify.processes.env` de `.specty/config.yaml` de este repo, que añade la persona.

## Supuestos

- A1: El número es el menor entre los núcleos de la parte de plazas del comando (C1) y los procesos de `memoryMiB` que caben en esa misma parte de la memoria disponible: memoria × plazas / `verify.slots`, entre `memoryMiB` MiB (1 MiB = 1.048.576 bytes), redondeado hacia abajo y nunca menos de 1. Con la memoria medida hoy en esta máquina (7,25 GiB, 14 núcleos, 2 plazas), la completa sigue con 14 y la de una tarea con 7; con 6,73 GiB, 13 y 6; con 2 GiB, 4 y 2.
  - impacto: alto
- A2: En macOS, la memoria disponible son las páginas «Pages free», «File-backed pages» y «Pages purgeable» de `vm_stat`, por el tamaño de página de su cabecera («page size of N bytes»): 16384 bytes en Apple silicon y 4096 en Intel. Si falta una de esas cifras, `vm_stat` no arranca o sale con un código distinto de 0, Specty usa `process.availableMemory()`, como en Linux (`MemAvailable`, que respeta el límite del cgroup) y en Windows.
  - impacto: alto
- A3: `vm_stat` se ejecuta en la raíz del repositorio con el entorno de la sesión, como los demás comandos de Specty: así un test le pone delante un `vm_stat` propio en el `PATH`. Sin variables en `verify.processes.env`, Specty no mide la memoria ni ejecuta `vm_stat`.
  - impacto: medio
- A4: Los tests de C1 que esperan los núcleos de la máquina en las variables (`process-budget.test.ts` y `verify-processes.test.ts`) pasan a dar `memoryMiB: 1` en su configuración, para que la memoria de quien los ejecuta no cambie su número: con 1 MiB por proceso, solo bajaría con menos de 14 MiB disponibles.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO `verify.processes.env` nombra variables y la parte de la memoria disponible que toca a un comando por sus plazas no llega para un proceso de `verify.processes.memoryMiB` por cada uno de sus núcleos ENTONCES cada variable recibe los procesos que caben, redondeados hacia abajo, y 1 si no cabe ninguno.
- AC2: CUANDO Specty mide la memoria disponible en macOS ENTONCES suma las páginas libres, las de archivos y las purgables de `vm_stat` por su tamaño de página; en otro sistema, o si `vm_stat` falla o no da esas cifras, usa `process.availableMemory()`.

## Diseño

- CLI, `io/memory.ts` (nuevo): `vmStatMemory(output)`, el lector puro de la salida de `vm_stat`, que da los bytes o `undefined` si falta una cifra, y `availableMemory(cwd, env, platform = process.platform)`, asíncrona: en `darwin`, ejecuta `vm_stat` con `execute` y lo lee; si no es `darwin`, si el comando no sale con 0 o si el lector no da cifra, `process.availableMemory()`.
- CLI, `flow/process-budget.ts`: `processBudget` recibe también `memory` (bytes disponibles) y `memoryMiB`, y da el menor de los dos números de A1. `budgetedEnv`, tras comprobar que hay variables, mide `memory` con `availableMemory(session.root, env)` y los núcleos con `availableParallelism()` en sus propias constantes, para que C3 diga con ellas su línea.
- Tests: `cli/test/memory.test.ts` (nuevo: AC2, con salidas reales de `vm_stat`, un `vm_stat` falso en el `PATH` y `process.availableMemory` simulado, y el `vm_stat` real cuando corre en macOS), `cli/test/process-budget.test.ts` (el cálculo de AC1 con memoria y `budgetedEnv` con un `memoryMiB` que no cabe) y `cli/test/verify-processes.test.ts` (AC1 de punta a punta con `verify --fresh`).

## Archivos

- crear packages/cli/src/io/memory.ts — la memoria disponible: el lector de `vm_stat` y la medida de cada sistema
- crear packages/cli/test/memory.test.ts — el lector de `vm_stat` y la medida en macOS y en los demás sistemas
- modificar packages/cli/src/flow/process-budget.ts — el número baja por la memoria disponible, medida al arrancar cada comando
- modificar packages/cli/test/process-budget.test.ts — el cálculo con memoria y el entorno con un `memoryMiB` que no cabe; los tests de C1, con `memoryMiB: 1`
- modificar packages/cli/test/verify-processes.test.ts — `verify --fresh` con un `memoryMiB` que no cabe; los tests de C1, con `memoryMiB: 1`
- modificar docs/formats.md — §6: `memoryMiB` ya baja el número, y cómo se mide la memoria
- modificar docs/dominio.md — los procesos de una verificación cuentan también la memoria

## Tareas

- [x] T1: La memoria disponible, con el lector de `vm_stat` en macOS y `process.availableMemory()` en los demás
  - files: packages/cli/src/io/memory.ts, packages/cli/test/memory.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/memory.test.ts && pnpm lint
- [x] T2: El número de procesos baja por la memoria disponible de sus plazas, y la documentación lo explica
  - files: packages/cli/src/flow/process-budget.ts, packages/cli/test/process-budget.test.ts, packages/cli/test/verify-processes.test.ts, docs/formats.md, docs/dominio.md
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/process-budget.test.ts test/verify-processes.test.ts test/memory.test.ts && pnpm typecheck && pnpm lint && pnpm knip

## Riesgos

- R1: `vm_stat` tarda o falla en una máquina — es una lectura instantánea del kernel; si falla, el número sale de `process.availableMemory()`, y sin variables en `verify.processes.env` no se ejecuta.
- R2: Con la máquina en swap, la verificación de una tarea baja a 1 o 2 procesos y tarda más — es lo que pide la épica; C3 dirá el número y la memoria, y `memoryMiB` lo ajusta.
- R3: Otro subagente cambia en paralelo `specty next`, `status` e `io/git*.ts` — este cambio no los toca, y al incorporar main `specty integrate` conserva lo de los dos.
