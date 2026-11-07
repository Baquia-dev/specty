---
kind: standard
epic: 20261107-panel-de-specty
slice: C3
---

# El panel muestra el flujo, las esperas y la calidad

## Objetivo

El «Panel» de `specty ui` muestra hoy los indicadores, «Ritmo», «Personas y agentes» y «Cambios». Con este corte llegan dos secciones más de la maqueta «A · Informe en una página». «Flujo y esperas» dice dónde se va el tiempo de un cambio, quién aprueba las specs y cuánto espera la persona. «Calidad» dice lo que Specty comprobó al completar tareas y al aceptar. Con ellas llegan la línea, las barras horizontales y la barra segmentada, sobre el marco común de las gráficas, y la página «Gráficas» del catálogo con cada gráfica y sus estados (pendiente P326 de C2).

## Fuera de alcance

- Las secciones Coste y tokens, Alcance e integraciones y Memoria (C4), `specty stats` (C6) y la exportación (C7).
- El indicador con minigráfica (`stat-tile`): los indicadores siguen como los dejó C1.
- El título de los cambios en «Cambios con más verificaciones fallidas»: `GET /api/stats` no lee las specs, así que la lista muestra el id, enlazado a su cambio. Tocar el servidor no cabe en el tamaño de este corte.
- Que «Sesiones» de «Personas y agentes» muestre «—» cuando ningún cambio informa su sesión (P329): cambia un tipo que C6 lee en paralelo.
- Llevar `niceScale` de `column-chart.ts` a un archivo común y los formatos repetidos del panel a `dashboard-format.ts`.

## Supuestos

- A1: `statsView` añade `flow` y `quality` a `StatsView`, opcionales como `rhythm` y `people`, así que el servidor y la fuente de datos de la UI no cambian, y la página solo pinta la sección que llega. Las dos cuentan los cambios del corte (periodo, «Ver por» y carril), cada hecho por la fecha de su evento.
  - impacto: medio
- A2: Las fases son las de A6 de la épica: redactar la spec, de `change.created` a la primera `spec.proposed`; revisión, hasta la última `spec.approved`; implementación, hasta la última `task.completed`; aceptación y cierre, hasta `change.closed` (o `retro.confirmed`). Cuentan los cambios cerrados en el periodo, como el ciclo. Una fase por la que un cambio no pasó (sin propuesta, sin tareas) no cuenta para él y su tiempo va a la siguiente. Una fase que acabaría antes de empezar, como la implementación de un ajuste sin tareas nuevas, cuenta 0. Cada fase da su mediana y en cuántos cambios se mide.
  - impacto: alto
- A3: Cada `spec.approved` del periodo es una aprobación, por su canal: el agente en modo delegado (`delegated`), la terminal (`tty`) o la UI (`ui`). Un `pr`, que hoy no anota ningún comando, cuenta con la UI. La revisión de una aprobación va desde la primera `spec.proposed` posterior a la aprobación anterior (o desde el inicio) hasta ella, y sus propuestas son las `spec.proposed` de ese tramo. La espera a la persona es la mediana de la revisión de las aprobaciones de la terminal o la UI. Las revisiones por spec son la media de propuestas por aprobación.
  - impacto: alto
- A4: Las sesiones por cambio son la media de sesiones de agente distintas con alguna línea en el periodo, entre los cambios del corte que informan alguna en él. Se muestra en cuántos cambios se mide y, sin ninguno, «—».
  - impacto: medio
- A5: «Calidad» cuenta en el periodo: las `task.verified` que pasan de cada día o semana, con los mismos tramos que «Ritmo», y «sin datos» los que no tienen ninguna; las `change.verified` que fallaron (salida distinta de 0, también `null`) de cuántas hubo; los tests de contrato enviados (`tests.proposed`) y los bloqueados en rojo (`tests.locked`), cada archivo una vez por cambio; los riesgos, los archivos largos y las aserciones quitadas que dejaron las `task.completed` (`risks`, `longFiles` y la suma de `removed` de `removedAssertions`); y hasta cinco cambios con más `task.verified` fallidas, de más a menos, con cuántas de cuántas.
  - impacto: alto
