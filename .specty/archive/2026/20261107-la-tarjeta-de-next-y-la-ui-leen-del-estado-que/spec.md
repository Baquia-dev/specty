---
kind: standard
---

# La tarjeta de next y la UI leen del estado que se pidieron cambios

## Objetivo

Desde P225, `changesRequestedAt` en `state.json` dice que la persona devolvió la revisión, y `changeWaitsFor` decide a quién espera el cambio. La tarjeta de `specty next` y la UI aún lo deducen de la auditoría y de los supuestos rechazados: `next` le pide al agente que corrija cuando la persona solo rechazó un supuesto suelto en la UI, y la UI le pide la revisión a la persona después de que rechazara supuestos al aprobar. Las dos leerán el estado y dirán lo mismo que `wait`, `status` y el fin de turno.

## Fuera de alcance

- Marcar «Nadie retoma tu decisión» tras rechazar supuestos al aprobar (`assumption.decided` en las `DECISIONS` de `server/unattended.ts`): lo lleva P232.
- La línea que responde el servidor al decidir un supuesto (`assumptionDecidedLine`): la UI no la muestra.
- Cuándo se pone y se quita `changesRequestedAt`, que no cambia.
- `decisionOf` en las demás fases y con una incorporación pendiente.

## Supuestos

- A1: La tarjeta de `next` en `review` da los cambios pedidos solo cuando el cambio espera al agente según `changeWaitsFor`, es decir, con `changesRequestedAt`. Entonces lista los supuestos rechazados y los comentarios sin resolver; si no queda ninguno, porque la persona confirmó después el supuesto que había rechazado, dice que el usuario le devolvió la revisión y le sigue pidiendo `propose`. Sin el campo, un supuesto rechazado no basta: la tarjeta dice que espera la revisión del usuario o, en modo delegado, que la revisión le toca al agente.
  - impacto: alto
- A2: En el `ChangeView` de core, `requested` solo existe una vez devuelta la revisión, con los comentarios sin resolver, aunque no haya ninguno, y `reviewCard` decide por su presencia. Así no hace falta un campo nuevo, y `cli/flow/views.ts` deja de leer la auditoría para eso.
  - impacto: medio
- A3: En la UI, `changesRequestedOf` da la revisión vigente (`state.revision`) y la hora de `changesRequestedAt`. La vigente es la que la persona devolvió, porque solo `propose` la sube, y entonces borra el campo. `decisionOf` da «review» solo si `changeWaitsFor` da la persona, así que la Bandeja tampoco pide la revisión tras rechazar supuestos al aprobar.
  - impacto: medio
- A4: Los datos de ejemplo del prototipo imitan al servidor: pedir cambios pone `changesRequestedAt` en el estado, además de la línea de la auditoría, y aprobar lo quita.
  - impacto: bajo
- A5: Un cambio con cambios pedidos antes de P225 no tiene el campo: la tarjeta y la UI esperan a la persona hasta su próxima propuesta, como ya hacen `wait` y `status`.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO la persona rechaza un supuesto suelto desde la UI, sin pedir los cambios, ENTONCES `specty next` dice que espera la revisión del usuario y no lista «SUPUESTOS RECHAZADOS»; CUANDO después pide los cambios ENTONCES `next` da el supuesto rechazado con su motivo y pide `specty propose`.
- AC2: CUANDO la persona rechaza un supuesto al aprobar en su terminal ENTONCES `specty next` da el supuesto rechazado, aunque la auditoría no tenga `review.changes_requested`; CUANDO el agente propone la revisión siguiente ENTONCES `next` vuelve a decir que espera la revisión del usuario.
- AC3: CUANDO la tarjeta de `next` recibe un cambio en `review` con los cambios pedidos y sin nada que listar ENTONCES dice que el usuario le devolvió la revisión y pide `propose`; CUANDO lo recibe con supuestos rechazados y sin los cambios pedidos ENTONCES dice que espera la revisión del usuario o, en modo delegado, que la revisión le toca al agente.
- AC4: CUANDO la UI deriva un cambio en `review` cuyo `state.json` lleva `changesRequestedAt` ENTONCES no le pone decisión y lleva «Cambios pedidos» con la revisión vigente y esa hora; CUANDO no lo lleva ENTONCES su decisión es «review», aunque la auditoría tenga `review.changes_requested`.
- AC5: CUANDO, en el prototipo, la persona pide cambios ENTONCES el estado del cambio lleva `changesRequestedAt` y el cambio deja de esperar su decisión; CUANDO luego aprueba ENTONCES el estado ya no lo lleva.

## Diseño

- Core: `reviewCard` (`cards/next.ts`) da `changesRequestedCard` si `change.requested` existe, y esta añade la línea de la revisión devuelta cuando no hay supuestos rechazados ni comentarios. El comentario de `requested` en `cards/view.ts` dice cuándo existe.
- CLI: `phaseFacts` (`flow/views.ts`) pone `requested` solo en `review` con `changeWaitsFor(state) === "agent"`, y `requested` lee los comentarios sin la auditoría.
- UI: `changesRequestedOf(state)` y `decisionOf(state)` (`data/views.ts`) leen el estado con `changeWaitsFor`, que `views.ts` importa del índice de core porque solo lo carga el worker. `requestChangesIn` (`data/sample-records.ts`) pone el campo y `approveIn` (`data/sample-review.ts`) lo quita.

