---
kind: standard
---

# La pestaña Spec muestra los cortes de una épica

## Objetivo

Quien revisa una épica en la pestaña Spec de `specty ui` ve su sección «Cortes»: cada corte con su título, los criterios que cubre y de qué cortes depende, y puede comentarlo como cualquier otro ítem. Si un cambio ya implementa el corte, su título lleva a ese cambio y se ve su fase. Cuando una épica vuelve a revisión tras un ajuste, «Ver solo los cambios» muestra también los cortes añadidos, modificados o quitados, que es lo que la persona aprueba al dividir un corte. Hoy la sección no aparece, ni en la revisión, ni en el delta, ni en la vista en tarjetas de la MCP App, y quien aprueba una épica no ve cómo se reparte.

## Fuera de alcance

- El título de un corte en el tooltip de su id (`C1`) dentro de «Depende de».
- El nombre «Cortes» en la tarjeta de `specty next` para un comentario sobre texto citado en esa sección: core muestra la clave `slices`.
- Un tablero de la épica con el estado de cada corte (listo, bloqueado) y un progreso de la sección.
- Avisos por corte: las reglas de core sobre los cortes son errores, que ya bloquean la aprobación con su motivo.

## Supuestos

- A1: El enlace de cada corte a su cambio sale de los cambios que la UI tiene cargados: los abiertos y las páginas de terminados que la Bandeja ya pidió. Un corte cuyo cambio terminado no está cargado se ve sin enlace ni fase, y la UI no dice «sin empezar», para no afirmar lo que no sabe.
  - impacto: alto
- A2: De varios cambios de un mismo corte, enlaza el cerrado y, si no hay ninguno, el primero de los demás; un cambio cancelado no cuenta. Es la regla con la que la tarjeta de la épica en la CLI elige el cambio de cada corte (`flow/epic.ts`).
- A3: «Cortes» va entre Tareas y Riesgos, como en el orden de la spec. Una épica no tiene Archivos ni Tareas, así que la sección queda tras Criterios.
- A4: Un comentario sobre un corte se ancla a su id (`C1`), como los de criterios, tareas y riesgos, y el texto seleccionado en la sección se ancla a la clave `slices`. El servidor ya acepta las dos anclas.
- A5: En la MCP App, Cortes es una tarjeta más, con su número de cortes como resumen y sin enlaces ni fases, porque en el chat no se navega.

## Criterios de aceptación

- AC1: CUANDO se abre la pestaña Spec de una épica con Cortes ENTONCES la sección «Cortes» aparece en el índice y en el documento, entre Tareas y Riesgos, con su pista, y cada corte es una fila con su id, su título, los criterios que cubre como insignias y, si depende de otros, «Depende de» con sus ids; CUANDO la spec no tiene Cortes ENTONCES la sección no aparece.
- AC2: CUANDO la épica está en revisión y la persona puede decidir ENTONCES cada corte ofrece «Comentar», que ancla el comentario a su id, y los comentarios abiertos sobre un corte cuentan en «Cortes» en el índice.
- AC3: CUANDO un cambio cargado implementa un corte (su `epic` y su `slice` lo nombran) ENTONCES el título del corte enlaza a la página de ese cambio y su fase se ve en la fila; de varios, el cerrado o, si no hay ninguno, el primero de los demás, y uno cancelado no cuenta. CUANDO ningún cambio cargado lo implementa ENTONCES el corte se ve sin enlace ni fase.
- AC4: CUANDO la MCP App muestra la spec de una épica en tarjetas ENTONCES «Cortes» es una tarjeta con su número de cortes como resumen y, al abrirla, sus filas, sin enlaces ni fases.
- AC5: CUANDO salen los textos nuevos (el título y la pista de «Cortes», «Depende de» y «depende de») ENTONCES salen en español y en inglés.
- AC6: CUANDO una épica en revisión tiene una revisión aprobada y sus cortes cambiaron desde ella ENTONCES «Ver solo los cambios» muestra el grupo «Cortes», entre Tareas y Riesgos, con cada corte añadido, modificado o eliminado: su id, su marca, su título con lo nuevo resaltado y, como chips, los criterios que cubre y los cortes de los que depende («depende de C1»), con los añadidos y los quitados marcados; cada corte que sigue en la spec ofrece «Comentar», y la tarjeta «Cortes» de la MCP App lleva «Cambió».

## Diseño

