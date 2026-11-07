---
kind: standard
---

# Los indicadores del panel llevan su minigráfica

## Objetivo

Los seis indicadores del «Panel» de `specty ui` dan hoy su valor y su variación, pero no cómo evolucionaron dentro del periodo. Con este cambio, cada uno lleva su minigráfica con su valor en cada día o semana del periodo. Es el «indicador con minigráfica» de A8 de la épica `20261107-panel-de-specty`, que no llevó ningún corte (P350). La minigráfica da sus valores al pasar el puntero y con el teclado, y la fila tiene «Ver tabla» con los mismos datos.

## Fuera de alcance

- La limpieza de código repetido del panel: los formatos (P327), el ciclo y el coste repetidos en `people.ts` y `summary.ts` (P328), un módulo común de las gráficas (P342), la descarga común (P344) y dividir `data/server.ts` (P345). La minigráfica reutiliza `sp-chart-tip` y sigue el patrón de `sp-line-chart` sin cambiarlo.
- La minigráfica en `specty stats`: la terminal sigue con los indicadores y su variación.
- Dibujar el periodo anterior en la minigráfica, o cambiar las demás gráficas y secciones del panel.
- Cambiar el servidor o la fuente de datos de la UI: `GET /api/stats` añade el campo nuevo porque lo calcula `statsView`.

## Supuestos

- A1: Cada minigráfica da su indicador en cada día del periodo, o en cada semana desde el lunes si pasa de 45 días: son los tramos de «Ritmo». En cada tramo, cada indicador cuenta con su definición de A6 de la épica: los cambios cerrados en él, las tareas completadas en él, la mediana del ciclo de los cerrados en él, la parte de verificaciones de tarea que pasan en él, el coste medido en él y los pendientes abiertos al final de él. El ciclo, las verificaciones y el coste no tienen valor en un tramo sin cierres, sin verificaciones o sin coste medido.
  - impacto: alto
- A2: Lo calcula el core: `StatsView` gana `trend`, opcional como las secciones, con la misma función que cuenta el periodo (`countsOf` de `stats/summary.ts`). Así, `GET /api/stats` y `specty stats --json` lo llevan sin cambiar el servidor, y la salida de texto de `specty stats` no cambia.
  - impacto: medio
- A3: La minigráfica es una línea de 2 px en `--color-series-1`, de 36 px de alto y el ancho del indicador, bajo la variación y la nota, alineada abajo en toda la fila. Su escala va del valor más bajo al más alto de la serie, porque muestra la forma y la cifra ya está encima. No lleva relleno, que sugeriría una magnitud, y con todos los valores iguales la línea va por el medio. El último valor lleva un punto de 8 px con anillo del color del fondo. La línea se corta donde un tramo no tiene valor, y un valor sin vecinos lleva su punto. Sin ningún valor, el espacio queda vacío.
  - impacto: medio
- A4: La minigráfica funciona como las demás gráficas del panel: es una sola parada del tabulador, las flechas, Inicio y Fin recorren sus tramos, y cada tramo tiene su valor en su nombre accesible («9 oct: Cambios cerrados 2», «sin datos» donde no hay valor). Al pasar el puntero o con el foco, un cursor y la información emergente (`sp-chart-tip`, encima de la minigráfica) dan el día y el valor. «Ver tabla» va una sola vez en la fila, no en cada indicador, porque seis enlaces llenarían la fila. Abre bajo los indicadores una tabla con una fila por día o semana y una columna por indicador, con «—» donde no hay valor; «Ocultar tabla» la cierra y los indicadores se quedan.
  - impacto: alto
