---
kind: standard
---

# La trazabilidad y el flujo de eventos de la UI van a módulos propios

## Objetivo

Limpieza de código de la UI sin cambios de comportamiento (P360). `data/server.ts` sigue con 387 líneas de código y `data/server-answers.ts`, con 306 (aviso a partir de 300). Las lecturas de la trazabilidad (`traceFiles`, `trace`, `testCode` y `traced`, con sus tres mensajes) pasan a `data/server-trace.ts`, y el flujo de eventos (`listen`, `follow`, `closeIfIdle`, `watchRun`, `watchActions`, `readRun` y la lectura de los eventos `run` y `action`) a `data/server-events.ts`, para que los dos queden por debajo de 300, divididos por responsabilidad como `data/server-stats.ts`.

## Fuera de alcance

- Los formatos repetidos del panel (P327), las piezas comunes de las gráficas (P342) y lo que repite el core (P328): van en otros cambios.
- Los cortes de la épica 20261108-panel-titulos-y-sesiones (las estadísticas del core, `packages/cli/src/server/stats*.ts`, `dashboard-cost.ts` y `dashboard-quality.ts`).
- Dividir otras partes de `server-answers.ts`, como las comprobaciones y los motivos de la configuración.
- Cambiar peticiones, eventos, respuestas, textos o la apariencia de la UI.

## Supuestos

- A1: Las lecturas de la trazabilidad van a `data/server-trace.ts` como funciones (`fetchTraceFiles`, `fetchTrace` y `fetchTestCode`), igual que las del panel en `data/server-stats.ts`; `traced` y sus tres mensajes (`NO_TRACE_YET`, `NOT_A_TEST` y `TRACE_TOO_LARGE`) van con ellas sin exportarse, y los métodos `traceFiles`, `trace` y `testCode` de `ServerData` solo las llaman.
  - impacto: medio
- A2: El flujo de eventos tiene estado (el `EventSource` y quienes escuchan cada evento), así que va a una clase sin Angular, `ServerEvents`, en `data/server-events.ts`. Cada `ServerData` crea la suya, como hoy tiene sus propios conjuntos de oyentes, y sus métodos `subscribe`, `watchRun` y `watchActions` le delegan.
  - impacto: medio
- A3: `reread` y `REREAD_MS` pasan a `ServerEvents`, porque avisan a quienes escuchan `changes` como si llegara el evento y esos oyentes viven ahí; `ServerData` la llama tras cada acción aceptada y tras guardar la configuración, como hoy.
  - impacto: bajo
- A4: `runEvent`, `actionEvent` y `eventData` salen de `server-answers.ts` a `server-events.ts` sin exportarse, porque solo los lee el flujo de eventos. `isRun` se queda en `server-answers.ts`, porque también comprueba la respuesta de `/run` y los datos de la app MCP (`mcp-app.ts`).
  - impacto: bajo
- A5: Ningún test pide hoy a `ServerData.testCode` un test sin sesión (403) o con otro error del servidor: se añade uno en `data/server-trace.test.ts` antes de moverla, para que el refactor tenga su contrato.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO la UI servida por `specty ui` lee los archivos que dejó un cambio, los bloques de un archivo o el código de un test ENTONCES hace las mismas peticiones que antes y da las mismas respuestas y los mismos mensajes: sin sesión, aún sin commits, archivo demasiado grande, no es un test del cambio, datos inesperados o el código de estado.
- AC2: CUANDO la UI escucha los cambios, la verificación en curso o las acciones de la persona ENTONCES abre un solo flujo de eventos (`/api/events`) para todos, lo cierra cuando ya nadie escucha y cada evento `changes`, `run` y `action` llega a quien lo escucha como antes; la verificación en curso empieza por lo que responde `/run`, salvo que llegue antes un evento.
- AC3: CUANDO el servidor acepta una acción de la persona o guarda la configuración ENTONCES la acción termina cuando quienes escuchan `changes` han vuelto a leer, 10 s como mucho, como antes.

## Diseño