- A6: Las gráficas nuevas siguen las reglas de la épica y el patrón de `sp-column-chart`: SVG de 560 de ancho, `sp-chart-frame` con título, «Ver tabla» y `sp-chart-tip`, una sola parada del tabulador y botones transparentes por marca con sus valores en su nombre accesible. `sp-line-chart` dibuja una serie con línea de 2 px, un velo del 10 %, el último punto con anillo del color de la superficie y un cursor vertical, y deja huecos donde no hay valor. `sp-bar-list` dibuja barras horizontales de un solo tono, de 16 px de alto con el extremo redondeado de 4 px, con el valor en tinta en su extremo; recorre sus filas con las flechas arriba y abajo. `sp-segmented-bar` dibuja un todo con hasta tres partes separadas 2 px y, debajo, una clave en tinta con cada parte, su valor y su porcentaje; dentro de la barra no hay texto, porque el blanco no contrasta con el aguamarina ni el naranja.
  - impacto: medio
- A7: La página «Gráficas» del catálogo (`/catalog/charts`, tras «Patrones», con su enlace y su comando de la paleta) muestra cada gráfica con datos de ejemplo y sus estados: columnas con varias series y con una, línea con huecos y sin datos, barras con un valor a 0 y barra segmentada con una parte a 0 y sin datos. Los tests de las gráficas nuevas van en `catalog/catalog.test.ts`, sobre esa página.
  - impacto: bajo
- A8: «Flujo y esperas» lleva, en dos columnas desde `lg`, «Tiempo por fase (mediana por cambio)» en barras horizontales y «Quién aprueba la spec», con la barra segmentada y tres cifras: espera a la persona, revisiones por spec y sesiones por cambio. «Calidad» lleva la línea de las verificaciones de tarea que pasan y «Señales de calidad»: cinco cifras y la lista de cambios con más verificaciones fallidas, cuyo «✕ N de M» va en el tono de riesgo, con icono y texto, como en «Cambios».
  - impacto: medio

## Criterios de aceptación

- AC1: CUANDO la persona mira «Flujo y esperas» ENTONCES ve, en barras horizontales, el tiempo mediano de redactar la spec, la revisión, la implementación y la aceptación y cierre de los cambios cerrados en el periodo, y al pasar el puntero o con el foco cada barra da su mediana y en cuántos cambios se mide.
- AC2: CUANDO mira «Quién aprueba la spec» ENTONCES ve en una barra segmentada las aprobaciones del periodo del agente en modo delegado, de la terminal y de la UI, con su número y su porcentaje, y la espera mediana a la persona, las revisiones por spec y las sesiones por cambio, con «—» cuando nada las mide.
- AC3: CUANDO mira «Calidad» ENTONCES ve en una línea la parte de las verificaciones de tarea que pasan por día (o por semana), con «sin datos» donde no hubo ninguna, y las verificaciones completas fallidas de cuántas, los tests de contrato enviados y los bloqueados en rojo, los riesgos, los archivos largos y las aserciones quitadas.
- AC4: CUANDO alguna verificación de tarea falló en el periodo ENTONCES «Calidad» lista hasta cinco cambios con más verificaciones fallidas, con «✕ N de M» en el tono de riesgo, y cada uno enlaza a su cambio; si ninguna falló, lo dice.
- AC5: CUANDO pulsa «Ver tabla» en la línea, las barras horizontales o la barra segmentada ENTONCES ve sus mismos datos en una tabla, y al llegar con el tabulador a la gráfica las flechas, Inicio y Fin recorren sus marcas, cada una con sus valores en su nombre accesible y en la información emergente.
- AC6: CUANDO abre «Gráficas» en el catálogo ENTONCES ve las columnas, la línea, las barras horizontales y la barra segmentada con sus estados: varias series y una sola, huecos, un valor a 0 y sin datos.
- AC7: CUANDO el core calcula el panel ENTONCES cuenta las fases, las aprobaciones por canal, la espera a la persona, las revisiones por spec, las sesiones por cambio y las señales de calidad con las definiciones de A2 a A5, cada hecho por la fecha de su evento y solo los cambios del corte.
- AC8: CUANDO la UI está en inglés ENTONCES las dos secciones, sus gráficas, su tabla, su información emergente y la página «Gráficas» del catálogo salen en inglés.

## Diseño

