---
kind: standard
---

# La pestaña Historial muestra la trazabilidad de los archivos del cambio

## Objetivo

El servidor local ya da la trazabilidad de un cambio (`GET /api/changes/<id>/trace`), pero la UI no la enseña. La pestaña Historial gana la vista «Trazabilidad», junto a la línea de tiempo: los archivos que dejó el cambio y, del elegido, sus líneas con un margen tipo blame que dice de qué commit, cambio, tarea y criterios viene cada bloque.

## Fuera de alcance

- Resaltar la sintaxis del código.
- Trazar archivos que el cambio no tocó, o elegir otra revisión.
- Saltar de una línea a su diff.

## Supuestos

- A1: La vista se elige con un control segmentado «Vista» (Línea de tiempo, Trazabilidad) arriba de la pestaña, solo cuando la pestaña sabe de qué cambio es; los filtros de la línea de tiempo solo se ven en ella.
- A2: La trazabilidad es una lectura opcional de la fuente (`traceFiles` y `trace`), como el diff: la que no la da lo dice.
- A3: El prototipo la saca de los diffs de muestra de «Panel de asistencia por curso», con los títulos y criterios de su spec escritos en la muestra, porque el hilo principal no carga el parser de core.

## Criterios de aceptación

- AC1: CUANDO la persona elige «Trazabilidad» en la pestaña Historial de un cambio ENTONCES ve los archivos que dejó y, del elegido (el primero al entrar), sus líneas numeradas con un margen tipo blame: cada bloque con su commit y, si lo hizo Specty, su cambio enlazado a su página, su tarea y los criterios que cubre; si no, el asunto, el autor y la fecha del commit.
- AC2: CUANDO el cambio aún no tiene commits, no dejó archivos, o la fuente no da la trazabilidad o falla ENTONCES la vista lo dice, con el motivo de la fuente.
- AC3: CUANDO la UI corre contra el servidor local ENTONCES pide la lista y el blame a `GET /api/changes/<id>/trace` (con `?path=`), y convierte 403, 404, 413 y una respuesta inesperada en motivos legibles.
- AC4: CUANDO la UI corre como prototipo ENTONCES la trazabilidad de «Panel de asistencia por curso» sale de sus diffs de muestra: lo que añadió cada tarea, con su commit, su tarea y sus criterios, y el resto de un commit anterior de fuera de Specty; un cambio sin diffs de muestra no tiene commits.

## Diseño

- `data/trace.ts`: `TraceRecord` y `TraceBlock` (los bloques llevan el `WhyCommit` de core) y `isTrace`, que valida lo que llega del servidor.
- `data/source.ts`: `traceFiles(change)` y `trace(change, path)`, que por defecto rechazan con «Esta fuente no da la trazabilidad.».
- `data/server.ts`: los leen de `/api/changes/<id>/trace`.
- `data/sample-trace.ts`: la muestra del prototipo, que `data/fixtures.ts` usa.
- `history/trace-view.ts` (`sp-trace-view`): el `sp-select` «Archivo» y, por bloques, el margen y las líneas; mientras carga, líneas de carga; si falla, el motivo.
- `history-tab.ts`: el control «Vista» y la vista elegida.

## Archivos

- crear packages/ui/src/data/trace.ts — los tipos de la trazabilidad y su validación
- modificar packages/ui/src/data/source.ts — las lecturas opcionales `traceFiles` y `trace`
- modificar packages/ui/src/data/server.ts — las lee del servidor local
- crear packages/ui/src/data/server-trace.test.ts — las peticiones y los motivos de cada respuesta
- crear packages/ui/src/data/sample-trace.ts — la trazabilidad de muestra del prototipo
- crear packages/ui/src/data/sample-trace.test.ts — sus archivos y bloques
- modificar packages/ui/src/data/fixtures.ts — la usa
- crear packages/ui/src/history/trace-view.ts — la vista con el margen tipo blame
- crear packages/ui/src/history/trace-view.test.ts — los bloques, el archivo elegido, los motivos y la pestaña
- modificar packages/ui/src/history/history-tab.ts — el control «Vista»
- modificar docs/ui.md — la trazabilidad hecha

## Tareas

- [x] T1: La trazabilidad en la fuente de datos y en el servidor local
  - files: packages/ui/src/data/trace.ts, packages/ui/src/data/source.ts, packages/ui/src/data/server.ts, packages/ui/src/data/server-trace.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/server-trace.test.ts && pnpm lint
- [x] T2: La trazabilidad de muestra del prototipo
  - files: packages/ui/src/data/sample-trace.ts, packages/ui/src/data/sample-trace.test.ts, packages/ui/src/data/fixtures.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/sample-trace.test.ts --include src/data/fixtures.test.ts && pnpm lint
- [ ] T3: La vista «Trazabilidad» de la pestaña Historial
  - files: packages/ui/src/history/trace-view.ts, packages/ui/src/history/trace-view.test.ts, packages/ui/src/history/history-tab.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/history && pnpm --filter @baquia-dev/specty-ui typecheck && pnpm lint && pnpm knip
- [ ] T4: Documentar la trazabilidad
  - files: docs/ui.md
  - ac: —
  - verify: pnpm lint
  - type: docs
