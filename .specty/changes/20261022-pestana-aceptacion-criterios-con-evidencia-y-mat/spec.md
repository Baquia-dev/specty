---
kind: standard
---

# Pestaña Aceptación: criterios con evidencia y matriz de trazabilidad

## Objetivo

La pestaña Aceptación deja el texto provisional. Muestra cada criterio con la evidencia de las tareas que lo cubren (commit y verificación), y permite aceptar el resultado o pedir ajustes desde la UI, explicando qué pasará en cada caso. La matriz de trazabilidad queda como vista alternativa.

## Fuera de alcance

- La verificación completa (`verify.full`) desde la UI, con su salida en vivo: va en el cambio siguiente.
- Los diffs por tarea y del cambio completo.
- Ver y confirmar el cierre («Confirmar y archivar»).
- Guardar qué criterios comprobó la persona.
- Que el servidor local haga estas acciones: el prototipo las simula en su fuente de datos.

## Supuestos

- A1: La vista por defecto es «Criterios». Cada criterio es una fila de documento con su texto y, debajo, las tareas que lo cubren: id, título, commit y su última verificación. A la derecha va su estado: «Verificado» (todas sus tareas hechas y con verificación correcta), «Hecho, sin verificación», «Pendiente» (alguna tarea sin hacer) o «Sin tarea». Encima, un resumen: «2 de 2 criterios verificados · 2 tareas hechas · 2 commits».
  - impacto: alto
- A2: La vista «Matriz» es una tabla de criterios por tareas, en el orden de la spec. Cada celda cubierta muestra el estado de la tarea y su commit; al pulsarla, aparece debajo el detalle de esa tarea (resumen, archivos, commit y verificación). En el móvil la tabla se desplaza de lado dentro de su caja. Se cambia de vista con un selector «Vista», como el de la Bandeja, y la elección se recuerda en el navegador de la persona.
  - impacto: alto
- A3: En aceptación, la cabecera y la barra compacta muestran «Pedir ajustes…» y «Aceptar resultado», donde la revisión pone «Pedir cambios» y «Aprobar». «Aceptar resultado» abre un diálogo de confirmación con las tareas, sus commits y lo que viene después: el agente redacta el cierre o, en un cambio rápido, el cambio se cierra. «Pedir ajustes…» abre un diálogo con un campo para la petición y con cómo la clasificará el agente: defecto, refinamiento o alcance nuevo.
  - impacto: alto
- A4: Cada criterio tiene «No se cumple…», que aparece al pasar por la fila o enfocarla (siempre, en pantallas táctiles) y abre «Pedir ajustes» con la petición empezando por el criterio («AC2: »). La petición viaja tal cual, como el texto literal de `specty adjust`, así que no hace falta otro formato.
- A5: Fuera de aceptación, la pestaña muestra la evidencia que haya hasta ese momento, sin acciones. En cierre dice además que el agente redacta el cierre o, si ya lo envió, que espera la confirmación con `specty close`.
- A6: La fuente de datos gana una sola acción, `decideResult(change, decisión)`, con la decisión `{ kind: "accept" }` o `{ kind: "adjust", request }`. La fuente de ejemplo hace lo que la CLI: aceptar pasa a cierre (o termina un cambio rápido) y registra `change.accepted`; pedir ajustes pasa a ajustes, guarda la petición en `pending.adjustment` y registra `adjust.requested`.
- A7: La muestra «Panel de asistencia por curso», que está en aceptación, gana sus commits, duraciones y verificaciones, para que la pestaña tenga evidencia que mostrar.

## Criterios de aceptación

- AC1: CUANDO la persona abre la pestaña Aceptación ENTONCES ve cada criterio con su texto, las tareas que lo cubren con su commit y su última verificación, y su estado, con un resumen encima.
- AC2: CUANDO elige la vista «Matriz» ENTONCES ve la tabla de criterios por tareas y, al pulsar una celda, el detalle de esa tarea; CUANDO vuelve a la pestaña más tarde ENTONCES sigue en la vista que eligió.
- AC3: CUANDO pulsa «No se cumple…» en un criterio ENTONCES se abre «Pedir ajustes» con la petición empezando por ese criterio.
- AC4: CUANDO confirma «Aceptar resultado» ENTONCES el cambio pasa a cierre (o termina, si su tipo es `quick`), la cabecera y la Bandeja lo reflejan y un aviso lo confirma.
- AC5: CUANDO envía una petición de ajustes ENTONCES el cambio pasa a ajustes con esa petición literal; el diálogo explica antes cómo la clasificará el agente y sin texto no deja enviarla.
- AC6: CUANDO la fuente no puede aceptar o pedir ajustes ENTONCES un aviso explica por qué y el cambio sigue igual.