- Core, `stats/rows.ts`: `StatsRow` gana `proposed?` (la primera `spec.proposed`) y `completed?` (la última `task.completed`), en ISO; `approvals` (cada `spec.approved`: `at`, `channel` de `delegated`, `tty` o `ui`, `proposals` y `review`, en milisegundos o `null`); `full` (cada `change.verified`: `day` y `passed`); `contract` (cada `tests.proposed` y `tests.locked`: `day`, `locked` y `files`), y `findings` (cada `task.completed` con algo que señalar: `day`, `risks`, `longFiles` y `removed`). Se calculan en funciones propias, para que `statsRow` siga corta.
- Core, `stats/flow.ts`: `statsFlow(rows, range)` devuelve `StatsFlow`: `phases` (en orden, `phase` de `spec`, `review`, `implementation` y `closing`, con `median` y `changes`), `approvals` (`delegated`, `tty` y `ui`), `wait` (`median` y `approvals`), `revisions` (media o `null`) y `sessions` (`mean` o `null`, y `changes`).
- Core, `stats/quality.ts`: `statsQuality(rows, range, rhythm)` devuelve `StatsQuality`: `unit` y `buckets` (los tramos de `rhythm`, con `passed` y `total`), `full` (`failed` y `total`), `tests` (`proposed` y `locked`), `risks`, `longFiles`, `removedAssertions` y `worst` (hasta cinco, con `id`, `failed` y `total`).
- Core, `stats/summary.ts`: `StatsView` gana `flow?` y `quality?`, y `statsView` los calcula con los cambios del corte; la calidad, con los tramos del ritmo. Los tipos no pasan por el índice: la UI los toma de `StatsView`.
- UI, `components/charts/line-chart.ts`: `sp-line-chart` recibe `heading`, `category`, `labels`, `values` (`number | null`), `label` (el nombre de la serie en la tabla), `format` (cómo se lee un valor) y `min` y `max` del eje, opcionales; sin ellos el eje va de 0 a un máximo redondo. Se marca con `[data-line]`, `[data-area]`, `[data-point]` y `[data-cursor]`, y sus botones con `[data-mark]`.
- UI, `components/charts/bar-list.ts`: `sp-bar-list` recibe `heading`, `category`, `label`, `rows` (`label`, `value`, `text` y `detail` opcional, una línea más para la información emergente) y `color`. Se marca con `[data-bar]` y sus botones con `[data-mark]`.
- UI, `components/charts/segmented-bar.ts`: `sp-segmented-bar` recibe `heading`, `category`, `label`, `parts` (`label`, `value` y `color`) y `format`. Se marca con `[data-part]`, sus botones con `[data-mark]` y su clave con `[data-key]`; sin datos muestra «Sin datos en el periodo» (`[data-none]`).
- UI, `catalog/charts.ts` (`sp-catalog-charts`): cada gráfica en un ejemplo `[data-example="column|line|bars|segmented"]`, con sus estados. `catalog/catalog.ts` añade la ruta, el enlace y el comando; `components/icons.ts`, el icono `ChartColumn`.
- UI, `dashboard/dashboard-flow.ts`: `sp-dashboard-flow`, `[data-section="flow"]`, recibe `flow`; lleva el divisor «Flujo y esperas», `[data-chart="phases"]`, `[data-chart="approvals"]` y las cifras `[data-figure="wait|revisions|sessions"]`, con los tiempos en `formatDuration`.
- UI, `dashboard/dashboard-quality.ts`: `sp-dashboard-quality`, `[data-section="quality"]`, recibe `quality`; lleva el divisor «Calidad», `[data-chart="verifications"]`, las cifras `[data-figure="full|tests|risks|long|assertions"]` y la lista `[data-worst]`, cada fila `[data-change="<id>"]` con su enlace a `/changes/<id>`. El eje de la línea va de 0 % a 100 %, o desde el múltiplo de 20 % por debajo del valor más bajo cuando todos pasan del 80 %.
- UI, `dashboard/dashboard-page.ts`: importa las dos secciones y las pone tras «Personas y agentes», cada una solo si la respuesta la trae.
- Tests: `core/test/stats/flow-quality.test.ts` (AC7), `catalog/catalog.test.ts` (AC5, AC6 y AC8, sobre la página «Gráficas») y `dashboard/dashboard-flow-quality.test.ts` (AC1 a AC5 y AC8, con una fuente de prueba que da las dos secciones).

