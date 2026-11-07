---
kind: standard
epic: 20261107-panel-de-specty
slice: C7
---

# El panel exporta los cambios del corte a CSV o JSON

## Objetivo

El «Panel» de `specty ui` resume un corte en cifras y lista sus cambios, pero no deja llevárselos a otra herramienta. Con este cambio, «Exportar», al final de la fila de filtros, descarga en CSV o en JSON una fila por cambio del corte que se ve, con sus cifras. Así se puede abrir en una hoja de cálculo o leer con un script.

## Fuera de alcance

- Las demás secciones del panel (C2 a C4) y `specty stats` (C6): el archivo lleva los cambios del corte, no los agregados de las secciones.
- Exportar la búsqueda, el orden o la página de la tabla «Cambios»: el archivo lleva el corte entero, en el orden por defecto de la tabla.
- Otros formatos (`.xlsx`, Markdown) y elegir las columnas.
- La exportación con la fuente del prototipo (`ng serve` sin servidor), que no da el panel.
- Pasar `GET /api/stats` a `server/stats.ts`: lo hace C2.

## Supuestos

- A1: El archivo lleva los mismos cambios que la tabla «Cambios» sin búsqueda: los del corte (`period`, `who` y `kind`) cuya vida toca el periodo, abiertos o cerrados, en su orden por defecto (los cerrados más recientes primero, los abiertos al final y los empates por id, el más reciente primero). Cada fila da las cifras de todo el cambio, como la tabla. Se calcula con `statsChanges` de `stats/table.ts`, sin límite de página, y cada fila se completa con la persona, el modelo, la creación y las verificaciones de su `StatsListed`.
  - impacto: medio
- A2: Las columnas son, en este orden, el id, el título, el carril, el tamaño, la persona, el agente, el modelo, la creación, el cierre, las tareas completadas, el ciclo, las verificaciones de tarea, las fallidas y el coste medido. En JSON van con las claves `id`, `title`, `kind`, `size`, `person`, `agent`, `model`, `created`, `closed`, `tasks`, `cycle`, `verifications`, `failed` y `cost`, con los valores de la API: fechas ISO, el carril y el agente por su id, el ciclo en ms y el coste en dólares, y sin las claves que faltan. El archivo JSON es `{ query, range, changes }`, como la respuesta de `/api/stats/changes`, con dos espacios de sangría.
  - impacto: medio
- A3: El CSV sigue el RFC 4180: comas, comillas dobles solo donde hace falta (con las internas duplicadas), CRLF al final de cada línea y una fila de encabezados. Va en UTF-8 con BOM, para que Excel lea los acentos. Los números van con punto decimal: el ciclo en horas y el coste en dólares, los dos con dos decimales. Las fechas van como `AAAA-MM-DD HH:MM` en la hora local del servidor, que las hojas de cálculo leen como fecha. El carril va con el nombre de su insignia (Feature, Quick, Épica, Spike, Manual), el agente con su nombre (`AGENT_NAMES`, o su id si no lo conoce) y un dato que falta deja la celda vacía. Una celda que empieza por `=`, `+`, `-`, `@`, tabulador o retorno de carro lleva delante un apóstrofo, para que la hoja la muestre como texto y no la ejecute como fórmula. Numbers, LibreOffice y Google Sheets lo abren directamente; Excel con configuración regional española, que espera punto y coma, puede necesitar «Datos > Desde texto/CSV».
  - impacto: alto
- A4: Los encabezados del CSV y los nombres de los carriles van en el idioma que pide la UI con `lang`, o en el del repositorio por defecto. Sus textos van en `packages/core/src/cards/stats-export.ts`. El JSON es igual en los dos idiomas.
  - impacto: bajo
- A5: `GET /api/stats/export` recibe el corte (`period`, `who` y `kind`, como `/api/stats`), `format` (`csv`, por defecto, o `json`) y `lang`; lo que no entiende toma su valor por defecto. Responde 200 con `Content-Type: text/csv; charset=utf-8` o `application/json; charset=utf-8`, `Content-Disposition: attachment; filename="specty-stats-<desde>-<hasta>.<csv|json>"` (los días del periodo) y las cabeceras de seguridad de siempre (`SAFE`). Sin la sesión, responde 403. Es una lectura, así que también lo da el servidor que arrancó el agente.
  - impacto: alto
