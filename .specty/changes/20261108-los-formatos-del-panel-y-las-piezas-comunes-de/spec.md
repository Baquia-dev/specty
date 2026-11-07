---
kind: standard
---

# Los formatos del panel y las piezas comunes de las gráficas se comparten

## Objetivo

El panel repite sus formatos: `shortDay` está copiado en cinco secciones (`dashboard-page.ts`, `dashboard-summary.ts`, `dashboard-rhythm.ts`, `dashboard-quality.ts` y `dashboard-cost.ts`), y el porcentaje y los dólares en `dashboard-summary.ts`, `dashboard-people.ts` y `dashboard-quality.ts` (P327). Sus gráficas repiten sus piezas: la escala de pasos redondos (`niceScale` de `column-chart.ts` y `lineScale` de `line-chart.ts`), el teclado de las marcas (`move`, en las cinco gráficas con la minigráfica de `stat-tile.ts`) y, entre `line-chart.ts` y `stat-tile.ts`, los tramos de la línea y el texto con espacios normales (P342). Cada pieza pasa a un módulo que usan todos, para que un arreglo no tenga que hacerse varias veces. Lo que el panel muestra y cómo responde al teclado no cambia.

## Fuera de alcance

- `packages/ui/src/data/` (dividir `server.ts`, la descarga común `download.ts`), `history/history-export.ts` y `dashboard/dashboard-export.ts`: son otros cambios de la misma limpieza (P345, P323, P344).
- Los formatos repetidos en core (P328).
- Los `Intl.NumberFormat` que `dashboard-cost.ts` y `dashboard-changes.ts` crean una sola vez para toda una tabla, y los formatos de fuera del panel (`sessions/sessions-page.ts`, `inbox/`, `catalog/`): no son copias de estas funciones.
- En `dashboard-cost.ts` y `dashboard-quality.ts`, todo lo que no sea un formato: la celda del cambio y la columna «Sesiones» los cambia otra épica.
- La altura de cada valor (`yOf`) y la posición del tooltip, que son distintas en cada gráfica.

## Supuestos

- A1: Las cinco copias de `shortDay` son iguales, y el porcentaje (como mucho 1 decimal, o 0 en la variación de un indicador) y los dólares (`currency: "USD"`) usan en cada sección las mismas opciones de `Intl.NumberFormat`.
- A2: `niceScale` es la escala de `lineScale` desde cero, con pasos enteros cuando todos los valores lo son: una sola función da para las dos los mismos ticks, redondeados a la millonésima.
- A3: El teclado de cada gráfica cuenta sus marcas por sus etiquetas, filas o partes, no por sus botones, y solo la lista de barras añade ↓ y ↑; la función común recibe esa cuenta y esa opción.

## Criterios de aceptación

- AC1: CUANDO se ejecutan los tests del panel, de sus gráficas y del catálogo ENTONCES pasan sin cambiar ninguno.
  - test: manual
- AC2: CUANDO se busca `shortDay` y los formatos `style: "percent"` y `currency: "USD"` en las secciones del panel que los repetían ENTONCES cada uno está definido solo en `packages/ui/src/dashboard/dashboard-format.ts`.
  - test: manual
- AC3: CUANDO se busca en `packages/ui/src/components/charts` la escala de pasos redondos, el teclado de las marcas, `plain` y `stretchesOf` ENTONCES cada uno está definido solo en `packages/ui/src/components/charts/chart-parts.ts`.
  - test: manual

## Diseño

- `dashboard/dashboard-format.ts`, nuevo: `shortDay(day, lang)` («9 oct» u «Oct 9» de un día local AAAA-MM-DD), `percent(value, lang, digits)` y `usd(value, lang)`. Las secciones importan los que usan en vez de su copia; `dashboard-quality.ts` hace su formato de la gráfica con `percent`.
- `components/charts/chart-parts.ts`, nuevo, lo que las gráficas calculan igual:
  - `roundScale(low, highest, { fixed, whole })`: unos cuatro pasos redondos (1, 2 o 5 × 10ⁿ) desde `low` hasta `fixed` o hasta el primer paso que alcanza `highest`, enteros con `whole`; da `{ low, high, ticks }`. La gráfica de columnas la usa desde cero y la de línea con su mínimo y su máximo.
  - `moveFocus(event, { current, count, marks, vertical })`: las flechas llevan el foco a la marca siguiente o a la anterior, Inicio a la primera y Fin a la última; con `vertical`, también ↓ y ↑. Cada `move` de las cinco gráficas la llama con su cuenta.
  - `plain(text)`, `stretchesOf(points)` y `linePath(run)`: el texto con espacios normales, los tramos de puntos con valor y el trazo de un tramo, que comparten `line-chart.ts` y `stat-tile.ts`.
