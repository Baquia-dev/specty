---
kind: standard
epic: 20261107-panel-de-specty
slice: C2
---

# El panel muestra el ritmo y una tabla por persona, agente y modelo

## Objetivo

El «Panel» de `specty ui` solo tiene hoy la fila de indicadores. Con este corte, bajo ella aparecen dos secciones de la maqueta «A · Informe en una página». «Ritmo» muestra los cambios cerrados, apilados por carril, y las tareas completadas, por día o por semana. «Personas y agentes» muestra una fila por persona, agente y modelo, y elegir una fila filtra el panel. Con ellas llegan las primeras gráficas propias en SVG, con su información emergente, su teclado y su vista en tabla, y la paleta de las series, validada para daltonismo en los dos temas.

## Fuera de alcance

- Las secciones Flujo y esperas, Calidad, Coste y tokens, Alcance e integraciones, Memoria y Cambios, `specty stats` y la exportación (C3 a C7).
- La línea, las barras horizontales, la barra segmentada y el indicador con minigráfica (`stat-tile`, P298 y P308): llegan con las secciones que las usan, y los indicadores siguen como los dejó C1.
- La página de gráficas del catálogo: no cabe en el tamaño L de este corte. La paleta sí sale en «Colores», y la página llegará con las gráficas de C3.
- El panel de ejemplo del prototipo (P301 y P310) y llevar las comprobaciones de `data/server.ts` a otro archivo (P311).
- Tocar `server/api.ts`, `data/source.ts` o `data/server.ts`: las dos secciones viajan en la respuesta de `GET /api/stats`, que ya calcula `statsView`.

## Supuestos

- A1: `statsView` añade `rhythm` y `people` a `StatsView`, así que ni el servidor ni la fuente de datos de la UI cambian. En el tipo son opcionales, para que una fuente que aún no las da (las de prueba de C1 o el prototipo) muestre el resto del panel, y la página solo pinta la sección que llega.
  - impacto: medio
- A2: «Ritmo» cuenta los cambios del corte (periodo, «Ver por» y carril): cada cambio cerrado el día de su cierre, y cada tarea el de su `task.completed`. Un periodo de 45 días o menos va por día; uno más largo va por semana, desde el lunes, con la primera y la última semana recortadas al periodo. Los días o semanas sin nada van con 0.
  - impacto: medio
- A3: La paleta tiene tres colores, así que «Cambios cerrados» apila tres series: Feature (`--color-series-1`), Quick (`--color-series-2`) y «Épica, spike y manual» (`--color-series-3`). Con un carril elegido solo queda su serie, con el mismo color. Las tareas son una sola serie, en `--color-series-1` y sin leyenda, porque el título la nombra.
  - impacto: medio
- A4: «Personas y agentes» tiene una fila por persona, agente y modelo con algún cambio en el periodo, «(sin dato)» incluido. Cuenta con el carril elegido, pero sin el filtro «Ver por», para que se pueda pasar de una fila a otra. Las filas van en el orden de «Ver por»: por tipo, primero las de más cambios, después por nombre, y «(sin dato)» al final de su tipo. «Cambios» son los suyos cuya vida toca el periodo, como en la cabecera. Las tareas, el ciclo, las verificaciones y el coste se cuentan como los indicadores (A3 y A6 de la épica), y un valor que nada mide se muestra como «—». «Sesiones» son las sesiones de agente distintas (`session` de la auditoría) con alguna línea en el periodo. Elegir una fila pone su `who` en la URL, como «Ver por», y elegir la que ya filtra vuelve a Todos.
  - impacto: alto
- A5: Las gráficas son componentes de Angular en SVG, sin librería. `sp-column-chart` dibuja las columnas apiladas con las reglas de la épica. `sp-chart-frame` es lo que comparte cualquier gráfica: su título, la leyenda cuando hay dos o más series, «Ver tabla» con los mismos datos y la información emergente (`sp-chart-tip`). Cada columna es un botón transparente sobre la gráfica, con su nombre accesible. La gráfica es una sola parada del tabulador, y las flechas, Inicio y Fin pasan de una columna a otra. El puntero o el foco iluminan la columna y muestran sus valores, y el total si hay varias series.
  - impacto: medio
- A6: Los tokens nuevos van en `styles.css` y en el inventario del tema, en el grupo de colores, así que la página «Colores» del catálogo los muestra. El test de tokens comprueba en claro y en oscuro tres cosas. Las series contiguas se separan con protanopía y deuteranopía (ΔE OKLab de 8 o más, con la simulación de Machado). Todas se separan con visión normal (ΔE de 15 o más). Y contrastan 3:1 con el fondo y la superficie, salvo el aguamarina del tema claro (2,7:1), que compensan la leyenda y la vista en tabla (A7 de la épica).
  - impacto: medio