- A5: El indicador pasa a ser un componente, `sp-stat-tile` en `components/charts/stat-tile.ts`, como decía el diseño de la épica. Lleva la etiqueta, el valor, la variación y la nota como hoy, con los mismos atributos `data-*`, para que los tests de la página sigan valiendo, y la minigráfica. `dashboard-summary.ts` sigue calculando las cifras y les añade la serie. El catálogo «Gráficas» añade la sección «Indicador con minigráfica» con sus estados: con serie y comparación, con huecos y un valor suelto, sin datos y sin serie.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO la persona abre el «Panel» ENTONCES cada uno de los seis indicadores lleva, bajo su variación y su nota, una minigráfica con su valor en cada día del periodo (o en cada semana, con más de 45 días), con el último valor marcado.
- AC2: CUANDO un tramo no tiene valor para un indicador ENTONCES la línea se corta ahí y un valor sin vecinos lleva su punto; CUANDO no tiene ninguno ENTONCES no dibuja línea.
- AC3: CUANDO pasa el puntero por una minigráfica o llega a ella con el teclado ENTONCES ve un cursor y la información emergente con el día y el valor. Las flechas, Inicio y Fin recorren sus tramos desde una sola parada del tabulador, y cada tramo tiene su valor en su nombre accesible.
- AC4: CUANDO pulsa «Ver tabla» en la fila de indicadores ENTONCES ve una tabla con cada indicador por día o por semana, con «—» donde no hay valor, y CUANDO pulsa «Ocultar tabla» ENTONCES la tabla se cierra.
- AC5: CUANDO el core calcula el panel ENTONCES da, por cada tramo de «Ritmo», los seis indicadores con las definiciones de A1, y nada en el ciclo, las verificaciones y el coste de un tramo sin datos para ellos.
- AC6: CUANDO abre el catálogo «Gráficas» ENTONCES ve el indicador con minigráfica en sus estados: con serie y comparación, con huecos y un valor suelto, sin datos y sin serie.
- AC7: CUANDO la UI está en inglés ENTONCES la minigráfica, su información emergente, sus nombres accesibles y la tabla de los indicadores salen en inglés.

## Diseño

- Core, `stats/summary.ts`: `StatsView` gana `trend?: { unit: "day" | "week"; buckets: { from, to, closed, tasks, cycle, verifications, cost, pending }[] } | undefined`, con el tipo escrito en `StatsView` (la UI lo toma de ahí, sin pasar por el índice). `statsView` lo calcula con `trendOf(cut, entries, rhythm)`, que aplica `countsOf` a cada tramo de `rhythm`. `closed`, `tasks` y `pending` son números; `cycle` (ms), `verifications` (de 0 a 1) y `cost` (USD) son `null` sin datos.
- UI, `components/charts/stat-tile.ts`: `sp-stat-tile`, con las entradas `label`, `value`, `delta?` (`tone`, `mark?` y `text`, con los colores de fase de hoy), `note?` y `trend?` (`heading`, `labels`, `values` y `format`). Mantiene `[data-label]`, `[data-value]`, `[data-delta]` con `data-tone` y `[data-note]`. La minigráfica es `[data-trend]`: un SVG oculto a los lectores, con `viewBox="0 0 100 36"`, `preserveAspectRatio="none"` y trazos `vector-effect: non-scaling-stroke`, con un `[data-line]` por tramo seguido y un cursor `[data-cursor]`. Los puntos son `span` `[data-point]` de 10 px situados en %, para que no se deformen. Encima va un `role="group"` con el nombre de la serie («Cambios cerrados por día»), con un botón transparente `[data-mark]` por tramo y la información emergente `sp-chart-tip`.
- UI, `dashboard/dashboard-summary.ts`: pinta un `sp-stat-tile` por indicador con `[attr.data-kpi]` y, si la vista trae `trend`, su serie: las etiquetas «9 oct» del primer día de cada tramo y el formato del indicador. El botón `[data-kpis-toggle]` («Ver tabla» / «Ocultar tabla», `aria-pressed`) va bajo la fila, a la derecha, y abre `[data-kpis-table]`, con la cabecera «Día» o «Semana del» y los seis indicadores.
- Catálogo, `catalog/charts.ts`: la sección `[data-example="stat-tile"]` con cuatro `sp-stat-tile`.
- Tests: `core/test/stats/trend.test.ts` (AC5), `ui/src/components/charts/stat-tile.test.ts` (AC2, AC3 y AC7), `ui/src/catalog/catalog.test.ts` (AC6) y `ui/src/dashboard/dashboard-summary.test.ts` (AC1, AC4 y AC7).

## Archivos

