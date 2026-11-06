---
kind: standard
epic: 20261106-epica-en-la-bandeja-con-lineas-por-corte
slice: C2
---

# Cada corte es una línea de fases, también los que no han empezado

## Objetivo

En la Bandeja, la tarjeta de una épica dibuja, bajo su fila, una línea por cada corte de su sección Cortes, en el orden de la spec, tenga o no cambio: su id, su título enlazado a su cambio y una pista de cuatro tramos (Spec, Tests, Impl., Acept.) con el tramo de su fase, o lo que espera si aún no ha empezado, y el botón de la decisión que espera. Así se ve de un vistazo cómo avanza cada corte, también los terminados que no llegaron en las páginas y los que aún no tienen cambio, y `j`/`k` recorren las líneas con cambio.

## Fuera de alcance

- El agente que lleva cada corte, «Sin conversación» y los avisos de cada línea (corte C3), y el recuento, el avance con su anillo y «Ningún corte en marcha» en la cabecera (corte C4): la cabecera de la tarjeta sigue siendo la fila de la épica.
- La pestaña Spec de la épica no cambia: solo comparte con la Bandeja la elección del cambio de cada corte.
- Las secciones, los bloques, los filtros y el número de cada sección siguen como los dejó C1.
- `GET /api/changes/<id>/slices` no cambia.

## Supuestos

- A1: Las líneas van en el orden de la sección Cortes de la épica, con el título que les da esa sección. Un cambio cargado de la épica, no cancelado, cuyo corte esa sección no nombra (o que no tiene corte) sale como una línea más al final, con su id de corte y su título, para que nada que espere a la persona quede oculto.
  - impacto: medio
- A2: El cambio de cada corte se elige como en la pestaña Spec: entre los cargados, el cerrado o, si no hay, el primero de los demás, y uno cancelado libera su corte (`loadedSliceChanges`, que pasa a `data/slice-changes.ts`). Cuando la fuente responde a `sliceChanges`, la tarjeta solo usa su respuesta, y de un cambio que da y está cargado toma también la decisión que espera y la pestaña con la que se abre.
  - impacto: medio
- A3: Mientras la fuente no responde, o si falla, un corte sin cambio cargado sale sin estado (pista vacía, sin texto ni enlace), para no decir que no ha empezado. Si no sabe decirlo (`sliceChanges` da `undefined`: datos de ejemplo, MCP App), los cambios cargados son todos, y un corte sin cambio no ha empezado.
  - impacto: medio
- A4: Solo pide `sliceChanges` una épica en borrador, revisión, implementación o ajustes, y lo vuelve a pedir con cada aviso de la fuente. En aceptación, cierre o terminada, todas sus líneas salen terminadas sin pedir nada, enlazadas solo si su cambio está cargado; en una épica cancelada, un corte sin cambio cargado sale sin estado.
  - impacto: bajo
- A5: Las fases van a los tramos así: `draft` y `review`, Spec; `testing`, Tests; `implementing` y `adjusting`, Impl.; `acceptance` y `closing`, Acept. Los tramos ya pasados van rellenos en un tono neutro, el de su fase con el color de la fase y los que faltan, vacíos; en `done`, los cuatro van en el verde de `done`.
  - impacto: bajo
- A6: El botón de una línea es el de la fila de su cambio, con su mismo texto («Revisar spec», «Aprobar tests», «Decidir alcance», «Revisar resultado», «Revisar cierre»), y abre la página del corte en la pestaña de su decisión, como el de la fila.
  - impacto: bajo
- A7: «Espera a» y «Tras» nombran los cortes de su `depends` que no han terminado, en ese orden, unidos como una lista del idioma («C2 y C3», «C2 and C3»). Con la épica en ajustes, una línea sin cambio dice lo mismo que en implementación.
  - impacto: bajo
- A8: `j`/`k` pasan por la fila de la épica y después por cada línea con cambio, en orden; las líneas sin cambio no se enfocan. La línea elegida se resalta como una fila elegida, y su botón pasa a principal.
  - impacto: bajo
- A9: Los cortes de los que depende cada corte salen de la spec revisada de la épica (`review.slices` de su vista entera), así que el resumen de core no cambia. Solo una épica abierta, que la Bandeja siempre tiene entera, tiene líneas planeadas; una terminada o cancelada, que puede llegar solo por su resumen, no las necesita (A4).
  - impacto: bajo

