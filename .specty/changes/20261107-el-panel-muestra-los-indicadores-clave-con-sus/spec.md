---
kind: standard
epic: 20261107-panel-de-specty
slice: C1
---

# El panel muestra los indicadores clave con sus filtros

## Objetivo

Hoy lo que pasó con Specty solo se ve cambio a cambio. Con este corte, `specty ui` tiene la página «Panel» (`/dashboard`, con su enlace entre Sesiones y Configuración), con la cabecera, la fila de filtros (Periodo, Ver por y Carril) y la fila de seis indicadores de la maqueta «A · Informe en una página»: cambios cerrados, tareas completadas, ciclo mediano, verificaciones que pasan, coste medido y pendientes abiertos. Cada uno lleva su variación frente al periodo anterior. El core los calcula de los cambios abiertos y archivados y de la memoria, y el servidor los sirve en `GET /api/stats`. Es la base sobre la que los demás cortes añaden sus secciones.

## Fuera de alcance

- Las secciones Ritmo, Personas y agentes, Flujo y esperas, Calidad, Coste y tokens, Alcance e integraciones, Memoria y Cambios, la exportación y `specty stats` (C2 a C7).
- Las minigráficas de los indicadores, el componente `components/charts/stat-tile.ts` y su página del catálogo, la paleta de las gráficas y las series por día o por semana: llegan con las gráficas, en C2.
- Los datos de ejemplo del prototipo (`data/fixtures.ts`): con `ng serve` sin servidor, la página dice que su fuente no da el panel.
- Exportar el panel por la entrada ligera del core: la UI solo importa sus tipos.
- `server/stats.ts`: mientras `GET /api/stats` sea la única lectura del panel, va en `server/api.ts`, como `configView`.

## Supuestos

- A1: `GET /api/stats?period=&who=&kind=` lee los cambios abiertos y archivados de todas las worktrees con su auditoría (`changeRecords`) y la memoria (`readMemory`), no escribe nada y responde lo que calcula una función pura del core (`statsView`). Un valor que no entiende toma el de por defecto, y la respuesta dice el corte que usó.
  - impacto: alto
- A2: Cada cambio cuenta para una sola persona, un agente y un modelo. La persona es `approved.by` de su estado, o, si falta, el último `by` de su auditoría. El agente es el `tool` con más líneas `actor: agent`, y el modelo, el `model` más frecuente de sus líneas; si empatan, gana el que aparece antes. Sin dato, el cambio cuenta para «(sin dato)», que se elige con el nombre vacío (`who=model:`).
  - impacto: alto
- A3: Los periodos son `7d`, `30d` (por defecto), `90d` y `all`, y acaban hoy, en la fecha local del servidor. `all` empieza el día del primer cambio y no compara. Cada hecho cuenta por la fecha local de su evento: un cambio cerrado por su `change.closed` (una retro, que no lo tiene, por su `retro.confirmed`), una tarea por su `task.completed`, una verificación por su `task.verified` y el coste por su `change.usage` con `cost`.
  - impacto: alto
- A4: Las definiciones de los indicadores son estas. El ciclo es la mediana, entre los cambios cerrados en el periodo, del tiempo de su `change.created` (o su primera línea) a su cierre. Las verificaciones que pasan son las `task.verified` con `exit: 0` entre todas las del periodo. El coste medido es la suma de `cost`, «en N de M cambios cerrados»: N son los cambios del corte con coste medido en el periodo y M, los cerrados en él. Los pendientes abiertos son las entradas `pending`, `improvement` y `reminder` creadas hasta el último día del periodo y que entonces no estaban hechas ni descartadas; una hecha o descartada sin `closed` cuenta como cerrada. Con un filtro de persona, agente, modelo o carril, una entrada cuenta si su `origin.change` es un cambio de ese corte.
  - impacto: medio
- A5: La variación es (actual − anterior) / anterior, redondeada al entero. Si el periodo anterior no tiene datos (0 o sin valor), dice «sin datos en los N días anteriores», y sin valor actual no hay variación. En el ciclo, el coste y los pendientes, bajar es bueno (como en la maqueta); en los demás, subir. Va con ▲ o ▼ y el color de las fases hecha y cancelada (`--color-phase-done`, `--color-phase-cancelled`), así que el color nunca es la única señal.
  - impacto: medio
- A6: Los cambios del corte, que cuenta el encabezado y cuyo cero da el estado vacío, son los que coinciden con el filtro y cuya vida, de su primera a su última línea de auditoría, toca el periodo.
  - impacto: medio
