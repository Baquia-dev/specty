---
kind: standard
---

# El resumen del panel cumple su tiempo también en el CI

## Objetivo

El test de rendimiento del panel («AC8: aggregates 2,000 synthetic changes in under a second», en `packages/core/test/stats/summary.test.ts`) falla en el CI de Linux y de Windows con Node 22 (1.050 y 1.343 ms frente al límite de 1 s), y es un bloqueante de la primera versión. Este cambio abarata de verdad la agregación de `packages/core/src/stats`, sin tocar el test ni su umbral, para que quede con margen holgado también en un runner varias veces más lento que este Mac: el panel da exactamente las mismas cifras, pero recorre cada hecho de cada cambio una vez por sección, y no una vez por cada día o semana, persona, agente o modelo.

## Fuera de alcance

- Cambiar el test AC8, su umbral o cualquier otro test.
- Cambiar lo que responde `GET /api/stats` (`StatsView`), lo que enseña la UI o `specty stats`.
- Abaratar la tabla de cambios (`statsChanges`), la exportación o la lectura de los registros en el servidor.
- Guardar el panel entre peticiones o cambiar qué es un «cambio que vivió en el periodo» (`lived`).

## Supuestos

- A1: El tiempo del test en el CI escala con el trabajo de CPU de la agregación: los runners son de 1,3 a 5,4 veces más lentos que este Mac según la carga (AC8 tardó 315 y 596 ms en macOS, 586 y 1.067 en Linux con Node 22, 520 y 879 en Linux con Node 24, 730 y 1.343 en Windows, frente a unos 250 ms aquí con cobertura), así que dividir el trabajo entre más de dos lo deja por debajo de unos 550 ms en el peor caso visto.
  - impacto: alto
- A2: Añadir a `StatsRow` el día local de su cierre (`closedDay`) y el de cada aprobación (`approvals[].day`) no rompe a nadie: las filas solo las crea `statsRow`, el servidor las guarda en memoria con cada registro (`listedRows`) y no se envían ni se escriben en ningún archivo; la tabla y la exportación siguen leyendo `closed` y `created`.
- A3: Los dólares deben dar el mismo número exacto, no uno parecido: cada cifra suma primero lo de cada cambio y luego esas sumas en el orden de las filas, como hasta ahora, y así el redondeo de coma flotante es el mismo.

## Criterios de aceptación

- AC1: CUANDO se ejecuta `packages/core/test/stats/summary.test.ts` con cobertura en este Mac ENTONCES su test «AC8: aggregates 2,000 synthetic changes in under a second» pasa sin cambios y tarda menos de la mitad que en `main` (antes, unos 250 ms; con el prototipo, unos 105 ms), y menos de 1 s con margen en el CI de Linux, macOS y Windows.
  - test: manual
- AC2: CUANDO se pide el panel de cualquier corte (los cuatro periodos, con o sin persona, agente, modelo o carril) ENTONCES `statsView` da exactamente el mismo JSON que en `main`, con las mismas cifras, el mismo orden y los mismos dólares, y `statsRow` da las mismas filas salvo los dos días nuevos; siguen pasando sin cambios los tests de `packages/core/test/stats/` y los del panel en el servidor (`packages/cli/test/server/stats*.test.ts`, `packages/cli/test/stats.test.ts`).
  - test: manual

## Diseño

Medido en este Mac (Node 24, vitest con cobertura, el test AC8 entero): en `main`, unos 250 ms (de 222 a 337 según la carga), de los que unos 20 son el propio test escribiendo sus 42.000 líneas de auditoría, unos 40 `statsRow` y unos 150 las cuatro llamadas a `statsView`. Lo caro, con perfil de CPU:

- La tendencia (`trend`) llamaba a `periodCounts` una vez por cada día o semana de «Ritmo»: unos 70 recorridos completos por los 2.000 cambios en los cuatro periodos, cada uno volviendo a calcular el día local de cada cierre con `dayOf` (un `new Date` y tres lecturas de fecha local). Era el 40 % del panel.
- «Personas y agentes» recorría los hechos de cada cambio tres veces (una por su persona, su agente y su modelo), y el resumen dos más.
- `statsRow` recorría las líneas unas 17 veces (`find`, `filter`, `flatMap` por cada clase de hecho), copiaba cada línea entera y leía su hora dos veces.
- «Calidad» y «Coste» hacían un mapa de cada día del periodo con `addDays` para repartir por tramos, y «Calidad» recorría dos veces las verificaciones y creaba dos `Set` por cambio aunque no tuviera tests de contrato; «Flujo» creaba un `Set` por cambio sin sesiones.

