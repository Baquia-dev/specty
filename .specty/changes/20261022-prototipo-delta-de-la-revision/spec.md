---
kind: standard
follows:
  - 20261022-prototipo-revision-con-formato-de-documento
---

# Prototipo: delta de la revisión

## Objetivo

Cuando una spec vuelve a revisión después de haber sido aprobada (por ejemplo, tras un ajuste), la pestaña Spec muestra primero "Qué cambió desde que aprobaste": los ítems añadidos, modificados y eliminados, con diff por palabras, y la marca "posible alcance nuevo" en las tareas nuevas que tocan archivos no previstos. La spec completa queda como acción secundaria (docs/ui.md, "Revisión del delta"). Funciona sobre los datos de ejemplo.

## Fuera de alcance

- El delta entre revisiones que no se aprobaron (por ejemplo, r2 tras pedir cambios sobre r1): esas siguen mostrando la spec completa.
- El delta en otras fases (ajuste, cierre) y en el Historial.
- Resolver comentarios por revisión.
- Cambios en el core o en el CLI.

## Supuestos

- A1: El contrato de datos crece: `ChangeRecord.approvedSpec` trae el texto de la última revisión aprobada (`revisions/r<N>.md`, con N = `state.approved.revision`). Solo existe si el cambio tiene una aprobación; el servidor lo rellenará en el cambio 9.
  - impacto: alto
- A2: El delta se calcula contra la última revisión aprobada, igual que `specty propose`, con `specDelta` y `hashUnits` del core, en el worker.
  - impacto: alto
- A3: El diff por palabras es propio (subsecuencia común más larga sobre palabras y espacios), sin dependencias nuevas: los textos de ítems y secciones son cortos.
- A4: "Posible alcance nuevo" reutiliza la regla del core `possible-new-scope` (validación en contexto de ajuste contra la revisión aprobada), así que la UI y el CLI dicen lo mismo, en los dos idiomas.
- A5: Los datos de ejemplo suman un cambio, "Justificar faltas desde la app", en revisión r3 con r2 aprobada: vuelve de un ajuste con un criterio y un supuesto modificados, una tarea nueva que toca un archivo no previsto y un riesgo eliminado. La Bandeja pasa a tener cinco decisiones.

## Criterios de aceptación

- AC1: CUANDO se abre la pestaña Spec de un cambio en revisión que ya tuvo una revisión aprobada ENTONCES se muestra primero "Qué cambió desde que aprobaste rN": un resumen de añadidos, modificados y eliminados, y los cambios agrupados por sección en el orden del documento, cada uno con su identificador, una marca de añadido, modificado o eliminado (color, icono y texto) y la opción de comentarlo; "Ver spec completa" lleva a la revisión completa, y desde ella se puede volver a los cambios.
- AC2: CUANDO un ítem o una sección de texto se modificó ENTONCES su texto se muestra con diff por palabras: lo añadido resaltado y lo eliminado tachado, con un texto oculto que dice a los lectores de pantalla qué se añadió y qué se eliminó; un ítem añadido se muestra entero como añadido y uno eliminado, entero tachado.
- AC3: CUANDO una tarea nueva toca archivos que no estaban en los archivos aprobados ENTONCES lleva la marca "Posible alcance nuevo" con el motivo, con icono y texto, en el idioma elegido.
- AC4: CUANDO entre los cambios hay supuestos añadidos o modificados ENTONCES se pueden confirmar o rechazar desde los cambios, igual que en la revisión completa, y "Aprobar" sigue esperando por los de alto impacto.
- AC5: CUANDO el cambio no está en revisión o no tiene una revisión aprobada ENTONCES la pestaña Spec muestra la revisión completa como hasta ahora.

## Diseño