- modificar packages/core/src/stats/summary.ts — `trend` en `StatsView`: los seis indicadores por cada tramo de «Ritmo»
- crear packages/core/test/stats/trend.test.ts — los indicadores por día y por semana, con sus tramos sin datos
- modificar docs/ARCHITECTURE.md — `trend` en la respuesta de `GET /api/stats`
- crear packages/ui/src/components/charts/stat-tile.ts — el indicador con minigráfica, su teclado y su información emergente
- crear packages/ui/src/components/charts/stat-tile.test.ts — la línea, los huecos, los puntos, el teclado y los nombres, en español y en inglés
- modificar packages/ui/src/catalog/charts.ts — la sección «Indicador con minigráfica» con sus estados
- modificar packages/ui/src/catalog/catalog.test.ts — los estados del indicador en el catálogo
- modificar packages/ui/src/dashboard/dashboard-summary.ts — los indicadores con su serie, y «Ver tabla» de la fila
- crear packages/ui/src/dashboard/dashboard-summary.test.ts — las minigráficas y la tabla de los indicadores en el panel
- modificar docs/ui.md — la minigráfica y la tabla de los indicadores del «Panel»

## Tareas

- [x] T1: El core da cada indicador por día o por semana
  - files: packages/core/src/stats/summary.ts, packages/core/test/stats/trend.test.ts, docs/ARCHITECTURE.md
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/stats/trend.test.ts test/stats/summary.test.ts test/stats/sections.test.ts test/stats/flow-quality.test.ts test/stats/cost-scope-memory.test.ts && pnpm lint
- [x] T2: El indicador con minigráfica y su sección del catálogo
  - files: packages/ui/src/components/charts/stat-tile.ts, packages/ui/src/components/charts/stat-tile.test.ts, packages/ui/src/catalog/charts.ts, packages/ui/src/catalog/catalog.test.ts
  - ac: AC2, AC3, AC6, AC7
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/components/charts/stat-tile.test.ts --include src/catalog/catalog.test.ts && pnpm lint
- [x] T3: Los indicadores del panel llevan su minigráfica y su tabla
  - files: packages/ui/src/dashboard/dashboard-summary.ts, packages/ui/src/dashboard/dashboard-summary.test.ts, docs/ui.md
  - ac: AC1, AC4, AC7
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/dashboard/dashboard-summary.test.ts --include src/dashboard/dashboard-page.test.ts && pnpm typecheck && pnpm lint && pnpm knip

## Riesgos

- R1: jsdom no calcula la geometría. Mitigación: los tests miran la estructura, las posiciones calculadas, el foco, la información emergente y los nombres accesibles, y antes de aceptar se mira el panel en el navegador con los datos de este repositorio.
- R2: Con 45 días, cada tramo de la minigráfica mide unos 4 px de ancho con el puntero. Mitigación: el teclado recorre cada tramo, y la tabla de la fila da todos los valores.

## Cierre

### Resumen

Los seis indicadores del «Panel» llevan su minigráfica (P350, A8 de la épica `20261107-panel-de-specty`). El core añade `trend` a `StatsView`: los seis indicadores en cada día o semana de «Ritmo», contados con la misma función que el periodo (`countsOf`), así que `GET /api/stats` y `specty stats --json` lo llevan sin tocar el servidor. La UI tiene el componente `sp-stat-tile` (`components/charts/stat-tile.ts`), con la etiqueta, el valor, la variación y la nota de antes. Debajo lleva una línea de 2 px que se corta en los huecos y marca el último valor y los sueltos. Tiene cursor, información emergente encima y teclado como `sp-line-chart`. «Ver tabla», bajo la fila, abre los seis indicadores por día o semana. El catálogo «Gráficas» muestra sus cuatro estados. Se comprobó en el navegador con la UI y el CLI construidos desde esta carpeta y los datos de este repositorio (30 días, en claro, en oscuro y a 390 px): las seis minigráficas, la información emergente y la tabla.

### Desviaciones

- Ninguna en el alcance ni en los archivos. El título inglés de la sección del catálogo es «Figure with sparkline», el término habitual en inglés.

### Decisiones

- El tipo de `trend` va escrito dentro de `StatsView`, sin exportarse del índice, como las demás secciones que la UI toma de `StatsView`.
- La minigráfica dibuja en SVG con `preserveAspectRatio="none"` y trazos `non-scaling-stroke` para ocupar el ancho del indicador con 36 px fijos de alto. Los puntos son `span` situados en %, para que no se deformen.
- Sin ningún valor, la minigráfica deja su espacio vacío y no ofrece tramos que recorrer. Con todos los valores iguales, la línea va por el medio.
- `dashboard-summary.ts` copia `shortDay` una vez más; su limpieza sigue en P327 y P342, fuera de alcance.

### Pendientes

- Ninguno nuevo.
