---
kind: standard
follows:
  - 20261021-prototipo-armazon-datos-de-ejemplo-y-bandeja
---

# Prototipo: revisión de spec

## Objetivo

La pestaña Spec de un cambio pasa a ser la pantalla de revisión de docs/ui.md. Se lee por decisiones y no como un documento: supuestos que confirmar o rechazar, criterios con sus avisos, archivos por módulo, tareas, riesgos y diseño plegado. Incluye comentarios anclados a ítems o a citas y una barra de acción para pedir cambios o aprobar. Funciona sobre los datos de ejemplo, con las acciones en memoria.

## Fuera de alcance

- El delta entre revisiones y la marca "posible alcance nuevo": siguiente cambio ("Prototipo: delta de la revisión").
- La edición en línea, reordenar tareas y el modo fuente (CodeMirror): llegan con la edición de la spec.
- El resaltado de código del diseño (Shiki): llega con el modo fuente.
- La actividad (eventos de auditoría) en la columna de comentarios.

## Supuestos

- A1: El cambio 5 de la división se parte en dos para respetar el tamaño máximo de Specty: este, con la revisión, y el siguiente, con el delta.
  - impacto: alto
- A2: El contrato de datos crece: `ChangeRecord` incluye los comentarios (`comments.json`, formats.md §5), y `SpectyData` añade `decideAssumption`, `addComment`, `requestChanges` y `approve` (atada al número de revisión). Por defecto, las acciones fallan con "fuente de solo lectura", así que una fuente sin acciones sigue siendo válida. Los datos de ejemplo las implementan en memoria, y el servidor lo hará en el cambio 9.
  - impacto: alto
- A3: El Markdown (objetivo, fuera de alcance y diseño) se pinta con `marked` 18.1.1 (MIT), y Angular sanea el HTML resultante.
- A4: En los datos de ejemplo, quien revisa es una persona ficticia, "Ana Gómez".
- A5: Además del tooltip, el motivo por el que "Aprobar" está deshabilitado se ve como texto en la barra (riesgo R1 del cambio de componentes).

## Criterios de aceptación

- AC1: CUANDO se abre la pestaña Spec de un cambio ENTONCES la revisión muestra, en este orden, Objetivo y Fuera de alcance, Supuestos, Criterios, Archivos, Tareas, Riesgos y Diseño (plegado), y un índice de secciones lleva a cada una y marca las que tienen pendientes, comentarios o avisos.
- AC2: CUANDO la spec está en revisión ENTONCES cada supuesto se muestra como tarjeta con su impacto y su decisión, con Confirmar y Rechazar; rechazar exige escribir el motivo, que queda junto al supuesto, y la decisión se guarda en la fuente y se ve al momento.
- AC3: CUANDO un criterio es vago o no sigue la forma CUANDO … ENTONCES ENTONCES el aviso aparece en línea, con icono y texto, en el idioma elegido.
- AC4: CUANDO se ven los archivos y las tareas ENTONCES los archivos aparecen agrupados por módulo, con insignias de crear, modificar, borrar o renombrar y la marca de ruta sensible (con icono y texto); y cada tarea muestra su estado y chips con sus criterios y sus archivos.
- AC5: CUANDO el objetivo, el fuera de alcance o el diseño contienen Markdown ENTONCES se muestran con formato y sin ejecutar scripts ni HTML peligroso.
- AC6: CUANDO la persona pasa el puntero o el foco por un ítem, o selecciona texto de una sección, ENTONCES puede comentar ese ítem o esa cita; el comentario aparece en la columna de comentarios con su ancla, su autor y su hora, y se guarda en la fuente.
- AC7: CUANDO la spec está en revisión ENTONCES una barra de acción fija ofrece "Pedir cambios" (deshabilitado, con su motivo, si no hay comentarios sin resolver) y "Aprobar" (deshabilitado mientras haya supuestos de alto impacto sin decidir o errores de validación, con el motivo en el tooltip y también como texto visible); aprobar aprueba la revisión mostrada, lo confirma con un aviso y el cambio pasa a implementación.
- AC8: CUANDO la spec no está en revisión ENTONCES se muestra en solo lectura: sin barra de acción ni botones de decisión, pero con los comentarios visibles.
- AC9: CUANDO la fuente no admite una acción ENTONCES la acción falla con un mensaje claro y la UI lo muestra como aviso de error.

## Diseño

- **Contrato** (`data/records.ts`):
  - `CommentRecord`, igual que en formats.md §5, con un ancla `{ item }` o `{ section, quote }`;
  - `ChangeRecord.comments`;
  - en `SpectyData`, las acciones concretas que rechazan por defecto;
  - `ReviewView` dentro de `ChangeView`, con datos planos para que viajen desde el worker.