- A7: La rejilla y la línea base usan `--color-chart-grid` y `--color-chart-axis`. Los textos de las gráficas, la leyenda y la información emergente van en tinta (`--color-text`, `--color-text-muted` y los del tooltip), nunca en el color de la serie.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO la persona mira «Ritmo» en el panel ENTONCES ve los cambios cerrados por día, apilados por carril y con su leyenda, y las tareas completadas por día; con un periodo de más de 45 días, ambos van por semana; al pasar el puntero o con el foco por una columna, ve sus valores por serie y el total.
- AC2: CUANDO mira «Personas y agentes» ENTONCES ve una fila por persona, agente y modelo con algún cambio en el periodo, «(sin dato)» incluido, con sus cambios, tareas, ciclo mediano, verificaciones que pasan, sesiones y coste medido.
- AC3: CUANDO elige una fila de «Personas y agentes» ENTONCES el panel se filtra por ella, como con «Ver por», y la dirección lo guarda; elegir la que ya filtra vuelve a Todos.
- AC4: CUANDO pulsa «Ver tabla» en una gráfica ENTONCES ve sus mismos datos en una tabla, y «Ver gráfica» la devuelve.
- AC5: CUANDO llega con el tabulador a una gráfica ENTONCES las flechas, Inicio y Fin recorren sus columnas, y cada columna dice sus valores en su nombre accesible y en la información emergente.
- AC6: CUANDO las gráficas se ven en claro o en oscuro ENTONCES sus series se distinguen también con daltonismo y contrastan con el fondo, y lo comprueba un test de los tokens.
- AC7: CUANDO la UI está en inglés ENTONCES las secciones, las gráficas, su leyenda, su tabla y su información emergente salen en inglés.
- AC8: CUANDO el core calcula el panel ENTONCES «Ritmo» cuenta cada cambio cerrado el día de su cierre y cada tarea el de su `task.completed`, por día hasta 45 días y por semana desde el lunes por encima. «Personas y agentes» cuenta para cada persona, agente y modelo sus cambios, tareas, ciclo, verificaciones, sesiones distintas y coste del periodo, con el carril elegido y sin el filtro «Ver por».

## Diseño

- Core, `stats/period.ts`: exporta `addDays`, y recibe `sum` y `median`, que pasan de `summary.ts` para que las compartan las secciones.
- Core, `stats/rows.ts`: `StatsRow.sessions` guarda cada sesión de agente del cambio (`session` de sus líneas) con cada día en que trabajó en él, sin repetir.
- Core, `stats/rhythm.ts`: `statsRhythm(rows, range)` devuelve `StatsRhythm`, con `unit` (`day` o `week`) y `buckets`. Cada bucket lleva `from`, `to`, `closed` (un `Record<ChangeKind, number>` con los cinco carriles) y `tasks`. Las fechas se calculan como días del calendario, igual que los periodos.
- Core, `stats/people.ts`: `statsPeople(rows, range)` devuelve `StatsPeopleRow[]`, con `who`, `changes`, `tasks`, `cycle` (milisegundos o `null`), `verifications` (de 0 a 1, o `null`), `sessions` y `cost` (dólares, o `null`).
- Core, `stats/summary.ts`: `StatsView` gana `rhythm?` y `people?`. `statsView` los calcula siempre: el ritmo con los cambios del corte y las personas con los del carril. Los tipos no se exportan por el índice, porque la UI los toma de `StatsView`.
- UI, `components/charts/chart-frame.ts`. `sp-chart-frame` recibe `heading`, `legend` (etiqueta y token de color) y `table` (columnas y filas de texto) y proyecta la gráfica. Se marca con `[data-chart-heading]`, `[data-legend]` (solo con dos o más series), `[data-chart-toggle]` («Ver tabla» o «Ver gráfica», con `aria-pressed`) y `[data-chart-table]`. `sp-chart-tip` recibe `title` y `rows` (etiqueta, valor y color) y se marca con `[data-tip-title]` y `[data-tip-row]`.
- UI, `components/charts/column-chart.ts`. `sp-column-chart` recibe `heading`, `category` (la cabecera de la primera columna de la tabla: «Día» o «Semana del»), `labels` y `series` (`ChartSeries`: `label`, `color` y `values`). Dibuja un SVG de 560 × 170 con la rejilla de `niceTicks`, con marcas enteras si los valores lo son. Las columnas tienen 24 px como máximo, el extremo redondeado de 4 px, la base recta y 2 px entre segmentos (`[data-segment]`, con el `fill` de su serie), y solo una de cada N etiquetas del eje X. Encima va una fila de botones (`[data-column]`) con un índice itinerante. La información emergente se coloca junto a la columna activa, y la tabla tiene una fila por etiqueta, con una columna por serie y el total si hay varias.
- UI, `dashboard/dashboard-rhythm.ts`. `sp-dashboard-rhythm`, `[data-section="rhythm"]`, recibe `rhythm` y `kind`. Lleva el divisor «Ritmo» y, en dos columnas desde `lg`, las gráficas `[data-chart="closed"]` y `[data-chart="tasks"]`. Las etiquetas son el primer día de cada bucket, como «9 oct».
- UI, `dashboard/dashboard-people.ts`. `sp-dashboard-people`, `[data-section="people"]`, recibe `people` y `who` y emite `pick` con el `who` de la URL, o vacío. Lleva el divisor «Personas y agentes», con cuántas filas tiene, y una tabla. Cada fila se marca con `[data-row="person:Ana"]` y lleva un botón con `aria-pressed` y el tipo en una píldora. Sus celdas se marcan con `[data-cell="changes|tasks|cycle|verifications|sessions|cost"]`, y los valores van con `Intl` y `formatDuration`.
- UI, `dashboard/dashboard-page.ts`: importa las dos secciones y las pone bajo los indicadores, cada una solo si la respuesta la trae. `pick` llama a `choose({ who })`.
- Tests: `core/test/stats/sections.test.ts` (AC8), `components/charts/charts.test.ts` (AC1, AC4, AC5 y AC7, con un componente de prueba), `theme/tokens.test.ts` (AC6) y `dashboard/dashboard-sections.test.ts` (AC1, AC2, AC3, AC4 y AC7, con una fuente de prueba que da las dos secciones según el corte).