- A6: «Exportar» es un menú con el icono de descarga, como el de Historial (`sp-menu`), al final de la fila de filtros, con «CSV» y «JSON». Aparece cuando el panel está a la vista, también con un corte sin cambios (el archivo trae solo los encabezados), y exporta el corte que respondió la fuente. La UI lo pide a la fuente (`SpectyData.statsExport`), que por defecto no da nada. El servidor lo pide a `/api/stats/export` y lee el cuerpo como bytes, para no perder el BOM. El nombre sale del `Content-Disposition` y, sin él, es `specty-stats.<formato>`. Si la fuente no da la exportación o falla, un aviso de error lo dice y no se descarga nada.
  - impacto: medio
- A7: Para chocar poco con C2, que trabaja a la vez en el panel, y no pasar de tamaño L, el menú va en su propio componente (`dashboard/dashboard-export.ts`) y la petición de la UI en `data/stats-export.ts`. El endpoint va junto a la página de la tabla, en `server/stats-changes.ts`, porque los dos leen las mismas filas guardadas de cada registro. `dashboard-page.ts`, `server/api.ts`, `data/source.ts` y `data/server.ts` solo los enlazan. La función que entrega un archivo al navegador (`save`, privada en `history/history-export.ts`) se repite en `dashboard-export.ts`, en lugar de pasar a un módulo común que sumaría dos archivos más.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO la persona pulsa «Exportar» en la fila de filtros del panel y elige CSV ENTONCES descarga `specty-stats-<desde>-<hasta>.csv` con una fila de encabezados y una fila por cambio del corte que ve (los que lista «Cambios» sin búsqueda), los cerrados más recientes primero. Cada fila lleva su id, título, carril, tamaño, persona, agente, modelo, creación, cierre, tareas, ciclo, verificaciones, verificaciones fallidas y coste.
- AC2: CUANDO abre ese CSV en una hoja de cálculo ENTONCES cada dato queda en su columna y con sus acentos: UTF-8 con BOM, comas y comillas según el RFC 4180 (también con comas o comillas en el título), números con punto decimal, fechas `AAAA-MM-DD HH:MM` y celdas vacías donde falta el dato. Un título que empieza por `=`, `+`, `-` o `@` se ve como texto, no como fórmula.
- AC3: CUANDO elige JSON ENTONCES descarga `specty-stats-<desde>-<hasta>.json` con el corte, su periodo y una fila por cambio con las mismas cifras: fechas ISO, el ciclo en ms y el coste en dólares.
- AC4: CUANDO la UI pide `GET /api/stats/export` con el corte, el formato y el idioma ENTONCES el servidor responde el archivo con su `Content-Type` y su `Content-Disposition`. Lo que no entiende toma su valor por defecto (CSV, 30 días, todos y el idioma del repositorio) y, sin la sesión, responde 403.
- AC5: CUANDO la fuente no da la exportación o no se puede leer ENTONCES el panel lo dice en un aviso de error y no descarga nada.
- AC6: CUANDO la UI está en inglés ENTONCES el botón, los avisos y los encabezados y carriles del CSV salen en inglés.

## Diseño

- Core, `stats/export.ts`: `StatsExportFormat` (`csv` o `json`); `statsExportQuery(params, lang)` entiende `format` y `lang`, o toma sus valores por defecto (`StatsExportQuery`); `statsExport({ rows, today, query, format, lang })` da `StatsExportFile`, con `name`, `type` y `content` (texto). Las filas (`StatsExportRow`) salen de `statsChanges` con `limit: Infinity` y se completan con su `StatsListed` por id. `cards/stats-export.ts` da los encabezados de cada columna y los nombres de los carriles en cada idioma. `index.ts` exporta las funciones y los tipos.
- CLI: `server/stats-changes.ts` suma `sendStatsExport(response, session, params)`, que lee `plainRecords` con la misma fila guardada de cada registro (`listedOf`), arma el archivo con hoy como `localDay(session.environment.now())` y lo envía con `SAFE`, su `Content-Type` y su `Content-Disposition`. `server/api.ts` lo llama para `/api/stats/export`, tras comprobar el origen y la sesión.
- UI, datos: `data/stats-export.ts` define `StatsExportParams` (el corte, como `StatsParams`, más `format` y `lang`) y `fetchStatsExport(params)`. Esta pide `/api/stats/export` solo con las partes del corte que hay, lee el cuerpo como bytes y el nombre del `Content-Disposition` y da un `Download` (`data/export.ts`). Un 403 es `NO_SESSION` y otro error, `answered(status)`. `data/source.ts` añade `statsExport(params)`, que por defecto no da nada, y `data/server.ts` lo enlaza con `fetchStatsExport`.
- UI, `dashboard/dashboard-export.ts` (`sp-dashboard-export`, con la entrada `query`): un `sp-menu` «Exportar» con «CSV» y «JSON». Al elegir uno, pide `statsExport` con el corte, el formato y el idioma de la UI y lo entrega al navegador (`save`). Si no da nada, el aviso dice «Esta fuente no da la exportación del panel.»; si falla, «No se pudo exportar el panel.» con el motivo. `dashboard-page.ts` lo pone al final de la fila de filtros, con `data-export`, cuando el panel está a la vista.
- Tests: `core/test/stats/export.test.ts` (AC1 a AC3 y AC6), `cli/test/server/stats-export.test.ts` (AC4), `ui/src/data/stats-export.test.ts` (AC4 y AC5) y `ui/src/dashboard/dashboard-export.test.ts` (AC1, AC3, AC5 y AC6). El de la página usa `statsView` de core con cero filas para el panel, así no depende de la forma de `StatsView`, que C2 amplía.

