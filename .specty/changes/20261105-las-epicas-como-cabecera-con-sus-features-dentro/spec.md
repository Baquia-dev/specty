---
kind: standard
epic: 20261105-bandeja-por-paginas
slice: C2
---

# Las épicas como cabecera, con sus features dentro

## Objetivo

En la Bandeja, una épica pasa a ser la cabecera del grupo de sus cortes: si está en la misma sección, la cabecera es su propia fila, con su fase, sus tiempos, su enlace y su botón, y si no, su título con su enlace y su fase. Sus cortes van debajo, sangrados, y su insignia dice «Feature · C2 · <título del corte>»; un cambio estándar suelto dice «Feature» en lugar de «Individual». Hoy la cabecera dice «Épica: <título>», «Total: …» y «N cambios», y la insignia de un corte repite el título de la épica.

## Fuera de alcance

- Paginar los terminados (corte C4) y abrir un cambio que la Bandeja no cargó (corte C3).
- Poner los abiertos antes que los terminados dentro de cada grupo (A4 de la épica), que llega con la paginación del corte C4.
- El tooltip de las referencias a cortes en el texto de una spec («Corte C2», `components/item-refs.ts`), que nombra el ítem de la sección Cortes y no cambia.
- El «modo individual» de las aprobaciones (ADR 0004), que no cambia de nombre.
- Añadir una épica a los datos de ejemplo del prototipo: los tests construyen la suya.

## Supuestos

- A1: Los bloques siguen saliendo de `sectionBlocks` en `inbox/inbox-view.ts`, que ya junta los cambios de una épica con la épica primero. El orden de `j`/`k` (`order` en `inbox/inbox.ts`) no cambia: ya pasa por la épica antes que por sus cortes, y una cabecera sin fila no es un cambio de la sección.
- A2: Cuando la épica está en la sección, la cabecera es su `sp-inbox-row` de siempre: fase, los tiempos del corte C1, enlace, insignia «Épica», lo que espera y su botón. Se quitan «Total: …» (`epicDuration`, el pendiente P162 de C1) y «N cambios» (`epicCount`).
  - impacto: alto
- A3: Cuando la épica no está en la sección (está en otra, no coincide con la búsqueda o no está cargada), la cabecera es su fase, su título con el enlace a su página y la insignia «Épica», sin tiempos ni botón. La fase y la pestaña del enlace salen de la épica cargada; si no lo está, la cabecera no tiene fase y el título es el que ya trae cada corte (`epic.title`, su id si la épica no está).
- A4: Una épica sin cortes suyos en la sección sigue siendo una fila suelta, sin grupo.
- A5: El título de cada corte sale de la sección Cortes de la spec de la épica («- C2: título»): `data/views.ts` lo lee al derivar la épica y lo copia en el `epic.sliceTitle` de cada corte suyo.
- A6: Dentro del grupo de su épica, la insignia de un corte dice «Feature · C2 · <título del corte>», o «Feature · C2» si la épica no lo nombra. Fuera del grupo, como en la cabecera de su página, dice «Feature · C2 · <título de la épica>». Un corte sin `slice` dice «Feature» dentro y «Feature · <título de la épica>» fuera. Un cambio estándar suelto dice «Feature». En inglés, los mismos textos.
- A7: En «Agrupar por épica», la sección de los cambios estándar sueltos pasa de «Specs individuales» («Standalone specs») a «Features» en las dos lenguas. El `data-kind` y el icono de la insignia no cambian.

## Criterios de aceptación

- AC1: CUANDO una sección de la Bandeja tiene una épica y cortes suyos ENTONCES la épica es la cabecera del grupo, con su propia fila (fase, tiempos, enlace y, si espera a la persona, su botón) y sin «Total», y sus cortes van debajo y sangrados; `j`/`k` pasan por la cabecera y después por cada corte, también en «Agrupar por épica».
- AC2: CUANDO una sección tiene cortes de una épica que no está en ella ENTONCES van bajo una cabecera con el título de la épica, su enlace y su fase, sin tiempos ni botón, que `j`/`k` no paran.
- AC3: CUANDO se ve un corte dentro del grupo de su épica ENTONCES su insignia dice «Feature», su id de corte y el título que le da la sección Cortes de la épica («Feature · C2 · Pagos»), o «Feature · C2» si la épica no lo nombra; CUANDO se ve en la cabecera de su página ENTONCES dice «Feature · C2 · <título de la épica>».
- AC4: CUANDO se ve un cambio estándar suelto ENTONCES su insignia dice «Feature», en la Bandeja y en la cabecera de su página, y en «Agrupar por épica» su sección se llama «Features».
- AC5: CUANDO salen los textos nuevos ENTONCES salen en español y en inglés.

## Diseño