## Archivos

- modificar packages/core/src/stats/rows.ts — las fechas de las fases, las aprobaciones y las señales de calidad de cada cambio
- crear packages/core/src/stats/flow.ts — el tiempo por fase, las aprobaciones, la espera, las revisiones y las sesiones
- crear packages/core/src/stats/quality.ts — las verificaciones por día y las señales de calidad
- modificar packages/core/src/stats/summary.ts — `flow` y `quality` en `StatsView`
- crear packages/core/test/stats/flow-quality.test.ts — el flujo y la calidad del core
- crear packages/ui/src/components/charts/line-chart.ts — una serie en el tiempo, con huecos, cursor y teclado
- crear packages/ui/src/components/charts/bar-list.ts — barras horizontales ordenadas, con teclado
- crear packages/ui/src/components/charts/segmented-bar.ts — un todo en partes, con su clave y teclado
- crear packages/ui/src/catalog/charts.ts — la página «Gráficas» del catálogo
- modificar packages/ui/src/catalog/catalog.ts — la ruta, el enlace y el comando de «Gráficas»
- modificar packages/ui/src/catalog/catalog.test.ts — la página «Gráficas» y las gráficas nuevas
- modificar packages/ui/src/components/icons.ts — el icono de «Gráficas»
- crear packages/ui/src/dashboard/dashboard-flow.ts — la sección «Flujo y esperas»
- crear packages/ui/src/dashboard/dashboard-quality.ts — la sección «Calidad»
- modificar packages/ui/src/dashboard/dashboard-page.ts — pone las dos secciones tras «Personas y agentes»
- crear packages/ui/src/dashboard/dashboard-flow-quality.test.ts — las dos secciones en la página, en español y en inglés
- modificar docs/ui.md — «Flujo y esperas», «Calidad» y la página «Gráficas» del catálogo

## Tareas

- [ ] T1: El core calcula el flujo, las esperas y la calidad
  - files: packages/core/src/stats/rows.ts, packages/core/src/stats/flow.ts, packages/core/src/stats/quality.ts, packages/core/src/stats/summary.ts, packages/core/test/stats/flow-quality.test.ts
  - ac: AC7
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/stats/flow-quality.test.ts test/stats/sections.test.ts test/stats/summary.test.ts test/stats/table.test.ts && pnpm lint
- [ ] T2: La línea, las barras horizontales y la barra segmentada, y la página «Gráficas» del catálogo
  - files: packages/ui/src/components/charts/line-chart.ts, packages/ui/src/components/charts/bar-list.ts, packages/ui/src/components/charts/segmented-bar.ts, packages/ui/src/catalog/charts.ts, packages/ui/src/catalog/catalog.ts, packages/ui/src/components/icons.ts, packages/ui/src/catalog/catalog.test.ts
  - ac: AC5, AC6, AC8
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/catalog/catalog.test.ts --include src/components/charts/charts.test.ts && pnpm lint
- [ ] T3: Las secciones «Flujo y esperas» y «Calidad» en el panel
  - files: packages/ui/src/dashboard/dashboard-flow.ts, packages/ui/src/dashboard/dashboard-quality.ts, packages/ui/src/dashboard/dashboard-page.ts, packages/ui/src/dashboard/dashboard-flow-quality.test.ts, docs/ui.md
  - ac: AC1, AC2, AC3, AC4, AC5, AC8
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/dashboard/dashboard-flow-quality.test.ts --include src/dashboard/dashboard-sections.test.ts --include src/dashboard/dashboard-page.test.ts && pnpm typecheck && pnpm lint && pnpm knip

## Riesgos

- R1: El corte queda en el límite del tamaño L. Mitigación: los tests de las gráficas nuevas van con los del catálogo, el servidor y la fuente de datos no cambian, y lo que no cabe queda fuera de alcance y como pendiente.
- R2: C6 y C7 se hacen en paralelo y leen `StatsView` y `StatsRow`. Mitigación: los campos nuevos solo se añaden, sin cambiar los que ya hay, y la página solo coloca las dos secciones.
- R3: jsdom no calcula la geometría. Mitigación: los tests miran la estructura, los textos, el foco y los atributos de cada marca, y antes de aceptar se mira el panel en el navegador, en claro y en oscuro.
