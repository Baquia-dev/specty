---
kind: standard
---

# Comentarios y cambios pedidos

## Objetivo

La revisión de una spec en la UI se completa: la persona comenta una sección o un ítem y, cuando termina, pide los cambios; el agente los recibe en `specty next`, con cada comentario y dónde va, corrige la spec y la vuelve a proponer, y al proponerla los comentarios quedan resueltos en la revisión nueva. Hoy `formats.md` promete que los comentarios llegan al agente, pero ni la CLI los escribe ni `next` los muestra.

## Fuera de alcance

- Que la UI llame a estas acciones: va en su propio cambio, sobre `SpectyData`.
- Responder o borrar comentarios, y comentar fuera de la revisión.

## Supuestos

- A1: Un comentario se guarda en `comments.json` con la forma de formats.md §5 (`id` `c<n>`, la revisión en curso, el ancla, la persona de `git config user.name`, el texto y la hora) y solo durante la revisión; no se anota en la auditoría, porque `comments.json` ya es su registro.
  - impacto: alto
- A2: Pedir cambios es el evento `requestChanges` de la máquina de estados (la fase sigue en `review`) y se anota como `review.changes_requested` con la revisión y los ids de los comentarios sin resolver; sin comentarios sin resolver ni supuestos rechazados, se rechaza.
  - impacto: alto
- A3: `specty next` muestra al agente los comentarios sin resolver solo si la persona pidió cambios después de la última propuesta; mientras tanto la revisión sigue siendo de la persona.
- A4: `specty propose`, cuando crea una revisión nueva, pone `resolvedInRevision` en todos los comentarios sin resolver: el agente respondió a ellos con esa revisión, y la persona puede volver a comentar si no basta.
- A5: El servidor local añade dos acciones de la persona, `POST /api/changes/<id>/comments` (`{ anchor, body }`) y `POST /api/changes/<id>/request-changes`, con la misma seguridad que las demás.

## Criterios de aceptación

- AC1: CUANDO la persona comenta durante la revisión ENTONCES `comments.json` guarda el comentario con su ancla (un ítem o una cita de una sección), su autor y la revisión.
- AC2: CUANDO la persona pide cambios ENTONCES la auditoría lo anota y `specty next` muestra al agente cada comentario sin resolver, con su ancla, y le pide corregir la spec y ejecutar `specty propose`; sin nada que pedir, se rechaza.
- AC3: CUANDO el agente propone una revisión nueva ENTONCES los comentarios sin resolver quedan resueltos en ella y `next` deja de mostrarlos.
- AC4: CUANDO la UI servida por el `specty ui` de la persona comenta o pide cambios ENTONCES el servidor lo hace en la carpeta del cambio, con la seguridad de las demás acciones.

## Diseño

- `core/cards/view.ts` y `core/cards/next.ts`: la vista trae `requested`, y la tarjeta de revisión muestra «CAMBIOS PEDIDOS» junto a los supuestos rechazados.
- `cli/store/comments.ts`: leer y escribir `comments.json`. `cli/flow/review.ts`: `addComment` y `requestChanges`. `cli/flow/views.ts`: los comentarios pedidos. `cli/commands/propose.ts`: resolverlos.
- `cli/server/actions.ts`: las dos acciones nuevas.

## Archivos

- modificar packages/core/src/cards/view.ts — los comentarios pedidos en la vista
- modificar packages/core/src/cards/next.ts — la tarjeta de revisión los muestra
- modificar packages/core/test/cards.test.ts — tests de la tarjeta
- crear packages/cli/src/store/comments.ts — `comments.json`
- modificar packages/cli/src/flow/review.ts — comentar y pedir cambios
- modificar packages/cli/src/flow/views.ts — los comentarios pedidos
- modificar packages/cli/src/commands/propose.ts — resolverlos al proponer
- modificar packages/cli/src/server/actions.ts — las acciones de comentar y pedir cambios
- crear packages/cli/test/comments.test.ts — comentar, pedir cambios, `next` y `propose`
- crear packages/cli/test/server/comments.test.ts — las acciones del servidor
- modificar docs/formats.md — §4 y §5: los comentarios y su resolución
- modificar docs/ARCHITECTURE.md — §15: las acciones nuevas

## Tareas

- [x] T1: La tarjeta de revisión muestra los cambios pedidos
  - files: packages/core/src/cards/view.ts, packages/core/src/cards/next.ts, packages/core/test/cards.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards.test.ts
- [x] T2: Comentar, pedir cambios y resolverlos en la CLI
  - files: packages/cli/src/store/comments.ts, packages/cli/src/flow/review.ts, packages/cli/src/flow/views.ts, packages/cli/src/commands/propose.ts, packages/cli/test/comments.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/comments.test.ts test/flow.test.ts
- [x] T3: Comentar y pedir cambios desde el servidor
  - files: packages/cli/src/server/actions.ts, packages/cli/test/server/comments.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server/comments.test.ts test/server/actions.test.ts
- [x] T4: Documentar los comentarios
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm check
  - type: docs

## Cierre

### Resumen

Durante la revisión, la persona puede comentar la spec desde la UI, anclando cada comentario a un ítem o a una cita de una sección, y después pedir los cambios. Los comentarios se guardan en `comments.json`; pedir cambios lo anota en la auditoría como `review.changes_requested`, y desde entonces `specty next` le da al agente los comentarios sin resolver en «CAMBIOS PEDIDOS», junto a los supuestos rechazados. La siguiente revisión que propone el agente los resuelve. El servidor local expone las dos acciones (`/comments` y `/request-changes`) con la misma seguridad que las demás.

### Desviaciones

- Los ayudantes de los tests del servidor (sesión, peticiones, cambio en revisión servido) pasaron de `test/server/actions.test.ts` a `test/server/support.ts`, para compartirlos con `test/server/comments.test.ts`.

### Decisiones

- Comentar no entra en la auditoría; pedir cambios, sí, con los ids de los comentarios sin resolver. La auditoría registra decisiones, y la decisión es pedir los cambios.
- Los comentarios llegan al agente solo después de que la persona pide los cambios: mientras comenta, la revisión sigue siendo suya y el agente no debe tocar la spec.
- Pedir cambios sin comentarios sin resolver ni supuestos rechazados se rechaza: no hay nada que pedir.
- `propose` resuelve los comentarios solo con una revisión nueva; si la spec no cambió, siguen abiertos.
- Comentar y pedir cambios no tienen comando de terminal: son parte de la revisión en la UI.

### Pendientes

- La UI aún responde «todavía no está en el servidor» al comentar y al pedir cambios: falta que `ServerData` llame a las rutas nuevas.
