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
- A6: Al bajar por el diff, el título «Cambios» y la barra (qué cambios ver y «Unificado | Lado a lado») se quedan fijos arriba, justo bajo la barra compacta del cambio (`--sp-sticky-top`), sobre el fondo de la página, hasta que termina el diff. Es una sola franja que pertenece al visor de diffs, así en el catálogo también se queda fija. Mientras carga o si falla, el visor sigue montado con su franja y muestra el estado en lugar del diff, para que el título y la barra no se muevan ni pierdan el foco.
  - impacto: alto

## Criterios de aceptación

- AC1: CUANDO la persona elige la vista «Cambios» ENTONCES ve el diff del cambio completo en el visor, con el rango de commits, y la elección se recuerda; al bajar por el diff, el título y la barra de qué cambios ver y del modo siguen a la vista.
- AC2: CUANDO elige una tarea en «Qué cambios ver» ENTONCES ve solo el diff de esa tarea, con su rango.
- AC3: CUANDO pulsa «Ver diff» en la evidencia de un criterio o en el detalle de la matriz ENTONCES pasa a «Cambios» con esa tarea elegida y el foco en la vista.
- AC4: CUANDO el diff está cargando, la fuente no lo puede dar o no hay commits ENTONCES la vista lo dice, sin romper la pestaña.

## Diseño

- **Vista** (`acceptance/changes-view.ts`, `sp-changes-view`): recibe el cambio y la tarea elegida (un `model`), pide el diff con `resource()` a `SpectyData`, lo lee con `parseDiff` y lo muestra en `sp-diff-viewer` con la barra proyectada.
- **Pestaña** (`acceptance/acceptance-tab.ts`): la tercera opción del selector y la tarea elegida; atiende «Ver diff» de las filas y de la matriz.
- **Filas y matriz** (`criterion-row.ts`, `trace-matrix.ts`): «Ver diff» emite la tarea con un `output`.
- **Franja fija** (`components/diff-viewer.ts`): arriba del visor, `sticky` en `--sp-sticky-top`, con un título proyectado (`[diffHeading]`) y la barra. `files` puede faltar (aún no leído o ilegible): entonces muestra el estado proyectado (`[diffStatus]`) en vez del resumen y los archivos. `busy` atenúa lo de debajo de la franja mientras llega otro diff.

## Archivos

- crear packages/ui/src/acceptance/changes-view.ts — la vista Cambios
- crear packages/ui/src/acceptance/changes-view.test.ts — tests de la vista
- modificar packages/ui/src/acceptance/acceptance-tab.ts — la tercera vista y «Ver diff»
- modificar packages/ui/src/acceptance/acceptance-tab.test.ts — tests de la vista y de «Ver diff»
- modificar packages/ui/src/acceptance/criterion-row.ts — «Ver diff» en la evidencia
- modificar packages/ui/src/acceptance/trace-matrix.ts — «Ver diff» en el detalle
- modificar docs/ui.md — la vista Cambios en Aceptación
- modificar packages/ui/src/components/diff-viewer.ts — la franja fija con el título y la barra, el estado mientras no hay diff y el diff atenuado mientras llega otro

## Tareas

- [x] T1: La vista Cambios
  - files: packages/ui/src/acceptance/changes-view.ts, packages/ui/src/acceptance/changes-view.test.ts
  - ac: AC2, AC4
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/acceptance/changes-view.test.ts
- [x] T2: Cambios en la pestaña y «Ver diff»
  - files: packages/ui/src/acceptance/acceptance-tab.ts, packages/ui/src/acceptance/acceptance-tab.test.ts, packages/ui/src/acceptance/criterion-row.ts, packages/ui/src/acceptance/trace-matrix.ts, docs/ui.md
  - ac: AC1, AC3
  - verify: pnpm check
  - notes: Comprobar en el navegador, en «Panel de asistencia por curso», a 390 y 1280 px y en claro y oscuro: la vista Cambios, elegir T1 y T2, «Ver diff» desde un criterio y desde la matriz, y el foco al llegar.
- [x] T3: El título y la barra de Cambios, fijos al bajar
  - files: packages/ui/src/components/diff-viewer.ts, packages/ui/src/acceptance/changes-view.ts, packages/ui/src/acceptance/changes-view.test.ts, docs/ui.md
  - ac: AC1
  - verify: pnpm check
  - notes: Comprobar en el navegador, a 390 y 1280 px y en claro y oscuro, que al bajar por el diff la franja queda bajo la barra compacta sin taparla ni dejar ver el código por detrás, que se va al acabar el diff, que en el catálogo también se queda fija y que «Ver diff» sigue dejando el foco en el título.

## Cierre

### Resumen

La pestaña Aceptación tiene la vista «Cambios»: el diff del cambio completo o de cada tarea con commit, en el visor de diffs, con su rango de commits. Se pide a la fuente y se relee al elegir otra cosa o al llegar un commit. «Ver diff», desde la evidencia de un criterio o desde el detalle de la matriz, lleva al diff de esa tarea con el foco en el título. El título y la barra (qué cambios ver y el modo) forman la franja fija del visor, bajo la barra compacta del cambio. Mientras carga hay líneas de carga; al cambiar de tarea, el diff anterior espera atenuado; si la fuente falla, lo dice con sus palabras; sin commits, un estado vacío lo explica.

### Desviaciones

- **Ajuste en la revisión 2:** la persona pidió que el título y la barra no se perdieran al bajar por el diff. Se refinó AC1 y se añadieron A6 y T3, que tocó `components/diff-viewer.ts`, fuera de los archivos aprobados al principio: la franja fija es del visor porque el selector de modo vive en él, y por eso también se queda fija en el catálogo.
- **El visor admite un diff que aún no está:** `files` sin valor muestra el estado que proyecta quien lo usa (`[diffStatus]`), y `busy` atenúa el diff mientras llega otro; la vista Cambios ya no envuelve el diff para atenuarlo.
- **Servidores de desarrollo con una compilación vieja:** tras un error de un paso intermedio, `ng serve` siguió sirviendo la versión anterior hasta reiniciarlo. No afecta al código.

### Decisiones

- **La tarea elegida es un `model` de la vista:** la pestaña la fija con «Ver diff», y una tarea sin commit vale como «Todo el cambio».
- **El diff anterior espera atenuado:** así la barra no se desmonta mientras llega el siguiente y el foco no se pierde.
- **«Ver diff» discreto en la evidencia:** al final de la línea de cada tarea, se revela al pasar o enfocar la fila, como «No se cumple…»; en el detalle de la matriz está siempre a la vista, junto al commit.
- **La franja sigue a `--sp-sticky-top`:** queda bajo la barra compacta del cambio y, donde no la hay, arriba del todo. Su relleno entra en los huecos de alrededor, así no mueve nada mientras no está fija.
- **Tests sin colores:** los de la pestaña y la vista inyectan un resaltado vacío; los colores se prueban con el visor.

### Pendientes

- **El servidor local:** ejecutar git para cada tarea y para el cambio completo; hoy solo la fuente de ejemplo da diffs.
- **La parte fija en el teléfono:** barra compacta y franja ocupan algo más de un cuarto de la pantalla; si estorba, se puede fijar solo la barra.
- **Presupuesto de la carga inicial:** 656 kB frente a 500 kB, anotado ya en el cambio anterior.