- A7: Los filtros van en la URL (`period`, `who` y `kind`, sin los valores por defecto) y la página los lee con `withComponentInputBinding`, como la Memoria lee `q`. «Ver por» ofrece Todos y las opciones que da la respuesta («Persona: …», «Agente: …», «Modelo: …», las de más cambios primero). «Carril» ofrece Todos y los nombres de las insignias: Feature, Quick, Épica, Spike y Manual. Los números van con `Intl` en el idioma de la UI, y el ciclo, con `formatDuration`.
  - impacto: medio

## Criterios de aceptación

- AC1: CUANDO la persona abre «Panel» desde el encabezado de `specty ui` ENTONCES ve, para los últimos 30 días y todos, seis indicadores: cambios cerrados, tareas completadas, ciclo mediano, verificaciones que pasan, coste medido con en cuántos cambios se midió y pendientes abiertos. Cada uno lleva su variación frente a los 30 días anteriores: ▲ o ▼ con el %, en verde si mejora y en rojo si empeora, o «sin datos en los 30 días anteriores».
- AC2: CUANDO elige otro periodo (7 días, 90 días o Todo), una persona, un agente o un modelo en «Ver por», o un carril ENTONCES los indicadores se recalculan para ese corte, la dirección de la página lleva el filtro y, al recargarla, el panel sigue igual.
- AC3: CUANDO elige «Todo» ENTONCES los indicadores no muestran comparación.
- AC4: CUANDO el periodo o el filtro no tienen ningún cambio ENTONCES el panel lo dice en un estado vacío, en lugar de los indicadores.
- AC5: CUANDO la UI está en inglés ENTONCES el título, los filtros, los indicadores con sus notas y variaciones, y el estado vacío salen en inglés.
- AC6: CUANDO el core calcula los indicadores ENTONCES cada hecho cuenta por la fecha local de su evento, cada cambio cuenta para una sola persona, un agente y un modelo (o para «(sin dato)»), y la comparación es con los días inmediatamente anteriores de la misma duración.
- AC7: CUANDO la UI pide `GET /api/stats` con `period`, `who` y `kind` ENTONCES el servidor responde, con los cambios abiertos y archivados y la memoria, los indicadores de ese corte, el periodo con sus fechas y las del anterior, las opciones de «Ver por» con cuántos cambios tiene cada una y cuántos cambios tiene el corte; un valor que no entiende toma el de por defecto, y sin la sesión responde 403.
- AC8: CUANDO el core agrega 2.000 cambios sintéticos ENTONCES el cálculo tarda menos de un segundo.

## Diseño

- Core, `stats/period.ts`: `STATS_PERIODS`, `StatsQuery` (`period`, `who?` con `kind` y `name`, y `kind?` de carril), `statsQuery`, que entiende los parámetros o pone los de por defecto, los rangos del periodo y del anterior como días locales (`YYYY-MM-DD`, ambos incluidos), si un cambio entra en el corte, y la comparación de un valor con el anterior.
- Core, `stats/rows.ts`: `statsRow(state, audit)` da la fila de un cambio: id, carril, persona, agente y modelo, creación, cierre, primera y última línea, y las tareas, verificaciones y costes con su fecha. Sin líneas de auditoría, no da fila.
- Core, `stats/summary.ts`: `statsSummary` calcula los seis indicadores (`StatsFigure`: `value`, y, si compara, `previous` y `change`, que es `null` sin datos anteriores). `statsView({ rows, memory, today, query })` da `StatsView`: el corte usado, `range`, `previous?`, `changes`, `options` (cada persona, agente y modelo, con «(sin dato)», y cuántos cambios tiene) y `summary`. El índice exporta las funciones y los tipos; las secciones de los demás cortes se añadirán a `StatsView`.
- CLI, `server/api.ts`: `/api/stats` en `VIEWS`. Hace una fila por registro de `changeRecords`, lee las entradas de la memoria, toma hoy como `localDay(session.environment.now())` y llama a `statsView`.
- UI, `data/source.ts`: `stats(params)`, sin nada por defecto. `data/server.ts` lo pide a `/api/stats` con los parámetros que lleva y comprueba la forma de la respuesta.
- UI, `dashboard/dashboard-page.ts` (`sp-dashboard-page`): las entradas `period`, `who` y `kind` de la URL y un `resource` que pide el panel y lo vuelve a leer con cada evento de la fuente. La cabecera lleva «Panel» y la línea «N cambios · 9 oct – 7 nov · Todos». La fila de filtros tiene `sp-segmented` (Periodo) y dos `sp-select` (Ver por y Carril); elegir navega con los parámetros nuevos y `replaceUrl`. Debajo van el error, el esqueleto, el estado vacío, el aviso de que la fuente no da el panel o la rejilla de indicadores sin tarjetas, cada uno con su etiqueta, su valor, su variación y su nota. Lo que miran los tests: `[data-summary]`, `[data-filters]`, `[data-kpi="closed|tasks|cycle|verifications|cost|pending"]` con `[data-value]`, `[data-delta]` (con `data-tone="good|bad"`) y `[data-note]`, y `[data-empty]`.
- UI, `app/routes.ts` y `app/shell.ts`: la ruta `/dashboard` («Specty · Panel») y el enlace «Panel» entre Sesiones y Configuración.
- Tests: `core/test/stats/summary.test.ts` (AC1, AC3, AC6 y AC8), `cli/test/server/stats.test.ts` (AC2 y AC7, con cambios archivados escritos en el repositorio de prueba), `ui/src/dashboard/dashboard-page.test.ts` (AC1 a AC5, con una fuente de prueba que da el panel según los parámetros) y `ui/src/app/shell.test.ts` (el enlace).