## Archivos

- modificar packages/core/src/cards/next.ts — la tarjeta de la revisión decide por los cambios pedidos
- modificar packages/core/src/cards/view.ts — cuándo existe `requested`
- modificar packages/core/test/cards.test.ts — tests de la tarjeta de la revisión
- modificar packages/core/test/cards/delegated.test.ts — los supuestos rechazados vuelven al agente solo con la revisión devuelta
- modificar packages/cli/src/flow/views.ts — `requested` sale de `changeWaitsFor`
- crear packages/cli/test/changes-requested-card.test.ts — tests de la tarjeta de `next` tras rechazar supuestos y pedir cambios
- modificar packages/ui/src/data/views.ts — los cambios pedidos y la decisión salen del estado
- modificar packages/ui/src/data/sample-records.ts — pedir cambios en el prototipo pone `changesRequestedAt`
- modificar packages/ui/src/data/sample-review.ts — aprobar en el prototipo lo quita
- modificar packages/ui/src/data/views.test.ts — tests de la vista derivada
- modificar packages/ui/src/data/fixtures.test.ts — tests del prototipo
- modificar docs/formats.md — §5: cuándo da `next` los cambios pedidos
- modificar docs/ARCHITECTURE.md — §4: la tarjeta de `next` y la UI leen la regla común
- modificar docs/ui.md — «Cambios pedidos» en la revisión

## Tareas

- [x] T1: La tarjeta de la revisión decide por los cambios pedidos, en core
  - files: packages/core/src/cards/next.ts, packages/core/src/cards/view.ts, packages/core/test/cards.test.ts, packages/core/test/cards/delegated.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards.test.ts test/cards/delegated.test.ts && pnpm lint
  - type: fix
- [x] T2: `next` da los cambios pedidos solo con la revisión devuelta
  - files: packages/cli/src/flow/views.ts, packages/cli/test/changes-requested-card.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/changes-requested-card.test.ts test/changes-requested-turn.test.ts test/comments.test.ts && pnpm lint
  - type: fix
- [x] T3: La UI lee del estado los cambios pedidos y la decisión
  - files: packages/ui/src/data/views.ts, packages/ui/src/data/sample-records.ts, packages/ui/src/data/sample-review.ts, packages/ui/src/data/views.test.ts, packages/ui/src/data/fixtures.test.ts
  - ac: AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/views.test.ts --include src/data/fixtures.test.ts && pnpm typecheck && pnpm lint
  - type: fix
- [x] T4: La documentación cuenta que `next` y la UI leen el estado
  - files: docs/formats.md, docs/ARCHITECTURE.md, docs/ui.md
  - ac: AC1, AC4
  - verify: pnpm lint && pnpm sources
  - type: docs

## Riesgos

- R1: P232 toca `server/unattended.ts` y P229 el guard a la vez. Mitigación: este cambio no toca esos archivos; si chocan los documentos al incorporar main, se resuelve con `specty integrate`.

## Cierre

### Resumen

La tarjeta de `specty next` y la UI dicen ya lo mismo que `wait`, `status` y el fin de turno sobre quién tiene la revisión, porque leen el estado y no la auditoría:
- Core: `reviewCard` da los cambios pedidos solo si el `ChangeView` trae `requested`, que ahora solo existe con la revisión devuelta. Si no queda nada que listar, dice «El usuario te devolvió la revisión N.» y sigue pidiendo `propose`. Un supuesto rechazado suelto deja la tarjeta de espera, o la del modo delegado.
- CLI: `phaseFacts` (`flow/views.ts`) pone `requested` solo en `review` con `changeWaitsFor(state) === "agent"`, y lee los comentarios sin mirar la auditoría.
- UI: `decisionOf` da «review» solo si `changeWaitsFor` da la persona, y `changesRequestedOf` saca la revisión y la hora de `changesRequestedAt`. El prototipo pone el campo al pedir cambios y lo quita al aprobar.
- Documentación: formats.md §5, ARCHITECTURE §4 y ui.md («Cambios pedidos»).

### Desviaciones (respecto al plan)

- Ninguna. Antes de aprobarla, la spec partió en dos la tarea de la tarjeta (core y CLI) por el aviso de tamaño.

### Decisiones

- `requested` presente es la señal de la revisión devuelta, en lugar de un campo nuevo en `ChangeView`: la CLI lo calcula con `changeWaitsFor` y core decide por él.
- `assumptionDecidedLine` sigue diciendo «el agente debe corregir la spec» al rechazar un supuesto suelto: es la respuesta del servidor, que la UI no muestra.
- `views.ts` de la UI importa `changeWaitsFor` del índice de core y no de `light.ts`, porque solo lo carga el worker de derivación.

### Pendientes

- Ninguno.
