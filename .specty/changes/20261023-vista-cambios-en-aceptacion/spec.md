---
kind: standard
follows:
  - 20261023-resaltado-de-sintaxis
---

# Vista Cambios en Aceptación

## Objetivo

La pestaña Aceptación gana una tercera vista, «Cambios», con el diff del cambio completo o de cada tarea en el visor de diffs. Desde la evidencia de cada criterio y desde la matriz, «Ver diff» lleva al diff de esa tarea, así la persona comprueba qué hizo cada una antes de aceptar.

## Fuera de alcance

- Comentar líneas del diff o pedir ajustes desde una línea.
- El servidor local que ejecuta git: la fuente de ejemplo ya da los diffs.
- Diffs en otras pestañas (Progreso, Historial).

## Supuestos

- A1: El selector «Vista» de Aceptación pasa a tener tres opciones (Criterios, Matriz y Cambios) y se sigue recordando en el navegador.
  - impacto: alto
- A2: «Cambios» muestra el visor con una barra «Qué cambios ver»: «Todo el cambio» y una opción por cada tarea con commit (T1, T2…), con el selector segmentado. Con una sola tarea con commit, la barra no aparece y se ve el cambio completo. El rango del resumen es el commit de partida y el commit de la tarea; para el cambio completo, del commit de partida de la primera tarea al commit de la última.
  - impacto: alto
- A3: El diff se pide a la fuente (`diff(change, task?)`) cada vez que cambia lo elegido o llega un commit nuevo. Mientras llega se ven líneas de carga; si la fuente no puede darlo, su mensaje explica por qué, sin romper la pestaña. Sin ninguna tarea con commit, un estado vacío dice que aún no hay cambios que ver.
- A4: «Ver diff» aparece junto al commit de cada tarea en la evidencia de un criterio (se revela al pasar o enfocar la fila, como «No se cumple…») y en el detalle de la matriz. Cambia la vista a «Cambios» con esa tarea elegida y lleva el foco al título de la vista, para que el teclado y el lector de pantalla sigan donde está el diff.
- A5: En el teléfono el visor ya muestra solo la vista unificada; la barra de qué cambios ver pasa a la línea siguiente si no cabe.

## Criterios de aceptación

- AC1: CUANDO la persona elige la vista «Cambios» ENTONCES ve el diff del cambio completo en el visor, con el rango de commits, y la elección se recuerda.
- AC2: CUANDO elige una tarea en «Qué cambios ver» ENTONCES ve solo el diff de esa tarea, con su rango.
- AC3: CUANDO pulsa «Ver diff» en la evidencia de un criterio o en el detalle de la matriz ENTONCES pasa a «Cambios» con esa tarea elegida y el foco en la vista.
- AC4: CUANDO el diff está cargando, la fuente no lo puede dar o no hay commits ENTONCES la vista lo dice, sin romper la pestaña.

## Diseño

- **Vista** (`acceptance/changes-view.ts`, `sp-changes-view`): recibe el cambio y la tarea elegida (un `model`), pide el diff con `resource()` a `SpectyData`, lo lee con `parseDiff` y lo muestra en `sp-diff-viewer` con la barra proyectada.
- **Pestaña** (`acceptance/acceptance-tab.ts`): la tercera opción del selector y la tarea elegida; atiende «Ver diff» de las filas y de la matriz.
- **Filas y matriz** (`criterion-row.ts`, `trace-matrix.ts`): «Ver diff» emite la tarea con un `output`.

## Archivos

- crear packages/ui/src/acceptance/changes-view.ts — la vista Cambios
- crear packages/ui/src/acceptance/changes-view.test.ts — tests de la vista
- modificar packages/ui/src/acceptance/acceptance-tab.ts — la tercera vista y «Ver diff»
- modificar packages/ui/src/acceptance/acceptance-tab.test.ts — tests de la vista y de «Ver diff»
- modificar packages/ui/src/acceptance/criterion-row.ts — «Ver diff» en la evidencia
- modificar packages/ui/src/acceptance/trace-matrix.ts — «Ver diff» en el detalle
- modificar docs/ui.md — la vista Cambios en Aceptación

## Tareas

- [x] T1: La vista Cambios
  - files: packages/ui/src/acceptance/changes-view.ts, packages/ui/src/acceptance/changes-view.test.ts
  - ac: AC2, AC4
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/acceptance/changes-view.test.ts
- [ ] T2: Cambios en la pestaña y «Ver diff»
  - files: packages/ui/src/acceptance/acceptance-tab.ts, packages/ui/src/acceptance/acceptance-tab.test.ts, packages/ui/src/acceptance/criterion-row.ts, packages/ui/src/acceptance/trace-matrix.ts, docs/ui.md
  - ac: AC1, AC3
  - verify: pnpm check
  - notes: Comprobar en el navegador, en «Panel de asistencia por curso», a 390 y 1280 px y en claro y oscuro: la vista Cambios, elegir T1 y T2, «Ver diff» desde un criterio y desde la matriz, y el foco al llegar.
