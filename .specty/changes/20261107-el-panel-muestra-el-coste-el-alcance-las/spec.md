---
kind: standard
epic: 20261107-panel-de-specty
slice: C4
---

# El panel muestra el coste, el alcance, las integraciones y la memoria

## Objetivo

El «Panel» de `specty ui` muestra hoy los indicadores, «Ritmo», «Flujo y esperas», «Calidad», «Personas y agentes» y «Cambios». Con este corte llegan las tres secciones que faltan de la maqueta «A · Informe en una página»: «Coste y tokens» dice cuánto costaron los cambios del periodo y en qué; «Alcance e integraciones», cuánto se salió el trabajo de su plan y cuánto costó juntarlo con main; y «Memoria», qué se anotó. `specty stats` añade el tiempo por fase y los cambios más caros, como pide A10 de la épica (P340).

## Fuera de alcance

- El título de los cambios en «Los cambios más caros» y en «Cambios con más verificaciones fallidas» (P349). Darlo exige que `GET /api/stats` lea las filas con su título (`listedOf` de `server/stats-changes.ts`), lo que suma el paquete `cli` y cuatro archivos, y el corte pasaría de L a XL. Las dos listas dan el id, enlazado a su cambio, como en C3.
- Un formato de moneda en `sp-column-chart`: el coste por día va como una serie «USD» con las cifras redondeadas al céntimo.
- Las minigráficas de los indicadores (`stat-tile`) y cambios en las gráficas de C2 y C3.

## Supuestos

- A1: `statsView` añade `cost`, `scope` y `memory` a `StatsView`, opcionales como las demás secciones, así que el servidor, `specty stats --json` y la fuente de datos de la UI no cambian, y la página solo pinta la sección que llega. Cuentan los cambios del corte (periodo, «Ver por» y carril), cada hecho por la fecha local de su evento.
  - impacto: medio
- A2: «Coste y tokens» cuenta el `cost` de cada `change.usage` del periodo: por día o por semana, en los tramos de «Ritmo»; por carril, con en cuántos cambios, solo los carriles con coste y de más a menos; y por cambio, hasta cinco, de más a menos, con su carril y las tareas completadas, el ciclo y las sesiones de todo el cambio. Los tokens (`input`, `output`, `cacheWrite` y `cacheRead`) y las llamadas (`calls`) suman todos los `change.usage` del periodo, también los que no traen coste (183 de 306 en este repositorio), con en cuántos cambios. «En N de M» es el del indicador «Coste medido»: los cambios con coste en el periodo de los cerrados en él.
  - impacto: alto
- A3: La barra de tokens muestra la lectura de caché, la escritura de caché y la salida, porque la paleta tiene tres colores; la entrada sin caché, que suele ser mínima, va en la línea de debajo con las llamadas al modelo. Sin ningún `change.usage` en el periodo, la sección lo dice en lugar de las gráficas. Con tokens pero sin coste, el coste por carril no aparece y la lista de los más caros dice que ninguno tiene el coste medido.
  - impacto: medio
- A4: «Alcance e integraciones» cuenta en el periodo cada `scope.decided` por su decisión: `auto`, `approved` o `rejected`, también las del agente en modo delegado y los rechazos de Specty. Cuenta cada `integration.started` por su motivo (`verify` o `conflicts`), con cuántos cambios tuvieron alguna, y cada `adjust.requested`, con en cuántos cambios.
  - impacto: alto
- A5: «Memoria» cuenta las entradas creadas en el periodo (`created`), por su estado de hoy y por su tipo, en barras ordenadas de más a menos. Con «Ver por» o un carril, solo cuenta las anotadas en un cambio del corte (`origin.change`), como el indicador de pendientes abiertos.
  - impacto: medio
- A6: P340: `specty stats` añade, tras las tablas por persona, agente y modelo, el bloque «TIEMPO POR FASE (MEDIANA)», con la mediana de cada fase y en cuántos cambios se mide (de `flow`). Añade también «LOS CAMBIOS MÁS CAROS», con su id, carril, tareas, ciclo, sesiones y coste (de `cost`). Cada bloque sale solo si hay algo que contar. Para que `cards/stats.ts` no pase de 300 líneas, sus formatos (duraciones, porcentajes, USD y la tabla alineada) pasan a `cards/stats-format.ts`.
  - impacto: bajo
- A7: «Coste y tokens» va en dos columnas desde `lg`, con el coste por día a la izquierda y, a la derecha, los tokens y el coste por carril, y debajo la tabla de los más caros. «Alcance e integraciones» va en tres: las dos barras segmentadas y la cifra de ajustes. «Memoria» va en dos: por estado y por tipo. Las tres secciones van tras «Calidad» y antes de «Personas y agentes», en el orden de A9 de la épica, y usan las gráficas de C2 y C3 sin cambiarlas.
  - impacto: medio

## Criterios de aceptación

