---
kind: standard
follows:
  - 20261022-cambio-y-revision-en-el-telefono-cabecera-franja
---

# Cabecera del cambio: revisión explícita, franja según su contenido y esfuerzo como sugerencia

## Objetivo

La cabecera del cambio dice «r3» sin explicar si esa revisión está aprobada ni con cuál se compara, reparte la franja de datos en columnas iguales aunque su contenido no lo sea, recorta el nombre de la rama y mezcla el esfuerzo recomendado con los datos del cambio. La revisión pasa a leerse con su número y su estado («Revisión 3 · por aprobar», «La 2 está aprobada · 21 oct · Ana Gómez»), la franja se ajusta a su contenido, la rama se ve completa y el esfuerzo pasa a ser una sugerencia junto a las acciones.

## Fuera de alcance

- La Bandeja, el delta, la revisión completa y los comentarios siguen con «rN»: pasan a la forma explícita en el cambio siguiente.
- El origen de cada revisión (tras tus comentarios, ajuste, cierre), que necesita el historial de `audit.jsonl`: va con la pestaña Historial.
- El select propio de la Bandeja, en su propio cambio.

## Supuestos

- A1: El estado de la revisión actual sale de la fase y de la revisión aprobada: borrador, «sin proponer» (sin número mientras sea la 0); revisión, «por aprobar»; ajuste, «aprobada, en ajuste»; implementación y aceptación, «aprobada»; cierre, «cierre por confirmar»; terminado, «cerrada»; cancelado, «cancelada».
- A2: La línea de la revisión aprobada dice cuándo y quién la aprobó, porque en un equipo no siempre es quien mira: «La 2 está aprobada · 21 oct · Ana Gómez»; si la actual es la aprobada, «Aprobada el 21 oct · Ana Gómez».
- A3: La sugerencia de esfuerzo dice «Sugerencia para el agente: implementar con esfuerzo medio y revisar con alto» («planificar» en lugar de «revisar» en borrador), en texto atenuado con un icono de bombilla.

## Criterios de aceptación

- AC1: CUANDO se abre un cambio ENTONCES la franja muestra la revisión con su número y su estado («Revisión 3 · por aprobar») y, si hay una revisión aprobada, cuál, cuándo y quién la aprobó.
- AC2: CUANDO la franja cabe en una fila ENTONCES cada dato ocupa el ancho de su contenido, con líneas finas entre ellos; CUANDO no cabe ENTONCES se ordena en rejilla y la rama ocupa una fila entera.
- AC3: CUANDO la rama es larga ENTONCES se ve completa, partida en varias líneas si hace falta, nunca recortada.
- AC4: CUANDO el cambio tiene esfuerzo recomendado ENTONCES aparece como sugerencia atenuada con un icono a la derecha de la cabecera, bajo las acciones si las hay (en pantallas estrechas, bajo el título), y ya no en la franja.
- AC5: CUANDO aparecen la barra compacta o el botón de aprobar ENTONCES dicen «Revisión 3 · por aprobar» (en el teléfono, «Revisión 3») y «Aprobar revisión 3».

## Diseño

- **Datos** (`data/records.ts`, `data/views.ts`): `ChangeView.approved` con la revisión, la fecha y quién la aprobó, copiados de `state.approved`.
- **Revisión** (`data/revision.ts`, puro): `revisionName(change)` («Revisión 3 · por aprobar», bilingüe) y `approvedNote(change, lang)` con la fecha corta del idioma.
- **Franja** (`change/change-facts.ts`): `sp-change-facts`, extraída de la página para no pasar de 300 líneas. Desde `lg`, una fila flexible: cada dato con el ancho de su contenido y la rama como único dato que encoge, partiéndose; por debajo, rejilla de 2 o 3 columnas con la rama al final a todo el ancho.
- **Página** (`change/change-page.ts`): una columna derecha con las acciones (en revisión) y la sugerencia de esfuerzo.
- **Barra y acciones** (`change/change-bar.ts`, `review/review-actions.ts`): el nombre explícito de la revisión.

## Archivos

- modificar packages/ui/src/data/records.ts — la revisión aprobada en la vista del cambio
- modificar packages/ui/src/data/views.ts — copiar la revisión aprobada
- modificar packages/ui/src/data/views.test.ts — test de la revisión aprobada
- crear packages/ui/src/data/revision.ts — nombre y estado de la revisión
- crear packages/ui/src/data/revision.test.ts — tests del nombre y el estado
- crear packages/ui/src/change/change-facts.ts — franja de datos según su contenido
- modificar packages/ui/src/change/change-page.ts — franja extraída y sugerencia de esfuerzo
- modificar packages/ui/src/change/change-page.test.ts — tests de la cabecera
- modificar packages/ui/src/change/change-bar.ts — la revisión en la barra compacta
- modificar packages/ui/src/review/review-actions.ts — «Aprobar revisión N»
- modificar packages/ui/src/review/review-actions.test.ts — test del botón
- modificar docs/ui.md — la cabecera del cambio

## Tareas

- [ ] T1: Nombre y estado de la revisión
  - files: packages/ui/src/data/records.ts, packages/ui/src/data/views.ts, packages/ui/src/data/views.test.ts, packages/ui/src/data/revision.ts, packages/ui/src/data/revision.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/revision.test.ts --include src/data/views.test.ts
- [ ] T2: Franja según su contenido, rama completa y esfuerzo como sugerencia
  - files: packages/ui/src/change/change-facts.ts, packages/ui/src/change/change-page.ts, packages/ui/src/change/change-page.test.ts, docs/ui.md
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm check
  - notes: Comprobar en el navegador a 390, 768 y 1280 px, en claro y oscuro, con una rama larga, un cambio en revisión con revisión aprobada, uno en implementación y uno en borrador.
- [ ] T3: La revisión en la barra compacta y en el botón de aprobar
  - files: packages/ui/src/change/change-bar.ts, packages/ui/src/review/review-actions.ts, packages/ui/src/review/review-actions.test.ts, packages/ui/src/change/change-page.test.ts, docs/ui.md
  - ac: AC5
  - verify: pnpm check