## Archivos

- crear packages/core/src/stats/period.ts — periodos, corte de la URL, rangos, filtro y comparación
- crear packages/core/src/stats/rows.ts — la fila de cada cambio, de su estado y su auditoría
- crear packages/core/src/stats/summary.ts — los seis indicadores y la vista del panel
- modificar packages/core/src/index.ts — exporta las funciones y los tipos del panel
- crear packages/core/test/stats/summary.test.ts — filas, periodos, indicadores, comparación y rendimiento
- modificar packages/cli/src/server/api.ts — `GET /api/stats`
- crear packages/cli/test/server/stats.test.ts — la lectura del panel con sus filtros
- modificar docs/ARCHITECTURE.md — `GET /api/stats` en §15
- modificar packages/ui/src/data/source.ts — `stats()` de la fuente de datos
- modificar packages/ui/src/data/server.ts — `stats()` del servidor
- crear packages/ui/src/dashboard/dashboard-page.ts — la página «Panel»
- crear packages/ui/src/dashboard/dashboard-page.test.ts — la página en español y en inglés, con sus filtros y su estado vacío
- modificar packages/ui/src/app/routes.ts — la ruta `/dashboard`
- modificar packages/ui/src/app/shell.ts — el enlace «Panel» del encabezado
- modificar packages/ui/src/app/shell.test.ts — la lista de enlaces del encabezado
- modificar docs/ui.md — la pantalla «Panel»

## Tareas

- [x] T1: El core calcula los indicadores del panel de los cambios y la memoria
  - files: packages/core/src/stats/period.ts, packages/core/src/stats/rows.ts, packages/core/src/stats/summary.ts, packages/core/src/index.ts, packages/core/test/stats/summary.test.ts
  - ac: AC1, AC3, AC6, AC8
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/stats/summary.test.ts && pnpm lint
- [x] T2: `GET /api/stats` responde los indicadores del corte que pide la UI
  - files: packages/cli/src/server/api.ts, packages/cli/test/server/stats.test.ts, docs/ARCHITECTURE.md
  - ac: AC2, AC7
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server/stats.test.ts && pnpm lint
- [x] T3: La página «Panel», con su enlace, sus filtros en la URL y los seis indicadores
  - files: packages/ui/src/data/source.ts, packages/ui/src/data/server.ts, packages/ui/src/dashboard/dashboard-page.ts, packages/ui/src/dashboard/dashboard-page.test.ts, packages/ui/src/app/routes.ts, packages/ui/src/app/shell.ts, packages/ui/src/app/shell.test.ts, docs/ui.md
  - ac: AC1, AC2, AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/dashboard/dashboard-page.test.ts --include src/app/shell.test.ts && pnpm typecheck && pnpm lint && pnpm knip

## Riesgos

- R1: El corte queda en el límite de tamaño (L) con tres paquetes. Mitigación: el componente de los indicadores, el catálogo, la entrada ligera y el ejemplo del prototipo se dejan para C2, y la lectura va en `server/api.ts`.
- R2: `changeRecords` también busca los commits de las tareas y quién lleva cada cambio, así que cada cambio de filtro lo vuelve a hacer. Mitigación: los archivados siguen en memoria mientras su estado no cambia, y si se nota lento, C5 llevará la lectura a `server/stats.ts` con una que no complete los registros.
- R3: `data/server.ts` ya pasa del aviso de 300 líneas. Mitigación: la comprobación de la respuesta es breve, y llevar las comprobaciones a `data/server-answers.ts` sigue anotado como pendiente.
