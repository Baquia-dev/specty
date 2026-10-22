---
kind: standard
follows:
  - 20261022-paleta-y-menu-la-opcion-activa-se-anuncia-y-el-m
---

# Pestaña Progreso: tareas como documento, verificaciones y solicitudes de alcance

## Objetivo

La pestaña Progreso del cambio muestra hoy un texto provisional. Pasa a ser la vista elegida en la maqueta «Specty · Pestaña Progreso»: las tareas, en orden, como filas de documento, igual que en la revisión, cada una con su estado, su commit, sus archivos, su duración y su última verificación. De la propuesta «Lo que te espera primero» toma tres cosas:

- **Te espera arriba:** la tarea que necesita una decisión de la persona sube a una sección «Te espera», con su solicitud de alcance, y vuelve a su lugar en la lista en cuanto se decide.
- **Qué implica decidir:** la solicitud explica qué pasa si se aprueba o se rechaza.
- **Último fallo abierto:** en la tarea en curso, la salida de la última verificación fallida se ve abierta.

## Fuera de alcance

- La pestaña Historial, donde irá el detalle por eventos de la propuesta de línea de tiempo.
- La pestaña Aceptación, con los diffs por tarea y la verificación completa.
- El servidor local que leerá `audit.jsonl`: el prototipo usa las muestras de la fuente de datos.
- La salida en vivo de la verificación en curso: va en el cambio siguiente, porque la fuente tiene que transmitir la salida mientras la verificación corre (hoy Specty solo guarda las últimas líneas de una verificación fallida).

## Supuestos

- A1: Las tareas van en el orden de la spec, cada una como fila con su id, título, estado (hecha, en curso o pendiente; con color, icono y texto), resumen, commit, archivos, criterios, duración e intentos. La tarea en curso se resalta y dice cuándo empezó. Encima va un resumen («2 de 3 tareas hechas · 25 min de trabajo · 1 decisión te espera») con una barra segmentada por tarea. Una tarea que necesita una decisión de la persona (hoy, una solicitud de alcance pendiente) sale de su lugar y aparece arriba, en «Te espera», con la solicitud; al decidirla, vuelve a su lugar en la lista con una transición corta (sin movimiento si se pide reducirlo).
  - impacto: alto
- A2: Solo las verificaciones que fallan guardan su salida (`outputTail` de `task.verified` en `audit.jsonl`). Por eso la verificación correcta muestra su duración y su comando, y solo la que falló ofrece «Ver salida». En la tarea en curso, la salida del último fallo se ve abierta. La salida en vivo de la verificación que está corriendo llega en el cambio siguiente.
- A3: La solicitud de alcance va dentro de la fila de su tarea. Muestra la ruta, el motivo del agente, qué implica decidir y los botones «Aprobar» y «Rechazar…». Rechazar pide el motivo en un diálogo, como al rechazar un supuesto, porque el agente lo lee.
- A4: La fuente de datos entrega con cada cambio los eventos de su `audit.jsonl` (`ChangeRecord.audit`). Progreso solo lee `task.verified`; el Historial leerá el resto. Decidir una solicitud es una acción de la fuente (`decideScope`), como decidir un supuesto.
- A5: La duración de una tarea va desde que empezó hasta que terminó; la de la tarea en curso, hasta ahora. El tiempo de trabajo del resumen es la suma de las dos.

## Criterios de aceptación

- AC1: CUANDO se abre la pestaña Progreso de un cambio con tareas ENTONCES las tareas aparecen en el orden de la spec como filas de documento, con su id, título, estado, resumen, commit, archivos, criterios, duración e intentos, y encima el resumen con una barra por tarea.
- AC2: CUANDO una tarea tiene verificaciones ENTONCES se ve la última, correcta o fallida, con su duración y su comando; CUANDO falló ENTONCES «Ver salida» muestra sus últimas líneas, abiertas por defecto en la tarea en curso.
- AC3: CUANDO una tarea pidió alcance ENTONCES sale de su lugar y aparece arriba, en «Te espera», con la solicitud: la ruta, el motivo y qué implica decidir; «Aprobar» la aprueba y «Rechazar…» pide el motivo en un diálogo antes de rechazarla; CUANDO la solicitud se decide ENTONCES la tarea vuelve a su lugar en la lista.
- AC4: CUANDO cambia el progreso (termina una tarea, se decide una solicitud) ENTONCES la pestaña se actualiza sola; CUANDO la fuente no puede hacer la acción ENTONCES lo explica en un aviso.
- AC5: CUANDO el cambio aún no tiene tareas ENTONCES la pestaña lo dice con un estado vacío.

