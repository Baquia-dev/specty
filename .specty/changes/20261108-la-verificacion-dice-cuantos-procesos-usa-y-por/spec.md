---
kind: standard
epic: 20261108-las-verificaciones-limitan-sus-procesos-segun-2
slice: C3
---

# La verificación dice cuántos procesos usa y por qué

## Objetivo

Desde C1 y C2, cada comando de una verificación recibe en las variables de `verify.processes.env` cuántos procesos puede lanzar, según sus núcleos, sus plazas y la memoria disponible, pero nadie lo ve: una suite que tarda más no dice por qué. Con este cambio, cada comando de verificación dice al arrancar, en una línea por la salida de error, el número, las variables que lo reciben, la memoria disponible, los núcleos y las plazas que ocupa.

## Fuera de alcance

- Mostrar la línea en la salida en vivo de la UI o del MCP App, o guardarla en el registro de auditoría: sale solo por la salida de error de Specty.
- Cambiar el cálculo del número o la medida de la memoria, que hicieron C1 y C2.
- Añadir o cambiar `verify.processes` en `.specty/config.yaml` de este repositorio: lo decide la persona.

## Supuestos

- A1: La línea sale una vez por comando de verificación, justo al calcular su número, por la salida de error de la sesión (`session.environment.io.err`), como la de `verifyingNote`: el agente la ve en `specty task done` y en la comprobación de los tests en rojo, la persona en `accept`, `integrate` y `specty verify --fresh`, una por unidad; la completa que arranca la UI la dice en la terminal de `specty ui`.
  - impacto: medio
- A2: La memoria disponible va en GB con un decimal, de 1024³ bytes, como la muestra el Monitor de Actividad, con coma decimal en español y punto en inglés: los 6,73 GiB de la épica salen «6,7 GB».
- A3: Las plazas que ocupa son las mismas con las que se calcula el número: 1 la de una tarea y todas las de `verify.slots` la completa, sus unidades y `verify --fresh`; la línea dice «1 de 2 plazas» o «2 de 2 plazas».
- A4: Una variable que se queda con el entero positivo menor que ya traía en el entorno no recibe el número, así que la línea la nombra aparte con su valor, para no decir de ella un número que no recibe.

## Criterios de aceptación

- AC1: CUANDO `verify.processes.env` nombra variables y arranca un comando de verificación (el de una tarea, el de la completa, el de cada una de sus unidades o el de `specty verify --fresh`) ENTONCES sale por la salida de error una línea con el número, las variables que lo reciben, la memoria disponible en GB con un decimal, los núcleos y las plazas que ocupa de `verify.slots`, en español o en inglés según el idioma de Specty.
- AC2: CUANDO una de esas variables se queda con el entero positivo menor que ya traía en el entorno ENTONCES la línea la nombra aparte, con ese valor, como el de su entorno.
- AC3: CUANDO la configuración no tiene variables en `verify.processes.env` ENTONCES ningún comando de verificación dice la línea.

## Diseño

- Core, `cards/processes.ts` (nuevo): `ProcessBudgetView` (`budget`, el número; `variables`, cada una con su `name` y el `value` que recibe; `memory`, los bytes disponibles; `cores`; `places`, las que ocupa; `slots`) y `processBudgetNote(view, lang)`, con el prefijo `specty:` de `verifyingNote`. En español: `specty: 6 procesos en VITEST_MAX_WORKERS (6,7 GB de memoria disponible, 14 núcleos, 1 de 2 plazas)`; en inglés: `specty: 6 processes in VITEST_MAX_WORKERS (6.7 GB of memory available, 14 cores, 1 of 2 places)`. Las variables que reciben el número van separadas por comas y la última con «y» / «and»; las que se quedan con lo suyo, tras un punto y coma: `; se queda con el de su entorno: PROCESOS_A=1` / `; keeps its environment's: PROCESOS_A=1`, y con varias `se quedan con el de su entorno` / `keep their environment's`. Si ninguna recibe el número, la línea dice solo el número antes del punto y coma. Singular y plural con `counted` («1 proceso», «1 núcleo», «1 de 1 plaza»).
- Core, `cards/index.ts`: exporta `processBudgetNote` y `ProcessBudgetView`, que la CLI importa de `@baquia-dev/specty-core`.
- CLI, `flow/process-budget.ts`: las plazas que ocupa un comando (`Math.min(Math.max(places, 1), slots)`) pasan a una función propia que usan `processBudget` y la línea; `budgetedEnv` calcula el valor de cada variable, dice la línea con `session.environment.io.err(processBudgetNote(…, session.lang))` y devuelve el entorno como hasta ahora. Sin variables, ni mide ni dice nada.
- Tests: `core/test/cards/processes.test.ts` (nuevo: la línea en los dos idiomas, con una y varias variables, con las que se quedan con lo suyo, el singular y los GB), `cli/test/process-budget.test.ts` (`budgetedEnv` dice la línea con el número, la memoria y las plazas de una tarea y de la completa, y no la dice sin variables) y `cli/test/verify-processes.test.ts` (la línea de punta a punta en `task done` y `verify --fresh`, y su ausencia sin variables).

## Archivos

- crear packages/core/src/cards/processes.ts — la línea de los procesos de un comando de verificación, en español y en inglés
- modificar packages/core/src/cards/index.ts — exporta `processBudgetNote` y `ProcessBudgetView`
- crear packages/core/test/cards/processes.test.ts — la línea en los dos idiomas, con sus variables, la memoria, los núcleos y las plazas
- modificar packages/cli/src/flow/process-budget.ts — `budgetedEnv` dice la línea por la salida de error al calcular el número
- modificar packages/cli/test/process-budget.test.ts — `budgetedEnv` dice la línea con variables y no la dice sin ellas
- modificar packages/cli/test/verify-processes.test.ts — la línea de punta a punta en `task done` y `verify --fresh`, y su ausencia sin variables
- modificar docs/formats.md — §6: cada comando de verificación dice su número en una línea

## Tareas

- [x] T1: La línea de los procesos, en español y en inglés
  - files: packages/core/src/cards/processes.ts, packages/core/src/cards/index.ts, packages/core/test/cards/processes.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/processes.test.ts && pnpm lint
- [ ] T2: Cada comando de verificación dice la línea al calcular su número, y la documentación lo explica
  - files: packages/cli/src/flow/process-budget.ts, packages/cli/test/process-budget.test.ts, packages/cli/test/verify-processes.test.ts, docs/formats.md
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/process-budget.test.ts test/verify-processes.test.ts && pnpm typecheck && pnpm lint && pnpm knip

## Riesgos

- R1: Una verificación completa con varias unidades dice una línea por unidad — es una por comando, como pide AC6 de la épica, y cada una dice la memoria del momento en que arranca.
- R2: Un test que compare entera la salida de error de una verificación con `verify.processes.env` — solo los de C1, C2 y este cambio configuran esas variables, y comprueban la salida con `toContain` o la ignoran.