## Archivos

- crear packages/core/src/stats/export.ts — las filas de la exportación, el CSV, el JSON, su nombre y su tipo
- crear packages/core/src/cards/stats-export.ts — los encabezados del CSV y los nombres de los carriles, en español y en inglés
- modificar packages/core/src/index.ts — exporta la función y los tipos de la exportación
- crear packages/core/test/stats/export.test.ts — qué cambios lleva el archivo, sus columnas y el formato del CSV y del JSON
- modificar packages/cli/src/server/stats-changes.ts — `GET /api/stats/export`, con las mismas filas que la tabla
- modificar packages/cli/src/server/api.ts — registra `/api/stats/export`
- crear packages/cli/test/server/stats-export.test.ts — el archivo del corte con su tipo, su nombre y sus valores por defecto
- modificar docs/ARCHITECTURE.md — `GET /api/stats/export` en §15
- crear packages/ui/src/data/stats-export.ts — la petición de la exportación al servidor
- crear packages/ui/src/data/stats-export.test.ts — lo que pide al servidor y cómo lee su respuesta
- modificar packages/ui/src/data/source.ts — `statsExport()` de la fuente de datos
- modificar packages/ui/src/data/server.ts — enlaza `statsExport()` del servidor
- crear packages/ui/src/dashboard/dashboard-export.ts — el menú «Exportar» del panel
- crear packages/ui/src/dashboard/dashboard-export.test.ts — el menú en la fila de filtros, la descarga y los avisos, en español y en inglés
- modificar packages/ui/src/dashboard/dashboard-page.ts — pone «Exportar» al final de la fila de filtros
- modificar docs/ui.md — «Exportar» en el panel

## Tareas

- [x] T1: El core arma el archivo de los cambios del corte en CSV o JSON
  - files: packages/core/src/stats/export.ts, packages/core/src/cards/stats-export.ts, packages/core/src/index.ts, packages/core/test/stats/export.test.ts
  - ac: AC1, AC2, AC3, AC6
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/stats/export.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint
- [x] T2: `GET /api/stats/export` responde el archivo del corte con su tipo y su nombre
  - files: packages/cli/src/server/stats-changes.ts, packages/cli/src/server/api.ts, packages/cli/test/server/stats-export.test.ts, docs/ARCHITECTURE.md
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server/stats-export.test.ts test/server/stats-changes.test.ts && pnpm --filter @baquia-dev/specty typecheck && pnpm lint
- [x] T3: «Exportar» en la fila de filtros del panel pide el archivo a la fuente y lo descarga
  - files: packages/ui/src/data/stats-export.ts, packages/ui/src/data/stats-export.test.ts, packages/ui/src/data/source.ts, packages/ui/src/data/server.ts, packages/ui/src/dashboard/dashboard-export.ts, packages/ui/src/dashboard/dashboard-export.test.ts, packages/ui/src/dashboard/dashboard-page.ts, docs/ui.md
  - ac: AC1, AC3, AC4, AC5, AC6
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/stats-export.test.ts --include src/dashboard/dashboard-export.test.ts --include src/dashboard/dashboard-page.test.ts && pnpm typecheck && pnpm lint && pnpm knip

## Riesgos

