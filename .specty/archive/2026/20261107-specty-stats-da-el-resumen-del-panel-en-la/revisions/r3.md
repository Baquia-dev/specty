---
kind: standard
epic: 20261107-panel-de-specty
slice: C6
---

# `specty stats` da el resumen del panel en la terminal

## Objetivo

Hoy el resumen de lo que se hizo con Specty solo se ve en el «Panel» de `specty ui`. Con este cambio, `specty stats` lo imprime en la terminal: los indicadores con la comparación frente al periodo anterior y una fila por persona, agente y modelo, para el corte que se pida. Con `--json` da los mismos datos que `GET /api/stats`, porque los lee con la misma función. Solo lee, así que también lo puede ejecutar el agente.

## Fuera de alcance

- El tiempo por fase y los cambios más caros (A10 de la épica). Los añaden en paralelo C3 (`stats/flow.ts`) y C4 (`stats/cost.ts`), que aún no están en main. Queda como pendiente sumarlos al comando.
- Las demás secciones del panel en texto: ritmo, calidad, alcance e integraciones, memoria y la tabla de cambios. Con `--json` llega lo que ya dé `/api/stats`.
- Exportar a CSV desde la terminal y elegir el formato de las cifras.
- Cambiar lo que responde `GET /api/stats`.

## Supuestos

- A1: El comando y el servidor leen con la misma función. La lectura de `statsAnswer` sale de `server/api.ts` a un módulo propio, `server/stats.ts`: `statsOf(session, query)` para el comando y `statsAnswer(session, params)` para el servidor. Además pasa a `plainRecords` (pendiente P322), que no completa los registros, porque la fila del panel solo lee el estado y la auditoría.
  - impacto: medio
- A2: `--json` es la opción global de la CLI, así que valen `specty --json stats` y `specty stats --json`. Imprime tal cual el `StatsView` de `/api/stats`, sin la envoltura de tarjeta, como `specty audit --json`, que también responde un `ReportOutput`.
  - impacto: medio
- A3: El texto es una tarjeta, `statsCard` en `cards/stats.ts`. La cabecera es `SPECTY · stats · <periodo> · <desde> – <hasta>`, más la persona, el agente o el modelo y el carril del corte. El bloque INDICADORES lleva los seis, con su variación frente al periodo anterior. Los bloques PERSONAS, AGENTES y MODELOS son tablas con columnas alineadas: cambios, tareas, ciclo, verificaciones que pasan, sesiones y coste. El nombre vacío es «(sin dato)» y un valor que falta es «—».
  - impacto: bajo
- A4: El servidor cambia por el valor por defecto lo que no entiende. El comando, en cambio, rechaza con código 1 un `--period`, un `--who` o un `--kind` que no entiende, y dice los valores válidos, para que nadie lea sin darse cuenta el resumen de otro corte.
  - impacto: bajo
- A5: Las cifras se escriben como en el resto de la CLI y en el panel. El coste va en USD con dos decimales (`12,30 USD`). Los porcentajes llevan hasta un decimal (`92,5 %`). La variación va como en el panel: `▲ 10 %`, «sin datos en los 30 días anteriores» o «sin cambios frente a los 30 días anteriores». Las duraciones van en s, min, h y d. La terminal no lleva color: la flecha basta.
  - impacto: bajo
- A6: Sin ningún cambio del corte en el periodo, la tarjeta lo dice en lugar de imprimir indicadores y tablas vacíos, como el estado vacío del panel, y el SIGUIENTE propone otro periodo.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO alguien ejecuta `specty stats` ENTONCES ve los últimos 30 días con sus fechas, los seis indicadores con su variación frente a los 30 días anteriores (el coste, con en cuántos cambios se midió) y una fila por persona, agente y modelo con sus cambios, tareas, ciclo, verificaciones que pasan, sesiones y coste.
- AC2: CUANDO pasa `--period 7d`, `90d` o `all`, `--who person:<nombre>`, `agent:<herramienta>` o `model:<modelo>`, o `--kind <carril>` ENTONCES las cifras son las de ese corte y la cabecera lo dice; con `all`, los indicadores no llevan comparación.
- AC3: CUANDO pasa `--json` ENTONCES imprime los mismos datos que `GET /api/stats` para ese corte.
- AC4: CUANDO un valor de `--period`, `--who` o `--kind` no se entiende ENTONCES el comando lo rechaza con código 1 y dice los valores válidos.
- AC5: CUANDO el corte no tiene ningún cambio en el periodo ENTONCES lo dice en lugar de imprimir indicadores y tablas vacíos.
- AC6: CUANDO salen los textos del comando ENTONCES salen en español y en inglés.

## Diseño