- **Derivación** (`data/review.ts`, solo en el worker):
  - avisos por ítem con `validateSpec`, ejecutado con la spec en `es` y en `en` para tener los textos en los dos idiomas;
  - errores de validación que bloquean la aprobación;
  - supuestos con su decisión (`state.items`) y su comentario;
  - archivos agrupados con `moduleOf` y marcados con `isSensitive` (configuración por defecto hasta que la fuente entregue `config.yaml`);
  - tareas con su estado;
  - comentarios, los no resueltos primero;
  - un índice con contadores por sección.
- **Datos de ejemplo**:
  - la spec en revisión suma un diseño con Markdown y código, un criterio vago y dos comentarios (uno sobre un supuesto y otro sobre una cita del diseño);
  - `FixtureData` implementa las acciones y avisa a sus suscriptores. Al aprobar, el cambio pasa a implementación con `approved`, canal `ui`.
- **Pantalla** (`review/`):
  - `sp-spec-review` organiza tres columnas que se apilan en pantallas estrechas: índice, secciones y comentarios. La barra de acción queda `sticky` al pie del contenido.
  - `spec-sections.ts` contiene las secciones: tarjetas de supuesto con un diálogo para rechazar con motivo, criterios con avisos, árbol de archivos, tareas con chips y riesgos.
  - `comments.ts` contiene la columna y el redactor: comentar un ítem desde su botón, que aparece con el puntero o el foco, o comentar la selección de texto de una sección, detectada con `selectionchange`.
  - `markdown.ts` (`sp-markdown`) usa `marked` y `[innerHTML]` saneado por Angular.
- **Pestaña Spec** (`change/change-page.ts`): usa `sp-spec-review` en lugar del resumen provisional.

## Archivos

- modificar packages/ui/package.json — marked
- modificar packages/ui/src/data/records.ts — comentarios, acciones de revisión y vista de revisión
- crear packages/ui/src/data/review.ts — derivación de la revisión con core
- modificar packages/ui/src/data/views.ts — la revisión dentro de la vista del cambio
- modificar packages/ui/src/data/fixtures.ts — comentarios de ejemplo y acciones en memoria
- modificar packages/ui/src/data/sample-specs.ts — diseño con Markdown y un criterio vago
- crear packages/ui/src/review/markdown.ts — Markdown saneado
- crear packages/ui/src/review/spec-sections.ts — secciones de la revisión
- crear packages/ui/src/review/comments.ts — columna y redactor de comentarios
- crear packages/ui/src/review/spec-review.ts — índice, secciones, comentarios y barra de acción
- modificar packages/ui/src/change/change-page.ts — la pestaña Spec usa la revisión

## Tareas

- [x] T1: Contrato y derivación de la revisión
  - files: packages/ui/src/data/records.ts, packages/ui/src/data/review.ts, packages/ui/src/data/views.ts
  - ac: AC1, AC3, AC4, AC9
  - verify: pnpm --filter @baquia-dev/specty-ui test
- [ ] T2: Datos de ejemplo y acciones en memoria
  - files: packages/ui/src/data/fixtures.ts, packages/ui/src/data/sample-specs.ts
  - ac: AC2, AC6, AC7
  - verify: pnpm --filter @baquia-dev/specty-ui test
- [ ] T3: Markdown y secciones de la revisión
  - files: packages/ui/package.json, packages/ui/src/review/markdown.ts, packages/ui/src/review/spec-sections.ts
  - ac: AC2, AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty-ui test
- [ ] T4: Comentarios anclados
  - files: packages/ui/src/review/comments.ts
  - ac: AC6
  - verify: pnpm --filter @baquia-dev/specty-ui test
- [ ] T5: Pantalla de revisión y barra de acción
  - files: packages/ui/src/review/spec-review.ts, packages/ui/src/change/change-page.ts
  - ac: AC1, AC7, AC8, AC9
  - verify: pnpm check
  - notes: Comprobar con `ng build --stats-json` que `marked` solo está en el fragmento del cambio, no en el inicial.

## Riesgos

- R1: Anclar comentarios a una selección de texto es frágil: la cita puede cruzar varias secciones o desaparecer en la revisión siguiente. Mitigación: solo se ofrece si la selección cae dentro de una sola sección; la cita se guarda literal, y el agente la recibe tal cual (formats.md §5).
- R2: La vista del cambio crece al incluir la revisión entera. Mitigación: son datos planos derivados en el worker; con pocos cambios activos el coste es bajo. Si crece, se derivará la revisión bajo demanda por id.
- R3: Algunas piezas pueden superar las 300 líneas (secciones, revisión). Mitigación: componentes pequeños por sección dentro de `spec-sections.ts`, y si no basta, pedir un archivo más con `specty scope add`.