## Diseño

- **Datos** (`data/progress.ts`, puro): `progressOf(spec, state, audit)` une las tareas de la spec con su estado (`state.tasks`), sus verificaciones (`task.verified`, leídas con guardas de tipo) y sus solicitudes de alcance pendientes; también da la duración legible («14 min», «1 h 5 min»). Los tipos van ahí, para que `records.ts` no pase de 300 líneas.
- **Fuente** (`data/records.ts`, `data/views.ts`): `ChangeRecord.audit`, `ChangeView.progress` y `SpectyData.decideScope(change, request, decision, reason?)`, de solo lectura salvo que la fuente la implemente.
- **Muestras** (`data/sample-progress.ts`, `data/fixtures.ts`): tiempos, commits, resúmenes y eventos de verificación de «Exportar boletines en PDF» y «Login con Google». La fuente de ejemplo implementa `decideScope`: aprobar añade la ruta al alcance de la tarea y rechazar la descarta; las dos registran `scope.decided`.
- **Pestaña** (`progress/`):
  - `sp-progress-tab`: resumen, barra, «Te espera» (solo si alguna tarea necesita una decisión), divisor «Tareas», lista en orden sin las que están arriba, y estado vacío;
  - `sp-task-row`: fila con el patrón `ROW` y su marca de estado; la que vuelve a la lista entra con `animate.enter`;
  - `sp-scope-request`: la solicitud, con el diálogo de rechazo.
- **Página** (`change/change-page.ts`): la pestaña Progreso usa `sp-progress-tab` en lugar del texto provisional.

## Archivos

- modificar packages/ui/src/data/records.ts — eventos del audit, progreso en la vista y decidir una solicitud de alcance
- crear packages/ui/src/data/progress.ts — el progreso de las tareas
- crear packages/ui/src/data/progress.test.ts — tests del progreso
- modificar packages/ui/src/data/views.ts — el progreso en la vista del cambio
- crear packages/ui/src/data/sample-progress.ts — tiempos, commits y verificaciones de ejemplo
- modificar packages/ui/src/data/fixtures.ts — usar las muestras y decidir solicitudes de alcance
- modificar packages/ui/src/data/fixtures.test.ts — tests de la decisión de alcance
- crear packages/ui/src/progress/progress-tab.ts — la pestaña Progreso
- crear packages/ui/src/progress/task-row.ts — la fila de una tarea
- crear packages/ui/src/progress/scope-request.ts — la solicitud de alcance y su rechazo
- crear packages/ui/src/progress/progress-tab.test.ts — tests de la pestaña
- modificar packages/ui/src/change/change-page.ts — la pestaña real en la página del cambio
- modificar packages/ui/src/change/change-page.test.ts — la pestaña Progreso dentro de la página
- modificar docs/ui.md — la pestaña Progreso

## Tareas

- [x] T1: El progreso de las tareas
  - files: packages/ui/src/data/records.ts, packages/ui/src/data/progress.ts, packages/ui/src/data/progress.test.ts, packages/ui/src/data/views.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/progress.test.ts --include src/data/views.test.ts
- [x] T2: Muestras y decisión de alcance en la fuente
  - files: packages/ui/src/data/sample-progress.ts, packages/ui/src/data/fixtures.ts, packages/ui/src/data/fixtures.test.ts
  - ac: AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/fixtures.test.ts
- [ ] T3: Las filas de tarea y la solicitud de alcance
  - files: packages/ui/src/progress/progress-tab.ts, packages/ui/src/progress/task-row.ts, packages/ui/src/progress/scope-request.ts, packages/ui/src/progress/progress-tab.test.ts
  - ac: AC1, AC2, AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/progress/progress-tab.test.ts
- [ ] T4: La pestaña en la página del cambio
  - files: packages/ui/src/change/change-page.ts, packages/ui/src/change/change-page.test.ts, docs/ui.md
  - ac: AC1, AC4
  - verify: pnpm check
  - notes: Comprobar en el navegador, a 390 y 1280 px, en claro y oscuro: «Exportar boletines en PDF» con la solicitud (aprobar y rechazar con motivo), «Login con Google», un cambio sin tareas, y que el resumen y la cabecera se actualizan al decidir.