Lo que cambia, sin tocar la forma de `StatsView`:

- `rows.ts`: `statsRow` lee las líneas una vez. `lineOf` lee de cada entrada solo lo que usa, sin copiarla, y guarda su hora en milisegundos (`time`), la que ya calcula para validarla; los días salen de ella (`dayOf` acepta también milisegundos). Cada evento que cuenta tiene su función en un `Map` (no un objeto, para que `constructor` o `__proto__` no sean eventos). La fila trae además `closedDay` y el `day` de cada aprobación.
- `period.ts`: `rangeFinder(ranges)` da el tramo de un día buscando a mitades y recordándolo, porque los hechos de muchos cambios caen en pocos días.
- `counts.ts`: un solo recuento por cambio (`count`) para el periodo (`periodCounts`), para todos los tramos a la vez (`bucketCounts`) y para lo de cada cambio por separado (`ownCounts`), que `addedUp` suma para un grupo con los dólares en el mismo orden.
- `summary.ts`: la tendencia sale de `bucketCounts` en un recorrido; los pendientes leen el día de cada entrada de la memoria una vez por vista (`waitingOf`, `pendingAt`), no una por tramo; `statsView` cuenta una vez lo de cada cambio del carril en el periodo y de ahí salen el resumen y «Personas y agentes».
- `people.ts`: suma lo de cada cambio de cada persona, agente y modelo (`addedUp`).
- `rhythm.ts`, `quality.ts`, `cost.ts`: reparten por tramos con `rangeFinder`; «Calidad» recorre las verificaciones una vez para los tramos y para los cambios con más fallos, y no crea conjuntos para los cambios sin tests de contrato.
- `flow.ts`: usa `closedDay` y el día de cada aprobación, y no crea un conjunto para un cambio sin sesiones.

El prototipo de todo esto, en el scratchpad, deja AC8 en unos 105 ms con cobertura (unos 83 sin ella, frente a 180), pasa los 52 tests de `test/stats/` y da el mismo JSON que `main`, byte a byte, en 840 vistas (6 semillas × 140 cortes) sobre 1.500 cambios aleatorios con todos los eventos, líneas desordenadas e inválidas, retros y memoria. Lo que queda son el propio test (unos 20 ms), `statsRow` (unos 22) y el arranque en frío de la primera vista. Saltar los cambios que no viven en el periodo solo ahorraba 8 ms más y cambiaba qué cuenta como vivo, así que no entra.

## Archivos

- modificar packages/core/src/stats/rows.ts — un recorrido por las líneas, la hora en milisegundos y los días de cierre y de cada aprobación
- modificar packages/core/src/stats/period.ts — `dayOf` acepta milisegundos; `rangeFinder` busca el tramo de un día
- modificar packages/core/src/stats/flow.ts — lee los días nuevos de la fila; sin conjunto para un cambio sin sesiones
- modificar packages/core/src/stats/counts.ts — un recuento por cambio para el periodo, los tramos y cada cambio, y `addedUp`
- modificar packages/core/src/stats/summary.ts — tendencia en un recorrido, pendientes leídos una vez, lo de cada cambio contado una vez
- modificar packages/core/src/stats/people.ts — suma lo de cada cambio de cada persona, agente y modelo
- modificar packages/core/src/stats/rhythm.ts — el tramo de cada día con `rangeFinder` y el día de cierre de la fila
- modificar packages/core/src/stats/quality.ts — tramos con `rangeFinder`, verificaciones en un recorrido, sin conjuntos de más
- modificar packages/core/src/stats/cost.ts — tramos con `rangeFinder`
- modificar docs/ARCHITECTURE.md — la tendencia del panel la cuenta `bucketCounts` en un solo recorrido

## Tareas

- [x] T1: Una fila por cambio en un solo recorrido por sus líneas, con el día de cada hecho
  - files: packages/core/src/stats/rows.ts, packages/core/src/stats/period.ts, packages/core/src/stats/flow.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/stats && pnpm --filter @baquia-dev/specty exec vitest run test/stats.test.ts test/server/stats.test.ts test/server/stats-changes.test.ts test/server/stats-export.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm exec biome check packages/core/src/stats && pnpm knip
  - type: perf