- `data/records.ts`: `ReviewSection` gana `slices`, y `ReviewView` gana `slices`, cada uno con `id`, `title`, `ac` y `depends`.
- `data/review.ts`: `deriveReview` da los cortes de la spec y pone `slices` en el índice tras `tasks`; `sectionOf` lleva el prefijo `C` a `slices`.
- `review/comments.ts` y `review/section-meta.ts`: el título («Cortes» / «Slices») y la pista de la sección.
- `review/spec-sections.ts`: `sp-review-items` pinta `slices` como filas de documento, como las tareas: id, título, insignias de criterios, «Depende de» con insignias de cortes y, a la derecha, la fase y «Comentar». Gana dos entradas opcionales: `epic` (el id del cambio revisado) y `changes` (los cambios cargados); con las dos, cada corte busca su cambio por `epic.id` y `epic.slice` (A2). Exporta `itemSection(key)`, la sección de filas de cada clave, que hoy repiten `spec-review.ts` y `spec-cards.ts`.
- `review/spec-review.ts`: pasa `[epic]="change().id"` y `[changes]="store.all()"` (`ChangesStore`) a `sp-review-items` y usa `itemSection`.
- `review/spec-cards.ts`: usa `itemSection` y cuenta los cortes en el resumen de la tarjeta; no pasa `epic` ni `changes`, así que no hay enlaces (A5). «Cambió» sale solo, porque mira las secciones de las entradas del delta.
- `data/records.ts` (delta): `DeltaEntryView.kind` gana `slice`, y `DeltaChipView.kind`, `slice` (un corte del que depende).
- `data/delta.ts`: deja de descartar las entradas `slice` de core; las lleva a la sección `slices`, con su título como texto y, como chips, sus `ac` y sus `depends`, marcados como los de una tarea. La lista de chips de un tipo, hoy dentro de `chipsOf`, pasa a una función que usan las tareas y los cortes.
- `review/delta-review.ts`: el grupo `slices` entre `tasks` y `risks`; `slice` entre los tipos con id (lleva su id y «Comentar»); el título de un corte en negrita, como el de una tarea, y un chip de corte dice «depende de C1».

## Archivos

- modificar packages/ui/src/data/records.ts — la sección `slices` y los cortes en `ReviewView`
- modificar packages/ui/src/data/review.ts — los cortes de la spec y su lugar en el índice
- modificar packages/ui/src/data/review.test.ts — los tests de los cortes, del índice y del ancla de un corte
- modificar packages/ui/src/review/comments.ts — el título de la sección Cortes
- modificar packages/ui/src/review/section-meta.ts — la pista de la sección Cortes
- modificar packages/ui/src/review/spec-sections.ts — las filas de los cortes, con su cambio y su fase
- modificar packages/ui/src/review/spec-sections.test.ts — los tests de las filas, del enlace y de los textos en las dos lenguas
- modificar packages/ui/src/review/spec-review.ts — los cambios cargados para enlazar cada corte
- modificar packages/ui/src/review/spec-cards.ts — la tarjeta de los cortes, sin enlaces
- modificar packages/ui/src/review/spec-cards.test.ts — el test de la tarjeta de los cortes y de su «Cambió»
- modificar packages/ui/src/data/delta.ts — los cortes en el delta, con sus criterios y sus dependencias como chips
- modificar packages/ui/src/data/delta.test.ts — los tests de los cortes en el delta
- modificar packages/ui/src/review/delta-review.ts — el grupo Cortes en «Ver solo los cambios»
- modificar packages/ui/src/review/delta-review.test.ts — el test del grupo Cortes
- modificar docs/ui.md — la sección Cortes en la revisión, en el delta y en las tarjetas
- modificar docs/formats.md — la clave `slices` en el ancla de un comentario

## Tareas

- [x] T1: Los cortes en los datos de la revisión
  - files: packages/ui/src/data/records.ts, packages/ui/src/data/review.ts, packages/ui/src/data/review.test.ts, packages/ui/src/review/comments.ts, packages/ui/src/review/section-meta.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/review.test.ts && pnpm lint
  - type: feat
- [x] T2: Los cortes en el delta desde la revisión aprobada
  - files: packages/ui/src/data/records.ts, packages/ui/src/data/delta.ts, packages/ui/src/data/delta.test.ts
  - ac: AC6
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/delta.test.ts && pnpm lint
  - type: feat
