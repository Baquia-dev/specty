---
kind: standard
---

# Las peticiones del panel y la descarga de archivos van a módulos propios de la UI

## Objetivo

Limpieza de código de la UI sin cambios de comportamiento. `data/server.ts` tiene 414 líneas de código (aviso a partir de 300) y deja las tres peticiones del panel (`stats`, `statsChanges` y `statsExport`), con sus comprobaciones, en un módulo propio, `data/server-stats.ts` (P345, P323). `save`, que entrega un archivo al navegador y está repetida en las exportaciones de «Historial» y del «Panel», pasa a `data/download.ts` (P344). La tabla «Cambios» del panel (`dashboard/dashboard-changes.ts`, 309 líneas de código) deja sus columnas y la forma de escribir cada fila en un módulo puro, `dashboard/dashboard-table.ts` (P323).

## Fuera de alcance

- Los formatos repetidos del panel (P327, `dashboard/dashboard-format.ts`) y las piezas comunes de las gráficas (P342, `components/charts/`): los lleva el cambio 20261108-los-formatos-del-panel-y-las-piezas-comunes-de.
- Lo que repite el core en `people.ts` y `summary.ts` (P328): va aparte.
- Bajar `data/server.ts` del aviso de 300 líneas: tras sacar las peticiones del panel le quedan unas 380. Sus otras partes (las lecturas de la trazabilidad y el flujo de eventos) quedan como pendiente, para dividirlas por responsabilidad en otro cambio.
- Cambiar peticiones, parámetros, respuestas, textos o la apariencia de la UI.

## Supuestos

- A1: Las tres peticiones del panel van juntas en `data/server-stats.ts`, que sustituye a `data/stats-export.ts`: la exportación ya era una petición del panel al servidor local y su tipo `StatsExportParams` sigue en el mismo módulo. `ServerData` sigue siendo la fuente de datos, y sus métodos `stats`, `statsChanges` y `statsExport` solo llaman a esas funciones.
  - impacto: medio
- A2: `isStatsView` (hoy en `server.ts`, con `FIGURES`) e `isStatsChangesPage` (hoy en `server-answers.ts`) pasan a `server-stats.ts` sin exportarse. `server-answers.ts` exporta su `isText` para que la comprobación de la tabla lo use.
  - impacto: bajo
- A3: `save` pasa a `data/download.ts`, como propone P344, junto al tipo `Download` de `data/export.ts`, el archivo que dan las dos exportaciones.
  - impacto: bajo
- A4: Las columnas (`Column`, `COLUMNS`), la fila (`Row`) y `rowsOf` de la tabla «Cambios» no usan Angular y van a `dashboard/dashboard-table.ts`. El componente conserva la búsqueda, el orden, las páginas y la plantilla.
  - impacto: bajo
- A5: Ningún test cubre hoy `ServerData.stats` (`GET /api/stats`): se añade uno en `data/stats-source.test.ts` antes de moverla, para que el refactor tenga su contrato.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO la UI servida por `specty ui` pide las cifras del panel, una página de su tabla de cambios o su exportación ENTONCES hace las mismas peticiones que antes (`GET /api/stats`, `/api/stats/changes` y `/api/stats/export`, con los mismos parámetros) y da las mismas respuestas y los mismos errores: sin sesión, respuesta inesperada o el código de estado.
- AC2: CUANDO la persona exporta desde «Historial» o desde el «Panel» ENTONCES el navegador descarga el mismo archivo que antes, con su nombre y su tipo.
- AC3: CUANDO el «Panel» muestra la tabla «Cambios» ENTONCES sus columnas, su orden y el texto de cada celda son los de antes.

## Diseño

- `data/server-stats.ts` (nuevo, en lugar de `data/stats-export.ts`): `fetchStats`, `fetchStatsChanges` y `fetchStatsExport`, con `StatsExportParams` y las comprobaciones privadas `isStatsView` e `isStatsChangesPage`. Cada función conserva la forma actual de su petición: `fetchStats` solo con `period`, `who` y `kind`, y sin `?` cuando no hay ninguno; `fetchStatsChanges` y `fetchStatsExport` con los parámetros definidos. Un 403 da `NO_SESSION`. Una respuesta que no pasa la comprobación da `UNEXPECTED`, y la exportación da `answered(status)` cuando no es correcta.
- `data/server.ts`: `stats`, `statsChanges` y `statsExport` llaman a esas funciones; salen `FIGURES`, `isStatsView` y la importación de `isStatsChangesPage`.
- `data/download.ts` (nuevo): `save(download)`, el enlace con la URL del `Blob` que se revoca tras el clic. `history/history-export.ts` y `dashboard/dashboard-export.ts` la importan.
- `dashboard/dashboard-table.ts` (nuevo): `Direction`, `Column`, `COLUMNS`, `Row` y `rowsOf`, con `NONE`.

## Archivos

