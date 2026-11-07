---
kind: standard
epic: 20261108-panel-titulos-y-sesiones
slice: C1
---

# «Sesiones» muestra «—» cuando nada la mide

## Objetivo

Hoy «Sesiones» muestra 0 en «Personas y agentes» y en «Los cambios más caros» para los agentes cuya herramienta no informa su sesión (todos menos Claude Code) y para «(sin dato)», como si hubieran trabajado sin ninguna. Con este cambio muestra «—», como las demás cifras que nada mide, en el panel de `specty ui` y en `specty stats` (P329).

## Fuera de alcance

- El título de cada cambio en «Los cambios más caros» y en «Cambios con más verificaciones fallidas»: lo hace C2 de la épica.
- Las sesiones por cambio de «Flujo y esperas»: ya cuentan solo los cambios que informan alguna.
- Que más herramientas informen su sesión en la auditoría.

## Supuestos

- A1: «Sesiones» de «Personas y agentes» es `null` cuando ninguna línea de ninguno de sus cambios trae `session`, en cualquier día. Si alguna la trae pero ninguna en el periodo, sigue siendo 0: esa cifra sí se mide.
  - impacto: medio
- A2: «Sesiones» de «Los cambios más caros», que cuenta las de todo el cambio, también es `null` cuando ninguna línea del cambio trae `session`, por coherencia con A1.
- A3: `specty stats` muestra «—» en sus columnas «Sesiones» cuando el valor es `null`, también en inglés, porque la tarjeta es la misma.
- A4: La tabla de «Personas y agentes» de la UI ya muestra «—» con cualquier cifra `null` (`shown` en `dashboard-people.ts`), así que solo cambia su test; «Los cambios más caros» sí necesita el cambio en `dashboard-cost.ts`.

## Criterios de aceptación

- AC1: CUANDO ninguna línea de los cambios de una persona, un agente o un modelo trae su sesión ENTONCES «Sesiones» de «Personas y agentes» muestra «—», en el panel y en `specty stats`; con alguna, el número de sesiones del periodo, también 0.
- AC2: CUANDO ninguna línea de uno de «Los cambios más caros» trae su sesión ENTONCES su «Sesiones» muestra «—», en el panel y en `specty stats`.

## Diseño

- `StatsPeopleRow.sessions` (`core/src/stats/people.ts`) y `sessions` de cada cambio de `StatsCost.top` (`core/src/stats/cost.ts`) pasan a `number | null`: `null` cuando `row.sessions` está vacío en todas las filas que cuentan.
- `cards/stats.ts` escribe «—» con `null` en sus dos tablas, como ya hace con el ciclo y el coste.
- `dashboard-cost.ts` da «—» con `null` en la celda «Sesiones». En `cost.ts` y `dashboard-cost.ts` solo cambian las sesiones: C2 toca esos archivos en paralelo.

## Archivos

- modificar packages/core/src/stats/people.ts — «Sesiones» es `null` cuando ninguno de sus cambios trae sesión
- modificar packages/core/src/stats/cost.ts — «Sesiones» de cada cambio más caro es `null` sin ninguna sesión
- modificar packages/core/src/cards/stats.ts — `specty stats` escribe «—» con `null`
- modificar packages/core/test/stats/sections.test.ts — tests de AC1 en el core
- modificar packages/core/test/stats/cost-scope-memory.test.ts — el cambio «e», sin sesiones, da `null` (AC2)
- modificar packages/core/test/cards/stats.test.ts — tests de «—» en las dos tablas de la tarjeta
- modificar packages/cli/test/stats.test.ts — Bea, cuyo agente no informa su sesión, muestra «—»
- modificar packages/ui/src/dashboard/dashboard-cost.ts — «—» en «Sesiones» de «Los cambios más caros»
- modificar packages/ui/src/dashboard/dashboard-cost-scope-memory.test.ts — test de AC2 en el panel
- modificar packages/ui/src/dashboard/dashboard-sections.test.ts — test de AC1 en el panel
- modificar docs/formats.md — el ejemplo y la explicación de `specty stats`
- modificar docs/ui.md — «Personas y agentes» y «Los cambios más caros» dicen cuándo «Sesiones» es «—»

## Tareas

- [x] T1: El core da `null` en «Sesiones» cuando nada la mide
  - files: packages/core/src/stats/people.ts, packages/core/src/stats/cost.ts, packages/core/test/stats/sections.test.ts, packages/core/test/stats/cost-scope-memory.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/stats/sections.test.ts test/stats/cost-scope-memory.test.ts
  - type: fix
- [ ] T2: `specty stats` escribe «—» en «Sesiones» sin ninguna sesión, y `docs/formats.md` lo dice
  - files: packages/core/src/cards/stats.ts, packages/core/test/cards/stats.test.ts, packages/cli/test/stats.test.ts, docs/formats.md
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/stats.test.ts && pnpm --filter @baquia-dev/specty exec vitest run test/stats.test.ts
  - type: fix
- [ ] T3: El panel muestra «—» en «Sesiones» sin ninguna sesión, y `docs/ui.md` lo dice
  - files: packages/ui/src/dashboard/dashboard-cost.ts, packages/ui/src/dashboard/dashboard-cost-scope-memory.test.ts, packages/ui/src/dashboard/dashboard-sections.test.ts, docs/ui.md
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/dashboard/dashboard-cost-scope-memory.test.ts --include src/dashboard/dashboard-sections.test.ts && pnpm typecheck && pnpm lint
  - type: fix

## Riesgos

- R1: C2 cambia a la vez `stats/cost.ts` y `dashboard-cost.ts` para el título. Mitigación: aquí solo se tocan las líneas de las sesiones y, al incorporar main, se conservan las partes de los dos.