## Diseño

- **Modelo** (`data/acceptance.ts`): `ResultDecision` y `evidenceOf(criteria, tasks)`, puro: por criterio, sus tareas (según `TaskProgressView.criteria`) y su estado. La pestaña lo calcula con lo que ya trae `ChangeView` (`review.criteria` y `progress.tasks`), así que la derivación de vistas no cambia.
- **Fuente** (`data/records.ts`, `data/sample-acceptance.ts`, `data/fixtures.ts`): `SpectyData.decideResult`, de solo lectura por defecto. La muestra y `decideResultIn` viven en `sample-acceptance.ts` para que `fixtures.ts` no pase de 300 líneas.
- **Acciones** (`acceptance/acceptance-actions.ts`): `sp-acceptance-actions`, normal y compacta, y los diálogos para aceptar y pedir ajustes. Abrir «Pedir ajustes» con un texto inicial queda disponible para la fila del criterio.
- **Pestaña** (`acceptance/acceptance-tab.ts`, `criterion-row.ts`, `trace-matrix.ts`): el resumen, el selector de vista (`sp-select`), la lista con filas de documento y la matriz como `<table>` con encabezados de fila y de columna, y celdas que son botones con `aria-pressed`.
- **Página** (`change/change-page.ts`, `change/change-bar.ts`): la pestaña en lugar del texto provisional, y las acciones en la cabecera y en la barra compacta durante la aceptación.

## Archivos

- crear packages/ui/src/data/acceptance.ts — la evidencia por criterio y la decisión sobre el resultado
- crear packages/ui/src/data/acceptance.test.ts — tests del modelo y de la decisión en la fuente de ejemplo
- modificar packages/ui/src/data/records.ts — la acción decideResult
- crear packages/ui/src/data/sample-acceptance.ts — la muestra en aceptación con su evidencia, y aceptar o pedir ajustes en ella
- modificar packages/ui/src/data/fixtures.ts — usar la muestra y la decisión
- crear packages/ui/src/acceptance/acceptance-actions.ts — «Pedir ajustes…», «Aceptar resultado» y sus diálogos
- crear packages/ui/src/acceptance/acceptance-actions.test.ts — tests de las acciones
- crear packages/ui/src/acceptance/acceptance-tab.ts — la pestaña con su resumen y el selector de vista
- crear packages/ui/src/acceptance/criterion-row.ts — un criterio con su evidencia y «No se cumple…»
- crear packages/ui/src/acceptance/trace-matrix.ts — la matriz de trazabilidad
- crear packages/ui/src/acceptance/acceptance-tab.test.ts — tests de la pestaña
- modificar packages/ui/src/change/change-page.ts — la pestaña y las acciones en la cabecera
- modificar packages/ui/src/change/change-bar.ts — las acciones en la barra compacta
- modificar docs/ui.md — la pestaña Aceptación

## Tareas

- [x] T1: La evidencia por criterio y la decisión en la fuente
  - files: packages/ui/src/data/acceptance.ts, packages/ui/src/data/acceptance.test.ts, packages/ui/src/data/records.ts, packages/ui/src/data/sample-acceptance.ts, packages/ui/src/data/fixtures.ts
  - ac: AC1, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/acceptance.test.ts
- [x] T2: Aceptar y pedir ajustes
  - files: packages/ui/src/acceptance/acceptance-actions.ts, packages/ui/src/acceptance/acceptance-actions.test.ts
  - ac: AC4, AC5, AC6
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/acceptance/acceptance-actions.test.ts
- [x] T3: Los criterios con evidencia y la matriz
  - files: packages/ui/src/acceptance/acceptance-tab.ts, packages/ui/src/acceptance/criterion-row.ts, packages/ui/src/acceptance/trace-matrix.ts, packages/ui/src/acceptance/acceptance-tab.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/acceptance/acceptance-tab.test.ts
- [x] T4: La pestaña y las acciones en la página del cambio
  - files: packages/ui/src/change/change-page.ts, packages/ui/src/change/change-bar.ts, docs/ui.md
  - ac: AC1, AC4
  - verify: pnpm check
  - notes: Comprobar en el navegador, a 390 y 1280 px, en claro y oscuro: la evidencia de «Panel de asistencia por curso», cambiar a la matriz y volver, «No se cumple…», y aceptar y pedir ajustes desde la cabecera y desde la barra compacta.

## Riesgos

- R1: Con muchas tareas la matriz es ancha — se desplaza de lado dentro de su caja, y la lista sigue siendo la vista por defecto.
- R2: `records.ts` y `fixtures.ts` están cerca de las 300 líneas — la fuente gana una sola acción, y la muestra y su lógica van en `sample-acceptance.ts`.