- [x] T2: Cada sección reparte sus hechos por los días o semanas de «Ritmo» sin recorrer el calendario
  - files: packages/core/src/stats/period.ts, packages/core/src/stats/rhythm.ts, packages/core/src/stats/quality.ts, packages/core/src/stats/cost.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/stats && pnpm --filter @baquia-dev/specty exec vitest run test/stats.test.ts test/server/stats.test.ts test/server/stats-changes.test.ts test/server/stats-export.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm exec biome check packages/core/src/stats && pnpm knip
  - type: perf
- [x] T3: El panel cuenta cada hecho una vez por sección, no una vez por tramo ni por grupo
  - files: packages/core/src/stats/counts.ts, packages/core/src/stats/summary.ts, packages/core/src/stats/people.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/stats && pnpm --filter @baquia-dev/specty exec vitest run test/stats.test.ts test/server/stats.test.ts test/server/stats-changes.test.ts test/server/stats-export.test.ts && pnpm typecheck && pnpm exec biome check packages/core/src/stats && pnpm knip
  - type: perf
- [x] T4: La arquitectura dice cómo cuenta el panel su tendencia
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: grep -q "bucketCounts" docs/ARCHITECTURE.md
  - type: docs

## Riesgos

- R1: Un recorrido unificado que cuente distinto alguna cifra en un caso raro (líneas desordenadas, eventos desconocidos, varios costes de un cambio en tramos distintos). Mitigación: los tests de `test/stats/` y del servidor cubren cada sección, y antes de aceptar se repite la comparación del JSON de `statsView` y de las filas de `statsRow` entre `main` y el cambio sobre cambios aleatorios.
- R2: Que la mejora no baste en un runner muy cargado (A1). Mitigación: se mide AC8 antes y después en este Mac, con y sin cobertura, y si el CI vuelve a fallar con estos números el siguiente paso es mirar la carga del runner, no el umbral.

## Cierre

### Resumen

La agregación del panel recorre cada hecho una vez por sección: `statsRow` lee las líneas una vez y trae el día de cierre y el de cada aprobación; la tendencia cuenta todos sus tramos en un recorrido (`bucketCounts`); lo de cada cambio en el periodo se cuenta una vez (`ownCounts`) y lo suman los indicadores y «Personas y agentes» (`addedUp`); los pendientes leen la memoria una vez por vista; «Ritmo», «Calidad», «Coste» y la tendencia encuentran el tramo de un día con `rangeFinder` y no con un mapa de cada día del calendario. AC8, sin tocarlo, pasa en este Mac de unos 224 ms a unos 96 ms con cobertura (cinco medidas alternas: 217–232 frente a 94–103) y de unos 160 a unos 72 sin ella. Con la peor proporción vista en el CI (5,4 veces este Mac), quedaría en torno a 520 ms. AC2: el JSON de `statsView` es idéntico byte a byte al de `main` en 1.120 vistas (8 semillas × 140 cortes: los cuatro periodos y uno inválido, con y sin persona, agente, modelo o carril) sobre 1.500 cambios aleatorios por semilla, con todos los eventos, líneas desordenadas e inválidas, retros, costes con decimales y memoria; las filas de `statsRow` también, salvo los dos días nuevos. Pasan los 52 tests de `packages/core/test/stats/` y los del panel en el servidor.

### Desviaciones

- La spec propuesta en la revisión 1 tenía tres tareas; `propose` avisó de que T2 tocaba 7 archivos y de que la última tarea de código no comprobaba los tipos de todo el repo, así que la revisión 2 la partió en T2 (tramos con `rangeFinder`) y T3 (recuentos por cambio), con `pnpm typecheck` en la verificación de T3.
- `bucketCounts` devuelve cada tramo con sus días junto a sus cifras, en vez de una lista paralela a los tramos, para que la tendencia no tenga que emparejarlas por índice.

### Decisiones

- No se salta ningún cambio por su vida (`lived`): solo ahorraba unos 8 ms más y habría cambiado lo que cuenta un cambio cuyas líneas no van en orden.
- `rows.ts` pasa de 300 líneas de código (328): sigue siendo una responsabilidad (la fila de un cambio a partir de su auditoría) y crece por el `Map` de una función por evento, así que no se parte.
- Los dólares se suman como antes (lo de cada cambio y luego esas sumas en el orden de las filas), para que el redondeo sea el mismo y el JSON idéntico.

### Pendientes

- Confirmar en el CI (Linux y Windows con Node 22) que AC8 pasa con margen tras subir `main`.