- `packages/cli/src/server/stats.ts`: `statsOf(session, query: StatsQuery)` lee los cambios con `plainRecords`, saca su fila con `statsRow`, lee la memoria con `readMemory` y llama a `statsView` con el día local de la sesión. `statsAnswer(session, params)` traduce los parámetros de la URL con `statsQuery` y llama a `statsOf`. `api.ts` solo importa `statsAnswer` en su tabla `VIEWS`.
- `packages/cli/src/commands/stats.ts`: `statsCommand(program, run)` registra `stats` con `--period`, `--who` y `--kind`. Si un valor no se entiende (lo que `statsQuery` deja por defecto o sin poner), responde `statsRefusalCard`. Si no, responde `{ report: renderText(statsCard(view, cards), lang), json: view, code: 0 }`. Se registra en `program.ts`, en `readingCommands`, tras `status` y `doctor`.
- `packages/core/src/cards/stats.ts`: `statsCard(view, ctx)` y `statsRefusalCard(refusal, ctx)`, con sus formatos de número, porcentaje, USD y duración, y una función que alinea las columnas de las tablas. Se exportan en `cards/index.ts`.

## Archivos

- crear packages/core/src/cards/stats.ts — los textos de `specty stats`: el resumen y los rechazos, en español y en inglés
- modificar packages/core/src/cards/index.ts — exporta `statsCard` y `statsRefusalCard`
- crear packages/core/test/cards/stats.test.ts — la tarjeta del resumen, el estado vacío y los rechazos en los dos idiomas
- crear packages/cli/src/server/stats.ts — la lectura del panel que comparten `GET /api/stats` y `specty stats`, con `plainRecords`
- modificar packages/cli/src/server/api.ts — `/api/stats` usa `statsAnswer` de `server/stats.ts`
- crear packages/cli/src/commands/stats.ts — el comando `specty stats`
- modificar packages/cli/src/program.ts — registra `specty stats` en el grupo de lectura
- crear packages/cli/test/stats.test.ts — el resumen por defecto, los cortes, `--json` igual a `/api/stats`, los rechazos y el estado vacío
- modificar docs/ARCHITECTURE.md — `specty stats` en §6 y la lectura de `/api/stats` en §15
- modificar docs/formats.md — un ejemplo de la salida de `specty stats` en §9

## Tareas

- [x] T1: El core escribe el resumen del panel y los rechazos de `specty stats` en español y en inglés
  - files: packages/core/src/cards/stats.ts, packages/core/src/cards/index.ts, packages/core/test/cards/stats.test.ts, docs/formats.md
  - ac: AC1, AC2, AC4, AC5, AC6
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/stats.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint
- [x] T2: `specty stats` lee el panel con la misma función que `GET /api/stats` y lo imprime o lo da en JSON
  - files: packages/cli/src/server/stats.ts, packages/cli/src/server/api.ts, packages/cli/src/commands/stats.ts, packages/cli/src/program.ts, packages/cli/test/stats.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/stats.test.ts test/server/stats.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: C3 y C7 tocan a la vez `server/api.ts` y el tipo de la respuesta. Mitigación: aquí solo se mueve la lectura de `statsAnswer` a su módulo, sin cambiar lo que responde, y el comando lee `StatsView` sin tocarlo.
- R2: Las cifras del texto se calculan aparte de las del panel y podrían no coincidir. Mitigación: el texto solo formatea el `StatsView` que da `statsView`, y un test compara `--json` con `/api/stats`.

## Cierre

### Resumen

`specty stats [--period 7d|30d|90d|all] [--who person:<nombre>|agent:<herramienta>|model:<modelo>] [--kind <carril>]` imprime en la terminal el resumen del «Panel» de `specty ui`, 30 días por defecto. La cabecera lleva el periodo, sus fechas y el corte. Debajo van los seis indicadores, con su variación frente al periodo anterior salvo con `all`, y una tabla alineada por persona, agente y modelo, con sus cambios, tareas, ciclo, verificaciones que pasan, sesiones y coste. Sin ningún cambio del corte en el periodo, lo dice. Rechaza con código 1 el valor de una opción que no entiende. Con `--json` da tal cual el `StatsView` de `GET /api/stats`, porque los dos leen con la misma función, `statsOf` en `server/stats.ts`, que ahora usa `plainRecords` (P322). Los textos están en `cards/stats.ts`, en español y en inglés, y la documentación, en `docs/ARCHITECTURE.md` §6 y §15 y en `docs/formats.md` §9.

### Desviaciones

- El ejemplo de `docs/formats.md` §9 va en T1, con la tarjeta, y no en T2: así T2 no pasa de 6 archivos y cada tarea lleva sus tests, como pide la política `contract`.

### Decisiones

- El texto es una tarjeta normal (`statsCard`, con `renderText`). El comando responde un `ReportOutput`, como `specty audit`, para que `--json` dé los datos del panel y no la tarjeta.
- La tabla de personas, agentes y modelos lleva todas las filas del carril, sea cual sea el `--who`, como la sección del panel desde la que se elige otro corte.
- Las duraciones siguen el formato de la UI (`formatDuration`): s, min, h y min, y d y h. El coste va en USD con dos decimales, como en el cierre de cada cambio.

### Pendientes

- Añadir a `specty stats` el tiempo por fase y los cambios más caros (A10 de la épica) cuando C3 (`stats/flow.ts`) y C4 (`stats/cost.ts`) estén en main: hoy la tarjeta solo imprime los indicadores y las tablas por persona, agente y modelo.