- Ninguna API pública cambia: los módulos nuevos solo los usan el panel y sus gráficas.

## Archivos

- crear packages/ui/src/dashboard/dashboard-format.ts — los formatos del panel: día corto, porcentaje y dólares
- modificar packages/ui/src/dashboard/dashboard-page.ts — usa `shortDay`
- modificar packages/ui/src/dashboard/dashboard-summary.ts — usa `shortDay`, `percent` y `usd`
- modificar packages/ui/src/dashboard/dashboard-rhythm.ts — usa `shortDay`
- modificar packages/ui/src/dashboard/dashboard-people.ts — usa `percent` y `usd`
- modificar packages/ui/src/dashboard/dashboard-quality.ts — usa `shortDay` y `percent`
- modificar packages/ui/src/dashboard/dashboard-cost.ts — usa `shortDay`
- crear packages/ui/src/components/charts/chart-parts.ts — la escala, el teclado y los tramos de línea comunes
- modificar packages/ui/src/components/charts/column-chart.ts — usa `roundScale` y `moveFocus`
- modificar packages/ui/src/components/charts/line-chart.ts — usa `roundScale`, `moveFocus`, `plain`, `stretchesOf` y `linePath`
- modificar packages/ui/src/components/charts/bar-list.ts — usa `moveFocus`
- modificar packages/ui/src/components/charts/segmented-bar.ts — usa `moveFocus`
- modificar packages/ui/src/components/charts/stat-tile.ts — usa `moveFocus`, `plain`, `stretchesOf` y `linePath`

## Tareas

- [x] T1: Los formatos del panel, en su propio módulo
  - files: packages/ui/src/dashboard/dashboard-format.ts, packages/ui/src/dashboard/dashboard-page.ts, packages/ui/src/dashboard/dashboard-summary.ts, packages/ui/src/dashboard/dashboard-rhythm.ts, packages/ui/src/dashboard/dashboard-people.ts, packages/ui/src/dashboard/dashboard-quality.ts, packages/ui/src/dashboard/dashboard-cost.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/dashboard/dashboard-page.test.ts --include src/dashboard/dashboard-summary.test.ts --include src/dashboard/dashboard-sections.test.ts --include src/dashboard/dashboard-flow-quality.test.ts --include src/dashboard/dashboard-cost-scope-memory.test.ts && pnpm lint && pnpm sources
  - type: refactor
- [x] T2: Las piezas comunes de las gráficas, en su propio módulo
  - files: packages/ui/src/components/charts/chart-parts.ts, packages/ui/src/components/charts/column-chart.ts, packages/ui/src/components/charts/line-chart.ts, packages/ui/src/components/charts/bar-list.ts, packages/ui/src/components/charts/segmented-bar.ts, packages/ui/src/components/charts/stat-tile.ts
  - ac: AC1, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/components/charts/charts.test.ts --include src/components/charts/stat-tile.test.ts --include src/catalog/catalog.test.ts --include src/dashboard/dashboard-page.test.ts --include src/dashboard/dashboard-summary.test.ts --include src/dashboard/dashboard-sections.test.ts --include src/dashboard/dashboard-flow-quality.test.ts --include src/dashboard/dashboard-cost-scope-memory.test.ts && pnpm typecheck && pnpm lint && pnpm sources && pnpm knip
  - type: refactor

## Riesgos

- R1: Una escala común podría dar otros ticks por el redondeo de los decimales. Mitigación: los ticks se redondean a la millonésima como antes, y los tests de las gráficas comprueban los del eje.
