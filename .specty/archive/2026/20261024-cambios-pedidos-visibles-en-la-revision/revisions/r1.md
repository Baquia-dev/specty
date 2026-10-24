---
kind: standard
---

# Cambios pedidos visibles en la revisión

## Objetivo

Cuando la persona ya pidió cambios, la UI lo muestra. La revisión dice que el agente prepara la revisión siguiente, «Pedir cambios» queda desactivado con ese motivo, y el cambio deja de esperar a la persona en la cabecera y en la bandeja. Hoy «Pedir cambios» sigue activo, y pedirlos otra vez solo añade otra línea a la auditoría.

## Fuera de alcance

- Que el servidor rechace una segunda petición de cambios sobre la misma revisión.
- Avisar a la persona cuando llega la revisión siguiente.

## Supuestos

- A1: Los cambios están pedidos mientras el último `spec.proposed` o `review.changes_requested` de la auditoría sea `review.changes_requested`. Es la misma regla con la que `specty next` se los da al agente.
- A2: «Aprobar» sigue disponible tras pedir cambios: la persona puede cambiar de opinión, como en la terminal.

## Criterios de aceptación

- AC1: CUANDO la persona pidió cambios sobre la revisión vigente ENTONCES la vista del cambio lo sabe, con la revisión y la hora, y el cambio ya no espera a la persona sino al agente.
- AC2: CUANDO la persona abre esa revisión ENTONCES bajo los botones lee «Cambios pedidos: el agente prepara la revisión N+1.», y «Pedir cambios» aparece desactivado con ese motivo.
- AC3: CUANDO el agente propone la revisión siguiente ENTONCES el cambio vuelve a esperar a la persona.
- AC4: CUANDO la persona pide cambios en el prototipo ENTONCES los datos de ejemplo lo anotan en la auditoría como el servidor, y lo rechazan si no hay nada que pedir.
- AC5: CUANDO alguien lee el documento de la UI ENTONCES encuentra cómo se ve una revisión con los cambios pedidos.

## Diseño

- `ChangeView.changesRequested` (`{ revision, at }`) se deriva de la auditoría en `deriveView`. Mientras existe, `decision` queda vacío: el cambio espera al agente, así que la cabecera no dice «espera tu revisión» y la bandeja no lo pone entre lo que te espera.
- `ReviewActions` muestra el aviso bajo los botones, en tono atenuado, y lo usa como motivo para desactivar «Pedir cambios».
- `requestChangesIn` (`sample-records.ts`) anota `review.changes_requested` con los comentarios sin resolver, o se niega como el servidor, y `FixtureData.requestChanges` lo usa.

## Archivos

- modificar packages/ui/src/data/records.ts — `changesRequested` en la vista del cambio
- modificar packages/ui/src/data/views.ts — derivarlo, y que el cambio espere al agente
- modificar packages/ui/src/data/views.test.ts — tests de la derivación
- modificar packages/ui/src/data/sample-records.ts — `requestChangesIn`
- modificar packages/ui/src/data/fixtures.ts — `requestChanges` lo anota
- modificar packages/ui/src/data/fixtures.test.ts — tests del prototipo
- modificar packages/ui/src/review/review-actions.ts — el aviso y «Pedir cambios» desactivado
- modificar packages/ui/src/review/review-actions.test.ts — tests de la revisión
- modificar docs/ui.md — la revisión con los cambios pedidos

## Tareas

- [ ] T1: La vista sabe que se pidieron cambios
  - files: packages/ui/src/data/records.ts, packages/ui/src/data/views.ts, packages/ui/src/data/views.test.ts, packages/ui/src/data/sample-records.ts, packages/ui/src/data/fixtures.ts, packages/ui/src/data/fixtures.test.ts
  - ac: AC1, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data && pnpm sources
- [ ] T2: La revisión muestra los cambios pedidos
  - files: packages/ui/src/review/review-actions.ts, packages/ui/src/review/review-actions.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/review --include src/change && pnpm sources
- [ ] T3: Documentar los cambios pedidos en la UI
  - files: docs/ui.md
  - ac: AC5
  - verify: pnpm check
  - type: docs