- `data/server-trace.ts` (nuevo): `fetchTraceFiles(change)`, `fetchTrace(change, path)` y `fetchTestCode(change, path)`, con `traced(url)` y sus tres mensajes. Las mismas URL, los mismos códigos (403 da `NO_SESSION`, 404 da `NO_TRACE_YET` o `NOT_A_TEST`, 413 da `TRACE_TOO_LARGE`, otro error da `answered(status)`) y `UNEXPECTED` cuando la respuesta no pasa la comprobación.
- `data/server-events.ts` (nuevo): `ServerEvents`, con `subscribe`, `watchRun`, `watchActions` y `reread` públicos y `listen`, `follow` y `closeIfIdle` privados; `readRun`, `runEvent`, `actionEvent` y `eventData` como funciones del módulo.
- `data/server.ts`: `ServerData` tiene un `ServerEvents` propio y llama a las funciones de `server-trace.ts`; salen los mensajes de la trazabilidad, `REREAD_MS`, los tipos de los oyentes y `readRun`.
- `data/server-answers.ts`: salen `runEvent`, `actionEvent` y `eventData`.

## Archivos

- crear packages/ui/src/data/server-trace.ts — las lecturas de la trazabilidad al servidor local, con sus mensajes
- crear packages/ui/src/data/server-events.ts — el flujo de eventos del servidor local y la lectura de sus eventos
- modificar packages/ui/src/data/server.ts — llama a las lecturas de la trazabilidad y delega en el flujo de eventos
- modificar packages/ui/src/data/server-answers.ts — salen las lecturas de los eventos `run` y `action`
- modificar packages/ui/src/data/server-trace.test.ts — test de `ServerData.testCode`, antes de moverla
- modificar docs/ARCHITECTURE.md — la trazabilidad y el flujo de eventos están en `data/server-trace.ts` y `data/server-events.ts`

## Tareas

- [x] T1: Test del código de un test pedido al servidor local
  - files: packages/ui/src/data/server-trace.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/server-trace.test.ts && pnpm lint
  - type: test
- [x] T2: Las lecturas de la trazabilidad pasan a `data/server-trace.ts`
  - files: packages/ui/src/data/server-trace.ts, packages/ui/src/data/server.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/server-trace.test.ts --include src/progress/tests-sent.test.ts --include src/progress/locked-tests.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: refactor
- [x] T3: El flujo de eventos pasa a `data/server-events.ts`
  - files: packages/ui/src/data/server-events.ts, packages/ui/src/data/server.ts, packages/ui/src/data/server-answers.ts, docs/ARCHITECTURE.md
  - ac: AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/server-runs.test.ts --include src/data/in-flight.test.ts --include src/data/server.test.ts --include src/data/server-actions.test.ts --include src/data/server-config.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: refactor

## Riesgos

- R1: Que `ServerData` y `ServerEvents` acaben abriendo dos flujos o no cerrarlo al dejar de escuchar. Mitigación: los tests de `server-runs.test.ts` e `in-flight.test.ts` comprueban que el flujo es uno y que se cierra.

## Cierre

### Resumen

Limpieza de la UI sin cambios de comportamiento (P360):
- `data/server-trace.ts` (nuevo): las lecturas de la trazabilidad al servidor local (`fetchTraceFiles`, `fetchTrace` y `fetchTestCode`), con `traced` y sus tres mensajes. `ServerData` solo las llama.
- `data/server-events.ts` (nuevo): `ServerEvents`, el flujo de eventos (`subscribe`, `watchRun`, `watchActions` y `reread`, con `listen`, `follow` y `closeIfIdle`), y `readRun`, `runEvent`, `actionEvent` y `eventData`, que salen de `server-answers.ts`. Cada `ServerData` tiene el suyo y le delega.
- `data/server.ts` baja de 387 a 292 líneas de código y `data/server-answers.ts`, de 306 a 282: los dos quedan por debajo del aviso de 300.
- Test nuevo de `ServerData.testCode` en `server-trace.test.ts` (texto, 403, 404 y 500). AC2 y AC3 los cubren los tests que ya existían: `server-runs.test.ts`, `in-flight.test.ts`, `server.test.ts`, `server-actions.test.ts` y `server-config.test.ts`, que pasan sin cambios.
- ARCHITECTURE nombra `data/server-trace.ts` y `data/server-events.ts` junto a `server-answers.ts` y `server-stats.ts`.

### Desviaciones (respecto al plan)

- Ninguna.

### Decisiones

- `runEvent`, `actionEvent` y `eventData` dejan de exportarse: solo los usa el flujo de eventos. `isRun` sigue exportada en `server-answers.ts`, que la usan `server-events.ts` y `mcp-app.ts`.
- `watchRun` y `watchActions` de `ServerData` declaran sus oyentes con los tipos de `SpectyData`; los alias `RunListener` y `ActionListener` quedan privados en `server-events.ts`.

### Pendientes

- Ninguno.