- crear packages/ui/src/data/server-stats.ts — las tres peticiones del panel al servidor local, con sus comprobaciones
- borrar packages/ui/src/data/stats-export.ts — su petición y su tipo pasan a `server-stats.ts`
- modificar packages/ui/src/data/server.ts — los métodos del panel llaman a `server-stats.ts`
- modificar packages/ui/src/data/server-answers.ts — sale `isStatsChangesPage` y exporta `isText`
- modificar packages/ui/src/data/source.ts — importa `StatsExportParams` de `server-stats.ts`
- modificar packages/ui/src/data/stats-source.test.ts — test de `ServerData.stats`, antes de moverla
- modificar packages/ui/src/data/stats-export.test.ts — importa `StatsExportParams` de `server-stats.ts`
- modificar packages/ui/src/dashboard/dashboard-export.test.ts — importa `StatsExportParams` de `server-stats.ts`
- crear packages/ui/src/data/download.ts — `save`, la descarga de un archivo en el navegador
- modificar packages/ui/src/dashboard/dashboard-export.ts — usa `save` de `data/download.ts`
- modificar packages/ui/src/history/history-export.ts — usa `save` de `data/download.ts`
- crear packages/ui/src/dashboard/dashboard-table.ts — las columnas y las filas de la tabla «Cambios», puras
- modificar packages/ui/src/dashboard/dashboard-changes.ts — usa las columnas y las filas de `dashboard-table.ts`
- modificar docs/ARCHITECTURE.md — las peticiones del panel están en `data/server-stats.ts`

## Tareas

- [x] T1: Test de la petición de las cifras del panel al servidor local
  - files: packages/ui/src/data/stats-source.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/stats-source.test.ts && pnpm lint
  - type: test
- [x] T2: Las tres peticiones del panel pasan a `data/server-stats.ts`
  - files: packages/ui/src/data/server-stats.ts, packages/ui/src/data/stats-export.ts, packages/ui/src/data/server.ts, packages/ui/src/data/server-answers.ts, packages/ui/src/data/source.ts, packages/ui/src/data/stats-export.test.ts, packages/ui/src/dashboard/dashboard-export.test.ts, docs/ARCHITECTURE.md
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/stats-source.test.ts --include src/data/stats-export.test.ts --include src/data/server.test.ts --include src/dashboard/dashboard-export.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: refactor
- [x] T3: `save` pasa a `data/download.ts`
  - files: packages/ui/src/data/download.ts, packages/ui/src/dashboard/dashboard-export.ts, packages/ui/src/history/history-export.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/dashboard/dashboard-export.test.ts --include src/history/history-export.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: refactor
- [x] T4: Las columnas y las filas de la tabla «Cambios» pasan a `dashboard/dashboard-table.ts`
  - files: packages/ui/src/dashboard/dashboard-table.ts, packages/ui/src/dashboard/dashboard-changes.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/dashboard/dashboard-changes.test.ts --include src/dashboard/dashboard-page.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: refactor

## Riesgos

- R1: El cambio paralelo de los formatos del panel (P327) puede tocar `rowsOf` en `dashboard-changes.ts` o las importaciones de las exportaciones. Mitigación: si choca al incorporar main, se conserva lo de los dos, con `rowsOf` en `dashboard-table.ts`.

## Cierre

### Resumen

Limpieza de la UI sin cambios de comportamiento:
- `data/server-stats.ts` (nuevo, en lugar de `data/stats-export.ts`): las tres peticiones del panel al servidor local (`fetchStats`, `fetchStatsChanges` y `fetchStatsExport`), con `StatsExportParams` y las comprobaciones `isStatsView` e `isStatsChangesPage`, que dejan de estar en `server.ts` y en `server-answers.ts`. `ServerData` solo las llama. `server.ts` baja de 414 a 387 líneas de código y `server-answers.ts`, de 322 a 306.
- `data/download.ts` (nuevo): `save`, que antes repetían `history/history-export.ts` y `dashboard/dashboard-export.ts`.
- `dashboard/dashboard-table.ts` (nuevo, puro): las columnas, la fila y `rowsOf` de la tabla «Cambios»; `dashboard-changes.ts` baja de 309 a 240 líneas de código.
- Test nuevo de `ServerData.stats` (`GET /api/stats`) en `stats-source.test.ts`, que no tenía ninguno. AC2 y AC3 los cubren los tests que ya existían: `dashboard-export.test.ts`, `history-export.test.ts` y `dashboard-changes.test.ts`.
- ARCHITECTURE nombra `data/server-stats.ts` junto a `data/server-answers.ts`.

### Desviaciones (respecto al plan)

- Ninguna.

### Decisiones

- `isText` de `server-answers.ts` pasa a exportarse, para que la comprobación de la tabla del panel la use desde `server-stats.ts` en vez de repetirla.
- `Row` queda sin exportar en `dashboard-table.ts`: solo la usa `rowsOf`, y el componente la recibe por inferencia.

### Pendientes

- `packages/ui/src/data/server.ts` sigue con 387 líneas de código (aviso a partir de 300) y `data/server-answers.ts`, con 306. Candidatos por responsabilidad: las lecturas de la trazabilidad (`traceFiles`, `trace`, `testCode` y `traced`, con sus tres mensajes) y el flujo de eventos (`listen`, `follow`, `closeIfIdle`, `watchRun`, `watchActions` y `readRun`).