## Archivos

- modificar packages/core/src/stats/period.ts — `addDays`, `sum` y `median`, compartidos por las secciones
- modificar packages/core/src/stats/rows.ts — las sesiones de cada cambio, con su día
- crear packages/core/src/stats/rhythm.ts — los cambios cerrados por carril y las tareas, por día o por semana
- crear packages/core/src/stats/people.ts — una fila por persona, agente y modelo
- modificar packages/core/src/stats/summary.ts — `rhythm` y `people` en `StatsView`
- crear packages/core/test/stats/sections.test.ts — el ritmo, las personas y las sesiones
- modificar packages/ui/src/styles.css — los tokens de las series, la rejilla y el eje, en claro y en oscuro
- modificar packages/ui/src/theme/tokens.ts — los tokens nuevos en el inventario
- modificar packages/ui/src/theme/tokens.test.ts — el daltonismo y el contraste de las series
- crear packages/ui/src/components/charts/chart-frame.ts — título, leyenda, vista en tabla e información emergente de una gráfica
- crear packages/ui/src/components/charts/column-chart.ts — columnas apiladas, con puntero y teclado
- crear packages/ui/src/components/charts/charts.test.ts — la gráfica de columnas con su marco, en español y en inglés
- crear packages/ui/src/dashboard/dashboard-rhythm.ts — la sección «Ritmo»
- crear packages/ui/src/dashboard/dashboard-people.ts — la sección «Personas y agentes»
- modificar packages/ui/src/dashboard/dashboard-page.ts — pone las dos secciones bajo los indicadores
- crear packages/ui/src/dashboard/dashboard-sections.test.ts — las dos secciones en la página, en español y en inglés
- modificar docs/ui.md — «Ritmo», «Personas y agentes» y las gráficas del panel

## Tareas

- [x] T1: El core calcula el ritmo y una fila por persona, agente y modelo
  - files: packages/core/src/stats/period.ts, packages/core/src/stats/rows.ts, packages/core/src/stats/rhythm.ts, packages/core/src/stats/people.ts, packages/core/src/stats/summary.ts, packages/core/test/stats/sections.test.ts
  - ac: AC8
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/stats/sections.test.ts test/stats/summary.test.ts && pnpm lint
- [x] T2: La paleta de las gráficas y la gráfica de columnas, con su leyenda, su tabla, su teclado y su información emergente
  - files: packages/ui/src/styles.css, packages/ui/src/theme/tokens.ts, packages/ui/src/theme/tokens.test.ts, packages/ui/src/components/charts/chart-frame.ts, packages/ui/src/components/charts/column-chart.ts, packages/ui/src/components/charts/charts.test.ts
  - ac: AC1, AC4, AC5, AC6, AC7
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/theme/tokens.test.ts --include src/components/charts/charts.test.ts --include src/catalog/catalog.test.ts && pnpm lint
- [ ] T3: Las secciones «Ritmo» y «Personas y agentes» en el panel
  - files: packages/ui/src/dashboard/dashboard-rhythm.ts, packages/ui/src/dashboard/dashboard-people.ts, packages/ui/src/dashboard/dashboard-page.ts, packages/ui/src/dashboard/dashboard-sections.test.ts, docs/ui.md
  - ac: AC1, AC2, AC3, AC4, AC7
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/dashboard/dashboard-sections.test.ts --include src/dashboard/dashboard-page.test.ts && pnpm typecheck && pnpm lint && pnpm knip

## Riesgos

- R1: El corte queda en el límite del tamaño L, con core y UI. Mitigación: la página de gráficas del catálogo, las demás gráficas y el panel del prototipo quedan para los cortes siguientes. Las secciones no tocan el servidor ni la fuente de datos, y los tipos no pasan por el índice.
- R2: C5 se hace en paralelo y también toca `dashboard-page.ts`. Mitigación: aquí la página solo importa las dos secciones y las coloca, en unas pocas líneas.
- R3: jsdom no calcula la geometría, así que los tests no ven si las columnas se dibujan bien. Mitigación: los tests miran la estructura, los textos, el foco y el `fill` de cada segmento, y antes de aceptar se mira el panel en el navegador, en claro y en oscuro.