- `data/records.ts`: `ChangeView` gana `slices` (de una épica: el id y el título de cada corte de su sección Cortes) y `epic.sliceTitle`.
- `data/views.ts`: `deriveView` da `slices` de una épica con Cortes; `deriveViews` copia en cada corte el título que le da su épica, junto al título de la épica que ya resuelve.
- `components/badge.ts`: `sp-kind-badge` gana el input `inEpic` (se ve dentro del grupo de su épica) y las etiquetas «Feature» de A6.
- `inbox/inbox-row.ts`: el input `inEpic`, que pasa a su insignia.
- `inbox/inbox-view.ts`: el bloque `epic` pasa a llevar `head` (la épica, cuando está en la sección), `epic` (la épica cargada, de todos los cambios, para la cabecera sin fila) y `slices` (sus cortes en la sección), en lugar de `changes`; `sectionBlocks(section, all)` recibe todos los cambios. La sección «Features» de A7.
- `inbox/inbox-epic.ts` (nuevo, `sp-inbox-epic`): el contenedor `[data-epic-group]`; arriba, la fila de la épica proyectada (`[data-epic-head]`) o la cabecera sin fila (`[data-epic-header]`), y debajo los cortes proyectados, sangrados con una línea a la izquierda. Las filas siguen en la plantilla de `inbox/inbox.ts`, así `viewChildren(InboxRow)` las encuentra para `j`/`k`.
- `inbox/inbox.ts`: los bloques de épica con `sp-inbox-epic`, y los cortes con `[inEpic]="true"`; se quitan `epicDuration` y `epicCount`.

## Archivos

- modificar packages/ui/src/data/records.ts — `slices` de una épica y `epic.sliceTitle` de un corte en `ChangeView`
- modificar packages/ui/src/data/views.ts — los cortes de una épica y el título de cada corte
- modificar packages/ui/src/data/views.test.ts — el test del título de cada corte
- modificar packages/ui/src/components/badge.ts — las etiquetas «Feature» y el input `inEpic`
- modificar packages/ui/src/components/badge.test.ts — los tests de las etiquetas, dentro y fuera del grupo, en las dos lenguas
- modificar packages/ui/src/inbox/inbox-row.ts — el input `inEpic`, para su insignia
- modificar packages/ui/src/inbox/inbox-view.ts — los bloques de épica con su cabecera y la sección «Features»
- modificar packages/ui/src/inbox/inbox-view.test.ts — los tests de los bloques de épica y de la sección «Features»
- modificar packages/ui/src/inbox/inbox-toolbar.test.ts — la sección «Features» al agrupar por épica
- crear packages/ui/src/inbox/inbox-epic.ts — el grupo de una épica: su cabecera y sus features sangradas
- modificar packages/ui/src/inbox/inbox.ts — los grupos de épica con `sp-inbox-epic`, sin «Total» ni el número de cambios
- modificar packages/ui/src/inbox/inbox.test.ts — los tests de la cabecera de épica, de `j`/`k` y de las insignias
- modificar docs/ui.md — la épica como cabecera y las etiquetas «Feature»

## Tareas

- [x] T1: El título de cada corte, de la sección Cortes de su épica
  - files: packages/ui/src/data/records.ts, packages/ui/src/data/views.ts, packages/ui/src/data/views.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/views.test.ts && pnpm lint
  - type: feat
- [x] T2: Las etiquetas «Feature» de la insignia y de la sección de los sueltos
  - files: packages/ui/src/components/badge.ts, packages/ui/src/components/badge.test.ts, packages/ui/src/inbox/inbox-row.ts, packages/ui/src/inbox/inbox-view.ts, packages/ui/src/inbox/inbox-toolbar.test.ts
  - ac: AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/components/badge.test.ts --include src/inbox/inbox-toolbar.test.ts && pnpm lint
  - type: feat
- [x] T3: La épica como cabecera de su grupo en la Bandeja
  - files: packages/ui/src/inbox/inbox-view.ts, packages/ui/src/inbox/inbox-view.test.ts, packages/ui/src/inbox/inbox-epic.ts, packages/ui/src/inbox/inbox.ts, packages/ui/src/inbox/inbox.test.ts
  - ac: AC1, AC2, AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/inbox/inbox-view.test.ts --include src/inbox/inbox.test.ts --include src/inbox/inbox-toolbar.test.ts --include src/inbox/inbox-row.test.ts --include src/components/badge.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: feat
- [ ] T4: La documentación de la épica como cabecera
  - files: docs/ui.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: Angular proyecta un bloque `@if` con un solo elemento raíz según ese elemento; si no lo hiciera, la fila de la épica caería entre sus cortes — el test de AC1 comprueba que la cabecera va antes de los cortes y fuera del sangrado.
- R2: El corte C3, en aceptación, también cambia `data/records.ts` (la fuente de datos) — son partes distintas del archivo, y la integración con main las junta.