- AC1: CUANDO la persona mira «Coste y tokens» ENTONCES ve en cuántos de los cambios cerrados del periodo se midió el coste, el coste por día (o por semana) en columnas y los tokens por tipo en una barra segmentada con las llamadas al modelo. Ve también el coste por carril en barras horizontales y hasta cinco cambios más caros, cada uno enlazado a su cambio con su carril, tareas, ciclo, sesiones y coste.
- AC2: CUANDO ningún cambio del periodo tiene su consumo medido ENTONCES «Coste y tokens» lo dice en lugar de las gráficas, y CUANDO hay tokens pero ningún coste ENTONCES la lista de los más caros dice que ninguno tiene el coste medido.
- AC3: CUANDO mira «Alcance e integraciones» ENTONCES ve en una barra segmentada las solicitudes de alcance decididas en el periodo, automáticas, aprobadas y rechazadas. Ve en otra las incorporaciones de main que pararon por la verificación o por conflictos, con en cuántos cambios, y los ajustes pedidos, con en cuántos cambios.
- AC4: CUANDO mira «Memoria» ENTONCES ve cuántas entradas se anotaron en el periodo y cuántas hay de cada estado y de cada tipo, en barras horizontales de más a menos; sin ninguna, lo dice.
- AC5: CUANDO pulsa «Ver tabla» en una gráfica de las tres secciones ENTONCES ve sus mismos datos en una tabla, y con el teclado recorre sus marcas, cada una con sus valores en su nombre accesible y en la información emergente.
- AC6: CUANDO el core calcula el panel ENTONCES cuenta el coste, los tokens, el alcance, las incorporaciones, los ajustes y la memoria con las definiciones de A2 a A5, cada hecho por la fecha de su evento y solo los cambios del corte.
- AC7: CUANDO alguien ejecuta `specty stats` ENTONCES ve además el tiempo mediano por fase de los cambios cerrados en el periodo y los cambios más caros, y no ve esos bloques si no hay nada que contar.
- AC8: CUANDO la UI o `specty stats` están en inglés ENTONCES las tres secciones, sus gráficas, sus tablas, su información emergente y los bloques nuevos de `specty stats` salen en inglés.

## Diseño

- Core, `stats/rows.ts`: `StatsRow` gana `usage` (cada `change.usage`: `day`, `calls`, `input`, `output`, `cacheWrite` y `cacheRead`, 0 lo que falte), `scope` (cada `scope.decided` con una decisión conocida: `day` y `decision`), `integrations` (cada `integration.started` con un motivo conocido: `day` y `reason`) y `adjustments` (el día de cada `adjust.requested`). Se calculan en una función propia, para que `statsRow` siga corta.
- Core, `stats/cost.ts`: `statsCost(rows, range, rhythm)` devuelve `StatsCost`. Lleva `unit` y `buckets`, los tramos de `rhythm` con su `cost`, y `tokens`, con `input`, `output`, `cacheWrite`, `cacheRead`, `calls` y `changes`. Lleva también `lanes` (`kind`, `cost` y `changes`) y `top` (hasta cinco, con `id`, `kind`, `cost`, `tasks`, `cycle`, en ms o `null` si sigue abierto, y `sessions`).
- Core, `stats/scope.ts`: `statsScope(rows, range)` devuelve `StatsScope`: `requests` (`auto`, `approved` y `rejected`), `integrations` (`verify`, `conflicts` y `changes`) y `adjustments` (`requested` y `changes`).
- Core, `stats/memory.ts`: `statsMemory(entries, range)` devuelve `StatsMemory`: `entries`, `statuses` (uno por estado de `MEMORY_STATUSES`) y `kinds` (uno por tipo de `MEMORY_KINDS`).
- Core, `stats/summary.ts`: `StatsView` gana `cost?`, `scope?` y `memory?`, que también admiten `undefined`; `statsView` los calcula con los cambios del corte y las entradas de la memoria del corte. Los tipos no pasan por el índice: la UI los toma de `StatsView`.
- Core, `cards/stats.ts`: `statsCard` añade «TIEMPO POR FASE (MEDIANA)» y «LOS CAMBIOS MÁS CAROS». `cards/stats-format.ts` recibe `span`, `share`, `usd` y `aligned`, sin cambiar lo que escriben.
- UI, `dashboard/dashboard-cost.ts`: `sp-dashboard-cost`, `[data-section="cost"]`, recibe `cost` y `measured` (el `summary.cost` de la vista). Lleva el divisor «Coste y tokens», la nota `[data-measured]`, `[data-chart="cost"]` (`sp-column-chart`), `[data-chart="tokens"]` (`sp-segmented-bar`, con las cifras compactas), la línea `[data-calls]`, `[data-chart="lanes"]` (`sp-bar-list`) y la tabla `[data-top]`, cada fila `[data-change="<id>"]` con sus celdas `[data-cell]` y el enlace a `/changes/<id>`. Sin consumo, `[data-cost-none]`; sin coste, `[data-top-none]`.
- UI, `dashboard/dashboard-scope.ts`: `sp-dashboard-scope`, `[data-section="scope"]`, recibe `scope`. Lleva el divisor «Alcance e integraciones», `[data-chart="requests"]` y `[data-chart="integrations"]` (`sp-segmented-bar`), cada uno con su nota `[data-note]`, y la cifra `[data-figure="adjustments"]`.
- UI, `dashboard/dashboard-memory.ts`: `sp-dashboard-memory`, `[data-section="memory"]`, recibe `memory`. Lleva el divisor «Memoria», la línea `[data-noted]` y, con alguna entrada, `[data-chart="statuses"]` y `[data-chart="kinds"]` (`sp-bar-list`).
- UI, `dashboard/dashboard-page.ts`: importa las tres secciones y las pone tras «Calidad», cada una solo si la respuesta la trae.
- Tests: `core/test/stats/cost-scope-memory.test.ts` (AC6), `core/test/cards/stats.test.ts` (AC7 y AC8) y `ui/src/dashboard/dashboard-cost-scope-memory.test.ts` (AC1 a AC5 y AC8, con una fuente de prueba que da las tres secciones).

