---
kind: standard
follows:
  - 20261022-prototipo-revision-de-spec
---

# Prototipo: revisión con formato de documento

## Objetivo

La revisión de la spec se lee como un documento bien maquetado, no como un tablero de tarjetas. Las secciones van numeradas y separadas por divisores tipográficos, y la sección elegida en el índice se resalta con una animación breve. La cabecera del cambio es amplia arriba del todo y, al desplazarse, deja paso a una barra compacta fija con lo esencial y las acciones. Es el diseño elegido en la maqueta "Specty · Revisión como documento".

## Fuera de alcance

- El delta entre revisiones: siguiente cambio ("Prototipo: delta de la revisión").
- El margen inferior en el armazón común: sigue en cada página.
- Cambios en los datos, el worker o las acciones de `SpectyData`.
- Las pestañas Progreso, Aceptación e Historial, que siguen siendo provisionales.

## Supuestos

- A1: La barra compacta solo informa: no lleva "Pedir cambios" ni "Aprobar rN", que siguen únicamente en la barra de decisión del pie.
  - impacto: alto
- A2: La barra compacta aparece cuando la cabecera amplia sale de la vista (IntersectionObserver). Sin IntersectionObserver queda oculta y la cabecera amplia sigue sirviendo.
- A3: Los iconos por sección desaparecen: el número de sección los sustituye en el índice y en los divisores, como en la maqueta.
- A4: El resalte de la sección elegida dura unos 1,4 s; con movimiento reducido se marca sin transición.

## Criterios de aceptación

- AC1: CUANDO se abre la pestaña Spec ENTONCES cada sección empieza con un divisor tipográfico (número "§ 0N", línea fina y, a la derecha, su progreso), seguido del título, la línea de qué se espera y el contenido, sin tarjetas; los supuestos, criterios, tareas y riesgos se muestran como filas separadas por líneas finas, con su identificador en una columna fija, y el supuesto de alto impacto sin decidir se distingue con un fondo tenue, además de su chip con icono y texto.
- AC2: CUANDO la persona elige una sección en el índice numerado ENTONCES la página se desplaza hasta ella y la sección se resalta: la línea del divisor se dibuja de izquierda a derecha, el número se oscurece y el fondo se ilumina, y vuelve a su estado normal poco después; con movimiento reducido no hay transición.
- AC3: CUANDO la página del cambio está arriba del todo ENTONCES la cabecera muestra la ruta de vuelta, la fase con lo que espera de la persona y desde cuándo, el título grande, una franja de datos (revisión, rama, tamaño con sus razones, esfuerzo recomendado y lo que queda por decidir) y las pestañas.
- AC4: CUANDO la cabecera amplia sale de la vista al desplazarse ENTONCES aparece arriba, con una transición, una barra compacta fija con la fase, el título recortado, la revisión, la sección que se está leyendo (en la pestaña Spec) y el resumen de supuestos de alto impacto decididos y comentarios, sin botones de acción; mientras está oculta no recibe el foco ni la lee un lector de pantalla.

## Diseño

- **Documento** (`review/spec-review.ts`):
  - Índice "Contenido" numerado, con contadores de pendientes, avisos y comentarios.
  - Cada sección: divisor con número, línea y progreso; `h2`; pista; contenido.
  - `go()` además marca la sección (`data-flash`) y la desmarca con un temporizador que se limpia al destruir.
  - La sección leída sale como `model` (`reading`) para que la barra compacta la muestre.
- **Filas** (`review/assumption-row.ts`, desde `spec-sections.ts`): el supuesto y su diálogo de rechazo salen a su propio archivo por el límite de 300 líneas; criterios, archivos, tareas y riesgos pasan a filas con divisores.
- **Metadatos** (`review/section-meta.ts`): sin iconos.
- **Comentarios** (`review/comments.ts`): lista con divisores en lugar de tarjetas.
- **Cabecera** (`change/change-page.ts`): cabecera amplia en el flujo y barra compacta fija a ancho completo, de altura cero en el flujo para no empujar el contenido. Oculta con `inert`, transparencia y desplazamiento; visible cuando la cabecera amplia no interseca. `--sp-sticky-top` pasa a ser la altura de la barra compacta.
- **docs/ui.md**: la revisión como documento, la cabecera amplia y la barra compacta.

## Archivos

- modificar docs/ui.md — revisión como documento, cabecera amplia y barra compacta
- crear packages/ui/src/review/assumption-row.ts — supuesto como fila y diálogo de rechazo
- modificar packages/ui/src/review/spec-sections.ts — criterios, archivos, tareas y riesgos como filas
- modificar packages/ui/src/review/spec-sections.test.ts — tests de las filas
- modificar packages/ui/src/review/section-meta.ts — sin iconos
- modificar packages/ui/src/review/comments.ts — lista con divisores
- modificar packages/ui/src/review/spec-review.ts — divisores, índice numerado y resalte
- modificar packages/ui/src/review/spec-review.test.ts — tests del documento y del resalte
- modificar packages/ui/src/change/change-page.ts — cabecera amplia y barra compacta
- modificar packages/ui/src/change/change-page.test.ts — tests de las dos cabeceras

## Tareas

- [x] T1: Supuestos y demás ítems como filas
  - files: packages/ui/src/review/assumption-row.ts, packages/ui/src/review/spec-sections.ts, packages/ui/src/review/spec-sections.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-ui test
- [x] T2: Revisión como documento con resalte de la sección elegida
  - files: packages/ui/src/review/section-meta.ts, packages/ui/src/review/comments.ts, packages/ui/src/review/spec-review.ts, packages/ui/src/review/spec-review.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui test
- [x] T3: Cabecera amplia y barra compacta fija
  - files: packages/ui/src/change/change-page.ts, packages/ui/src/change/change-page.test.ts, docs/ui.md
  - ac: AC3, AC4
  - verify: pnpm check

## Riesgos

- R1: Una barra oculta que siga siendo enfocable confunde al teclado y al lector de pantalla. Mitigación: `inert` mientras está oculta, comprobado en los tests.
