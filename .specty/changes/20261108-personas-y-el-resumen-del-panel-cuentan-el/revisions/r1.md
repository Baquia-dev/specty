---
kind: standard
epic: 20261108-panel-titulos-y-sesiones
slice: C3
---

# Personas y el resumen del panel cuentan el periodo con el mismo código

## Objetivo

En el core del panel, `people.ts` (`rowOf`) repite cómo `summary.ts` (`countsOf`) cuenta el ciclo, las verificaciones y el coste de un periodo, y su orden por cambios repite el de `optionsOf` (P328). Con este cambio los dos lo hacen con el mismo código, de un módulo del core, sin que cambie ninguna cifra del panel ni de `specty stats`: si una regla de conteo cambia, cambia a la vez en el resumen y en «Personas y agentes».

## Fuera de alcance

- Las sesiones de «Personas y agentes»: solo las cuenta esa tabla, y siguen en `people.ts`.
- Los pendientes del resumen: solo los cuenta el resumen, y siguen en `summary.ts`.
- Qué cambios viven en el periodo (`lived`), que también calculan otras secciones: no es parte de P328.
- Los títulos de las listas del panel: los hace C2 de la épica.

## Supuestos

- A1: Un módulo nuevo, `packages/core/src/stats/counts.ts`, da lo que unos cambios hicieron en un periodo (cerrados, tareas, ciclo, verificaciones, parte que pasa, coste y en cuántos cambios se midió) y agrupa los cambios por persona, agente y modelo en el orden de «Ver por». `summary.ts` y `people.ts` lo usan; ninguno de los dos cambia lo que exporta.
  - impacto: medio
- A2: El coste de una fila de «Personas y agentes» pasa a sumarse por cambio y luego entre cambios, como el del resumen; antes sumaba todas las líneas de una vez. El total es el mismo salvo el redondeo de coma flotante en las últimas cifras decimales, que el panel y `specty stats` no muestran (enseñan dos decimales) y que los tests actuales no ven.
- A3: La lista de tipos de «Ver por» (`person`, `agent` y `model`) queda en un solo sitio: `period.ts` la exporta y la usan `statsQuery` y el módulo nuevo, en vez de las tres copias de hoy.

## Criterios de aceptación

- AC1: CUANDO el core calcula «Personas y agentes» y el resumen del periodo ENTONCES cuenta el ciclo, las verificaciones y el coste con el mismo código, y ordena por cambios con el mismo criterio, sin que cambie ninguna cifra.

## Diseño

- `counts.ts` exporta `periodCounts(rows, range)`, el cuerpo de hoy de `countsOf` sin los pendientes, y `perWho(rows, make)`, que agrupa `rows` por cada tipo de «Ver por» (el nombre vacío es «(sin dato)»), llama a `make(who, suyos)` con cada grupo y ordena lo que da como hoy: por tipo, los de más cambios primero, luego por nombre, y «(sin dato)» al final de su tipo.
- `summary.ts`: `countsOf` es `periodCounts` más los pendientes abiertos al final del periodo, y `options` es `perWho(rows, …)` con cuántos cambios tiene cada uno.
- `people.ts`: `statsPeople` es `perWho` sobre los cambios que viven en el periodo, y `rowOf` toma de `periodCounts` las tareas, el ciclo, las verificaciones y el coste, y sigue contando sus sesiones.
- Los tests que ya existen son el contrato: no se tocan (`policy.tests: contract`, tarea `refactor`).

## Archivos

- crear packages/core/src/stats/counts.ts — el conteo de un periodo y el orden por persona, agente y modelo, compartidos
- modificar packages/core/src/stats/summary.ts — `countsOf` y las opciones de «Ver por» usan `counts.ts`
- modificar packages/core/src/stats/people.ts — «Personas y agentes» cuenta y ordena con `counts.ts`
- modificar packages/core/src/stats/period.ts — exporta la lista de tipos de «Ver por»

## Tareas

- [ ] T1: «Personas y agentes» y el resumen cuentan el periodo y ordenan por cambios con `stats/counts.ts`
  - files: packages/core/src/stats/counts.ts, packages/core/src/stats/summary.ts, packages/core/src/stats/people.ts, packages/core/src/stats/period.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/stats && pnpm --filter @baquia-dev/specty exec vitest run test/stats.test.ts && pnpm typecheck && pnpm lint
  - type: refactor

## Riesgos

- R1: C2 de la épica toca a la vez el core del panel (`cost.ts`, `quality.ts` y quizá `summary.ts`) para los títulos. Mitigación: aquí solo cambia el conteo y el orden de `summary.ts` y `people.ts` y, al incorporar main, se conservan las partes de los dos.