- R1: Una celda de texto puede llevar una fórmula que la hoja de cálculo ejecutaría al abrir el archivo (inyección de CSV). Mitigación: toda celda que empieza por `=`, `+`, `-`, `@`, tabulador o retorno de carro lleva un apóstrofo delante, y un test lo comprueba.
- R2: Excel con configuración regional española espera punto y coma y coma decimal, así que al abrir el archivo con doble clic puede ponerlo todo en una columna. Mitigación: el archivo sigue el estándar (RFC 4180, UTF-8 con BOM), que leen bien el resto de hojas de cálculo y la importación de Excel; si la persona lo pide, un cambio aparte puede añadir el separador por idioma.
- R3: C2 toca a la vez `dashboard-page.ts`, `data/source.ts`, `data/server.ts` y `server/api.ts`. Mitigación: aquí solo se enlazan el menú, el método y la ruta; lo demás va en archivos propios.
- R4: `data/server.ts` ya pasa de 300 líneas de código. Mitigación: la petición va en `data/stats-export.ts`, y `server.ts` solo suma el método que la enlaza.

## Cierre

### Resumen

El «Panel» de `specty ui` tiene «Exportar» al final de la fila de filtros (`dashboard/dashboard-export.ts`): un menú con «CSV» y «JSON» que descarga `specty-stats-<desde>-<hasta>.csv` o `.json`, con una fila por cambio del corte que se ve. Son los mismos cambios que la tabla «Cambios» sin búsqueda, cada uno con su id, título, carril, tamaño, persona, agente, modelo, creación, cierre, tareas, ciclo, verificaciones, fallidas y coste. El core arma el archivo (`stats/export.ts`: `statsExport` y `statsExportQuery`), con los encabezados y los carriles en español y en inglés (`cards/stats-export.ts`). El servidor lo da en `GET /api/stats/export` (`sendStatsExport` en `server/stats-changes.ts`), con su `Content-Type` y su `Content-Disposition`. La UI lo pide a la fuente (`SpectyData.statsExport`; `data/stats-export.ts` en el servidor), y si la fuente no lo da o falla, un aviso lo dice. Lo cuentan `docs/ui.md` (Panel, «Exportar») y `docs/ARCHITECTURE.md` §15.

### Desviaciones

- `server/api.ts`: la respuesta de `/api/session` pasó a su propia función (`sendSession`), porque con la ruta nueva `readApi` superaba la complejidad máxima (10).
- El test aprobado AC4 de `data/stats-export.test.ts` se desbloqueó (S1, decidido por la persona). Sus bytes esperados salían del `TextEncoder` de jsdom, de otro reino que el `Uint8Array` global, así que ninguna implementación podía pasar a la vez su `toEqual` y su `instanceof`. Ahora se crean con `Uint8Array.from`.

### Decisiones

- Las filas salen de `statsChanges` (`stats/table.ts`) sin límite de página y en su orden por defecto, completadas con la persona, el modelo, la creación y las verificaciones de su `StatsListed`. Así el archivo lista exactamente los cambios de la tabla.
- El CSV sigue el RFC 4180, va en UTF-8 con BOM y lleva fechas `AAAA-MM-DD HH:MM` locales, el ciclo en horas y el coste en dólares con dos decimales, el carril con el nombre de su insignia y el agente con su nombre. Una celda que empieza como una fórmula lleva un apóstrofo delante. El JSON usa los valores de la API (fechas ISO, ciclo en ms, carril y agente por su id) y omite las claves que faltan.
- La UI lee el cuerpo como bytes, porque `response.text()` quitaría el BOM. El nombre sale del `Content-Disposition` y, sin él, es `specty-stats.<formato>`.
- «Exportar» aparece siempre que el panel está a la vista, también con un corte sin cambios (el archivo trae solo los encabezados).
- Para quedarse en tamaño L, el endpoint va junto a la página de la tabla en `server/stats-changes.ts`, y `save` se repite en `dashboard-export.ts` en lugar de pasar a un módulo común.

### Pendientes

- `save`, que entrega un archivo al navegador, está repetida en `history/history-export.ts` y `dashboard/dashboard-export.ts`: puede pasar a un módulo común (`data/download.ts`).
- `packages/ui/src/data/server.ts` tiene 414 líneas de código (aviso a partir de 300): las peticiones del panel (`stats`, `statsChanges` y `statsExport`) podrían ir a un módulo propio.
- Excel con configuración regional española espera punto y coma en el CSV: si la persona lo pide, el separador puede ir según el idioma.