- **Contrato** (`data/records.ts`): `ChangeRecord.approvedSpec?`; `ReviewView.delta?` con la revisión aprobada, los contadores y las entradas. Cada entrada lleva clave, tipo, cambio, sección, el diff (partes iguales, añadidas o eliminadas) y los avisos de posible alcance nuevo. Son datos planos para que viajen desde el worker.
- **Derivación** (`data/delta.ts`, solo en el worker): `specDelta(aprobada, actual)`; el texto de cada unidad sale de `hashUnits`, sin el prefijo de lista ni el id. Se omiten el frontmatter y los cambios de "lista/ninguno" de las secciones de ítems, que ya cubren sus ítems. `views.ts` lo añade a la revisión solo en `review` con `approvedSpec`.
- **Vista** (`review/delta-review.ts`): cabecera "Qué cambió desde que aprobaste rN" con el resumen y "Ver spec completa"; grupos por sección con el mismo divisor tipográfico del documento; filas con id, marca de cambio, diff y avisos. Los supuestos usan `sp-assumption-row` con el diff en lugar del texto, para decidirlos ahí mismo.
- **Diff** (`sp-word-diff`, en `spec-sections.ts`): `<ins>` y `<del>` con los colores de fase de terminado y cancelado, y texto solo para lectores de pantalla.
- **Revisión** (`review/spec-review.ts`): si hay delta, empieza en modo "cambios" (sin índice) y alterna con la spec completa. La barra de decisión sale a `review/review-actions.ts` para respetar el límite de 300 líneas.

## Archivos

- modificar packages/ui/src/data/records.ts — revisión aprobada en el registro y delta en la vista
- crear packages/ui/src/data/delta.ts — delta con core, diff por palabras y posible alcance nuevo
- crear packages/ui/src/data/delta.test.ts — tests del delta y del diff
- modificar packages/ui/src/data/views.ts — el delta dentro de la revisión
- crear packages/ui/src/data/sample-revisions.ts — cambio de ejemplo que vuelve a revisión tras un ajuste
- modificar packages/ui/src/data/fixtures.ts — añade ese cambio
- modificar packages/ui/src/data/fixtures.test.ts — nueve cambios de ejemplo
- modificar packages/ui/src/inbox/inbox.test.ts — cinco decisiones
- modificar packages/ui/src/review/spec-sections.ts — sp-word-diff
- modificar packages/ui/src/review/assumption-row.ts — diff opcional en lugar del texto
- crear packages/ui/src/review/delta-review.ts — vista de los cambios
- crear packages/ui/src/review/delta-review.test.ts — tests de la vista
- crear packages/ui/src/review/review-actions.ts — barra de decisión
- modificar packages/ui/src/review/spec-review.ts — modo cambios y spec completa
- modificar packages/ui/src/review/spec-review.test.ts — tests del modo cambios

## Tareas

- [x] T1: Delta de la revisión en los datos
  - files: packages/ui/src/data/records.ts, packages/ui/src/data/delta.ts, packages/ui/src/data/delta.test.ts, packages/ui/src/data/views.ts
  - ac: AC1, AC2, AC3, AC5
  - verify: pnpm --filter @baquia-dev/specty-ui test
- [x] T2: Cambio de ejemplo que vuelve a revisión
  - files: packages/ui/src/data/sample-revisions.ts, packages/ui/src/data/fixtures.ts, packages/ui/src/data/fixtures.test.ts, packages/ui/src/inbox/inbox.test.ts
  - ac: AC1, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui test
- [x] T3: Vista de los cambios con diff por palabras
  - files: packages/ui/src/review/spec-sections.ts, packages/ui/src/review/assumption-row.ts, packages/ui/src/review/delta-review.ts, packages/ui/src/review/delta-review.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-ui test
- [ ] T4: La revisión empieza por los cambios
  - files: packages/ui/src/review/review-actions.ts, packages/ui/src/review/spec-review.ts, packages/ui/src/review/spec-review.test.ts
  - ac: AC1, AC4, AC5
  - verify: pnpm check

## Riesgos

- R1: El diff por subsecuencia común crece con el producto de las longitudes. Mitigación: se calcula en el worker, sobre ítems y secciones sueltos; si un texto supera un umbral, se muestra entero como eliminado y añadido.
- R2: Un diff solo visual no lo entiende un lector de pantalla. Mitigación: texto oculto antes de cada parte añadida o eliminada, comprobado en los tests.
