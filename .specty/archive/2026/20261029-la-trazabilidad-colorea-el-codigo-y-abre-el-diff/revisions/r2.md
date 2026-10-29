---
kind: standard
---

# La trazabilidad colorea el código y abre el diff de cada bloque

## Objetivo

La vista de trazabilidad del Historial enseña el código en texto plano y no deja ver qué cambió cada bloque. El código pasa a colorearse como en el visor de diffs, y cada bloque que hizo Specty ofrece «Ver diff»: bajo el bloque se abre el diff de ese archivo en la tarea que lo escribió, de este cambio o de otro.

## Fuera de alcance

- Llevar a la vista «Cambios» de la pestaña Aceptación: el diff se abre en la propia trazabilidad.
- Marcar, dentro del diff, las líneas exactas del bloque.
- El diff de un commit hecho fuera de Specty, que no tiene tarea.

## Supuestos

- A1: El coloreado es el del visor de diffs (`HIGHLIGHT`, con Shiki y sus mismos lenguajes y límite de líneas): el archivo se le pasa como una sola sección de líneas de contexto. Sin lenguaje o pasado el límite, el código sale en texto plano.
- A2: El diff de un bloque es el de su tarea (`diff(cambio, tarea)` de la fuente), filtrado al archivo trazado y enseñado con `sp-diff-file`; se abre bajo el bloque y uno a la vez.
  - impacto: medio

## Criterios de aceptación

- AC1: CUANDO la vista de trazabilidad muestra un archivo de un lenguaje que el visor de diffs colorea ENTONCES su código sale con los mismos colores; si no, en texto plano.
- AC2: CUANDO la persona pulsa «Ver diff» en el margen de un bloque que hizo Specty ENTONCES bajo el bloque se abre el diff de ese archivo en la tarea del bloque, de su cambio sea este u otro, y «Ocultar diff» lo cierra; un bloque de fuera de Specty no lo ofrece.
- AC3: CUANDO la fuente no puede dar ese diff, o la tarea no cambió ese archivo ENTONCES el panel lo dice, con el motivo de la fuente.

## Diseño

- `trace-view.ts`: el archivo como una sección de contexto para `HIGHLIGHT` y sus líneas en piezas (`spansOf`), como en `sp-diff-file`; en el margen de cada bloque con tarea, el botón «Ver diff» / «Ocultar diff» (`aria-expanded`), y bajo el bloque abierto, `sp-trace-diff`.
- `trace-diff.ts` (`sp-trace-diff`): pide `diff(cambio, tarea)` a la fuente, toma el archivo trazado y lo enseña con `sp-diff-file`; mientras carga, líneas de carga; si falla o no está, lo dice.

## Archivos

- modificar packages/ui/src/history/trace-view.ts — el código coloreado y «Ver diff» por bloque
- crear packages/ui/src/history/trace-diff.ts — el diff de un archivo en la tarea de un bloque
- crear packages/ui/src/history/trace-diff.test.ts — los colores, abrir y cerrar el diff, y sus motivos
- modificar docs/ui.md — la trazabilidad coloreada y con su diff

## Tareas

- [x] T1: El código coloreado y el diff de cada bloque en la trazabilidad
  - files: packages/ui/src/history/trace-view.ts, packages/ui/src/history/trace-diff.ts, packages/ui/src/history/trace-diff.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/history && pnpm --filter @baquia-dev/specty-ui typecheck && pnpm lint && pnpm knip
- [x] T2: Documentar la trazabilidad coloreada y su diff
  - files: docs/ui.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Cierre

### Resumen

La trazabilidad del Historial colorea el código con el resaltado del visor de diffs (el archivo pasa como una sección de líneas de contexto), y en el margen de cada bloque que hizo Specty ofrece «Ver diff»: bajo el bloque se abre el diff de ese archivo en la tarea del bloque, de este cambio o de otro (`history/trace-diff.ts`, con `sp-diff-file`), y «Ocultar diff» lo cierra. Si la fuente no puede dar el diff, o la tarea no cambió el archivo, el panel lo dice. En el prototipo funciona con los diffs de muestra de «Panel de asistencia por curso». El bundle inicial queda en 524,6 kB.

### Desviaciones

Ninguna.

### Decisiones

- El diff se abre en la propia trazabilidad y no en la vista «Cambios» de Aceptación: no hace falta pasar la tarea por la URL, y la página del cambio y la pestaña Aceptación quedan para el cambio de pestañas fijas que lleva Antigravity.
- Uno abierto a la vez; elegir otro archivo lo cierra.

### Pendientes

- Marcar dentro del diff las líneas exactas del bloque.