- [x] T3: Las filas de los cortes, enlazadas a su cambio, en la revisión y en las tarjetas
  - files: packages/ui/src/review/spec-sections.ts, packages/ui/src/review/spec-sections.test.ts, packages/ui/src/review/spec-review.ts, packages/ui/src/review/spec-cards.ts, packages/ui/src/review/spec-cards.test.ts
  - ac: AC1, AC2, AC3, AC4, AC5, AC6
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/review/spec-sections.test.ts --include src/review/spec-cards.test.ts --include src/review/spec-review.test.ts --include src/review/spec-review-modes.test.ts --include src/app/embedded.test.ts && pnpm lint && pnpm knip
  - type: feat
- [x] T4: Los cortes en «Ver solo los cambios», y la documentación
  - files: packages/ui/src/review/delta-review.ts, packages/ui/src/review/delta-review.test.ts, docs/ui.md, docs/formats.md
  - ac: AC5, AC6
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/review/delta-review.test.ts --include src/review/spec-review-modes.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: feat

## Riesgos

- R1: El constructor de los tests de Angular comprueba los tipos de todos los tests a la vez, y los de T2, T3 y T4 se escriben antes que su código — los tests nuevos no usan nada que aún no exista: pasan las entradas nuevas con `setInput`, buscan las entradas del delta por su clave y leen los cortes con `toMatchObject`, así que compilan antes de T1 y fallan solo al ejecutarse.
- R2: El carril del servidor (P178) puede cambiar cómo llegan los terminados a la Bandeja — el enlace solo lee `ChangesStore.all()`, que seguirá dando los cambios cargados; si deja de darlos completos, el corte se ve sin enlace (A1).

## Cierre

### Resumen

La pestaña Spec de una épica muestra la sección «Cortes», entre Tareas y Riesgos. Cada corte es una fila con su id, su título, los criterios que cubre y «Depende de» con sus ids, y se puede comentar. En `specty ui`, el título de cada corte enlaza al cambio que lo implementa y muestra su fase, si ese cambio está cargado. En la MCP App, Cortes es una tarjeta con su número de cortes, sin enlaces. «Ver solo los cambios» agrupa los cortes añadidos, modificados o eliminados desde la revisión aprobada, con sus criterios y sus dependencias como chips («depende de C1»), y la tarjeta de Cortes lleva «Cambió».

### Desviaciones

- El delta («Ver solo los cambios») y la marca «Cambió» de la tarjeta de Cortes entraron en la revisión 2, a petición de la sesión principal. El motivo: P165 deja ajustar una épica en implementación para dividir un corte, y la persona aprueba ese ajuste revisando el delta. Para eso se añadieron AC6, `data/delta.ts`, `review/delta-review.ts` y sus tests, y el cambio pasó de M a L.

### Decisiones

- El enlace de cada corte sale de `ChangesStore.all()`, que pasa `spec-review.ts`, y lo calcula `sp-review-items` con sus entradas `epic` y `changes`. Así se prueba la elección del cambio en el componente, sin montar la página. En la MCP App no se pasan, y no hay enlaces.
- Para elegir el cambio de un corte se usa la regla de la tarjeta de la épica (`flow/epic.ts`): el cerrado o, si no hay ninguno, el primero de los demás, y uno cancelado no cuenta.
- Un corte sin cambio cargado no dice «sin empezar», porque su cambio terminado puede estar en una página que la Bandeja aún no pidió.
- `itemSection` pasa a `spec-sections.ts`, compartida por la revisión y las tarjetas, que la repetían. La lista de chips de un tipo pasa a `chipList` en `data/delta.ts`, compartida por tareas y cortes.
- Los cortes no llevan avisos: hoy las reglas de core sobre los cortes son errores, que ya bloquean la aprobación.
- Los tests se escribieron para que compilaran antes que el código, con `setInput`, `toMatchObject` y búsquedas por clave, porque el constructor de tests de Angular comprueba los tipos de todos a la vez.

### Pendientes

- P187: el tooltip del id de un corte en «Depende de» no muestra su título (`itemsOfReview` en `components/item-refs.ts`).
- P188: la tarjeta de `specty next` nombra con la clave `slices` la sección de un comentario citado en Cortes (`SECTIONS` en `core/src/cards/next.ts`).
- P189: un corte enlaza a su cambio solo si la UI lo tiene cargado; un corte cerrado de una épica antigua se ve sin enlace (A1).