## Archivos

- modificar packages/core/src/stats/rows.ts — el consumo, las decisiones de alcance, las incorporaciones y los ajustes de cada cambio
- crear packages/core/src/stats/cost.ts — el coste por día, por carril y por cambio, y los tokens
- crear packages/core/src/stats/scope.ts — las solicitudes de alcance, las incorporaciones que pararon y los ajustes
- crear packages/core/src/stats/memory.ts — las entradas anotadas por estado y por tipo
- modificar packages/core/src/stats/summary.ts — `cost`, `scope` y `memory` en `StatsView`
- crear packages/core/test/stats/cost-scope-memory.test.ts — el coste, el alcance y la memoria del core
- modificar packages/core/src/cards/stats.ts — el tiempo por fase y los cambios más caros en `specty stats`
- crear packages/core/src/cards/stats-format.ts — los formatos de `specty stats`, que salen de `cards/stats.ts`
- modificar packages/core/test/cards/stats.test.ts — los dos bloques nuevos, en español y en inglés
- crear packages/ui/src/dashboard/dashboard-cost.ts — la sección «Coste y tokens»
- crear packages/ui/src/dashboard/dashboard-scope.ts — la sección «Alcance e integraciones»
- crear packages/ui/src/dashboard/dashboard-memory.ts — la sección «Memoria»
- modificar packages/ui/src/dashboard/dashboard-page.ts — pone las tres secciones tras «Calidad»
- crear packages/ui/src/dashboard/dashboard-cost-scope-memory.test.ts — las tres secciones en la página, en español y en inglés
- modificar docs/ui.md — las tres secciones del «Panel»
- modificar docs/ARCHITECTURE.md — `cost`, `scope` y `memory` de `GET /api/stats` y los bloques nuevos de `specty stats`
- modificar docs/formats.md — los bloques nuevos en la salida de `specty stats` (§9)

## Tareas

- [x] T1: El core calcula el coste, el alcance y la memoria del periodo
  - files: packages/core/src/stats/rows.ts, packages/core/src/stats/cost.ts, packages/core/src/stats/scope.ts, packages/core/src/stats/memory.ts, packages/core/src/stats/summary.ts, packages/core/test/stats/cost-scope-memory.test.ts
  - ac: AC6
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/stats/cost-scope-memory.test.ts test/stats/flow-quality.test.ts test/stats/sections.test.ts test/stats/summary.test.ts test/stats/table.test.ts test/stats/export.test.ts && pnpm lint
- [ ] T2: `specty stats` da el tiempo por fase y los cambios más caros
  - files: packages/core/src/cards/stats.ts, packages/core/src/cards/stats-format.ts, packages/core/test/cards/stats.test.ts, docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC7, AC8
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/stats.test.ts && pnpm lint
- [ ] T3: Las secciones «Coste y tokens», «Alcance e integraciones» y «Memoria» en el panel
  - files: packages/ui/src/dashboard/dashboard-cost.ts, packages/ui/src/dashboard/dashboard-scope.ts, packages/ui/src/dashboard/dashboard-memory.ts, packages/ui/src/dashboard/dashboard-page.ts, packages/ui/src/dashboard/dashboard-cost-scope-memory.test.ts, docs/ui.md
  - ac: AC1, AC2, AC3, AC4, AC5, AC8
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/dashboard/dashboard-cost-scope-memory.test.ts --include src/dashboard/dashboard-flow-quality.test.ts --include src/dashboard/dashboard-sections.test.ts --include src/dashboard/dashboard-page.test.ts && pnpm typecheck && pnpm lint && pnpm knip

## Riesgos

- R1: El corte queda cerca del límite del tamaño L. Mitigación: el servidor, la fuente de datos y las gráficas no cambian, y P349 queda fuera de alcance, dicho y anotado.
- R2: jsdom no calcula la geometría. Mitigación: los tests miran la estructura, los textos, el foco y los nombres accesibles de cada marca, y antes de aceptar se mira el panel en el navegador con los datos de este repositorio.