## Criterios de aceptación

- AC2: CUANDO la Bandeja muestra una épica ENTONCES cada corte de su sección Cortes es una línea, en el orden de la spec, con su id, su título (enlazado a la página de su cambio si lo tiene) y una pista de cuatro tramos bajo las cabeceras «Spec», «Tests», «Impl.» y «Acept.». Los tramos ya pasados van rellenos y el de su fase lleva el color de la fase; los de un corte terminado van todos en verde, y su línea se ve como las demás, sin plegar, también en una épica en aceptación o terminada.
- AC3: CUANDO un corte aún no tiene cambio ENTONCES su línea dice, en lugar de la pista, «Listo para empezar» o «Espera a C1» (los cortes de los que depende que no han terminado); con la épica en borrador o revisión, «Puede arrancar en cuanto apruebes» o «Tras C1».
- AC4: CUANDO el cambio de un corte espera una decisión de la persona ENTONCES su línea lleva a la derecha el botón de esa decisión («Aprobar tests», «Revisar spec»…), que abre la página del corte como el botón de una fila, y su tramo actual va marcado.
- AC9: CUANDO la persona se mueve por la Bandeja con `j`/`k` ENTONCES pasan por la cabecera de la épica y después por cada corte con cambio, en orden, y Enter abre el elegido.
- AC11: CUANDO un corte de una épica abierta terminó y su cambio no está entre los terminados cargados ENTONCES su línea sale terminada y enlazada a su cambio, con lo que la fuente dice de cada corte; mientras la fuente no responde, sale sin estado.

## Diseño

- Los cortes, con su título y sus `depends`, salen de `review.slices` de la épica entera, y de `slices` de su resumen si solo llegó así (A9): sin tocar `summarizeChange` de core, que el diseño de la épica preveía, el corte cabe en un cambio de un solo módulo.
- `ui/src/data/slice-changes.ts` (puro): `loadedSliceChanges(epic, changes)`, la elección que hoy hace en privado `review/spec-sections.ts`, que pasa a usarla.
- `ui/src/inbox/epic-lanes.ts` (puro):
  - `asksForSlices(phase)`: si la tarjeta pide `sliceChanges` (A4).
  - `epicLanes(epic, loaded, answer)`: por cada corte, en el orden de la spec, y después los cambios de A1, su clave, su id, su título, su cambio (`{ id, tab? }`) y su estado: sin estado, planeado (los cortes que faltan y si la épica aún espera aprobación), abierto (su fase y su decisión) o terminado. `answer` es lo que dijo la fuente: aún nada (o falló), que no sabe decirlo, o el cambio de cada corte.
  - `laneCells(state)`: los cuatro tramos de la pista (vacío, pasado, actual o terminado), y `LANE_STEPS`, sus cabeceras en los dos idiomas.
- `sp-inbox-lane` (`ui/src/inbox/inbox-lane.ts`): una línea de cuatro columnas que comparten todas las de la tarjeta (`grid-cols-subgrid`): id, título con su enlace, la pista o el texto de planeado (con borde discontinuo) y, a la derecha, el botón de la decisión (`sp-button`, el texto de `DECISIONS` de `inbox-row.ts`). Sus colores salen de los tokens (`--color-phase-*`, `text`, `border`). Como una fila, su enlace recibe el foco y su botón lo pulsa.
- `sp-inbox-epic` (`ui/src/inbox/inbox-epic.ts`) recibe la épica y sus cortes cargados, pide `sliceChanges` con `resource` y `subscribe` como la pestaña Spec, y dibuja bajo la fila de la épica las cabeceras de los tramos y una línea por corte. Da las líneas con cambio en su orden (`stops`) y las enfoca por id.
- `sp-inbox` (`ui/src/inbox/inbox.ts`): `j`/`k` recorren cada fila y, en una épica, su fila y después las líneas con cambio de su tarjeta. `InboxRow` deja de recibir `inEpic`.
- Docs: `docs/ui.md` (la tarjeta de la épica con sus líneas) y `docs/ARCHITECTURE.md` §15 (también la tarjeta de una épica en la Bandeja pide `GET /api/changes/<id>/slices`).

## Archivos

- crear packages/ui/src/data/slice-changes.ts — la elección del cambio de cada corte entre los cargados, compartida
- modificar packages/ui/src/review/spec-sections.ts — la sección Cortes usa la elección compartida
- crear packages/ui/src/inbox/epic-lanes.ts — las líneas de una épica: el cambio y el estado de cada corte y los tramos de su pista
- crear packages/ui/src/inbox/epic-lanes.test.ts — AC2, AC3, AC4 y AC11 sobre las líneas de una épica
- modificar packages/ui/src/inbox/inbox-view.ts — el comentario de `order`, que ya no es el recorrido de `j`/`k`
- crear packages/ui/src/inbox/inbox-lane.ts — `sp-inbox-lane`, la línea de un corte
- crear packages/ui/src/inbox/inbox-lane.test.ts — AC2, AC3 y AC4 sobre la línea de un corte
- modificar packages/ui/src/inbox/inbox-row.ts — comparte sus decisiones con la línea y deja de recibir `inEpic`
- modificar packages/ui/src/data/finished-summaries.test.ts — la fila de un terminado, sin `inEpic`
- modificar packages/ui/src/inbox/inbox-epic.ts — la tarjeta: cabeceras de los tramos, una línea por corte y `sliceChanges`
- modificar packages/ui/src/inbox/inbox.ts — da a la tarjeta la épica y sus cortes, y `j`/`k` pasan por sus líneas
- crear packages/ui/src/inbox/inbox-epic.test.ts — AC2, AC3, AC4, AC9 y AC11 en la Bandeja entera
- modificar packages/ui/src/inbox/inbox.test.ts — los tests de C1 leen los cortes de la épica como líneas
- modificar docs/ui.md — la tarjeta de la épica con una línea por corte
- modificar docs/ARCHITECTURE.md — §15: la tarjeta de una épica en la Bandeja también pide los cambios de sus cortes

## Tareas

- [x] T1: Las líneas de una épica dan el cambio y el estado de cada corte
  - files: packages/ui/src/data/slice-changes.ts, packages/ui/src/review/spec-sections.ts, packages/ui/src/inbox/epic-lanes.ts, packages/ui/src/inbox/epic-lanes.test.ts, packages/ui/src/inbox/inbox-view.ts
  - ac: AC2, AC3, AC4, AC11
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/inbox/epic-lanes.test.ts --include src/review/spec-sections.test.ts --include src/inbox/inbox-view.test.ts
- [x] T2: La línea de un corte dibuja su pista, lo que espera o el botón de su decisión
  - files: packages/ui/src/inbox/inbox-lane.ts, packages/ui/src/inbox/inbox-lane.test.ts, packages/ui/src/inbox/inbox-row.ts, packages/ui/src/inbox/inbox.ts, packages/ui/src/data/finished-summaries.test.ts
  - ac: AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/inbox/inbox-lane.test.ts --include src/inbox/inbox-row.test.ts --include src/data/finished-summaries.test.ts
- [x] T3: La tarjeta de la épica dibuja una línea por corte y `j`/`k` las recorren
  - files: packages/ui/src/inbox/inbox-epic.ts, packages/ui/src/inbox/inbox.ts, packages/ui/src/inbox/inbox-epic.test.ts, packages/ui/src/inbox/inbox.test.ts
  - ac: AC2, AC3, AC4, AC9, AC11
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/inbox/inbox-epic.test.ts --include src/inbox/inbox.test.ts --include src/inbox/inbox-more.test.ts --include src/inbox/inbox-view.test.ts --include src/inbox/inbox-row.test.ts && pnpm typecheck && pnpm lint && pnpm knip
- [ ] T4: ui.md y ARCHITECTURE cuentan las líneas de la tarjeta de la épica
  - files: docs/ui.md, docs/ARCHITECTURE.md
  - ac: —
  - verify: grep -q "sp-inbox-lane" docs/ui.md && grep -q "tarjeta de una épica" docs/ARCHITECTURE.md
  - type: docs

## Riesgos

- R1: `j`/`k` pasan a recorrer filas y líneas de dos componentes distintos, y un fallo dejaría a la persona sin poder llegar a un corte. Mitigación: el recorrido sale de los mismos bloques que dibuja la Bandeja y de las líneas que da cada tarjeta, y AC9 lo prueba en la Bandeja entera.
- R2: Las líneas de una tarjeta tienen que alinear sus tramos con las cabeceras. Mitigación: todas comparten las columnas de la tarjeta con `grid-cols-subgrid`, y su botón va en la última columna.
