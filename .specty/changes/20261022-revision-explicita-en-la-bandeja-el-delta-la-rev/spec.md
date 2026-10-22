---
kind: standard
follows:
  - 20261022-cabecera-del-cambio-revision-explicita-franja-se
---

# Revisión explícita en la Bandeja, el delta, la revisión completa y los comentarios

## Objetivo

La cabecera del cambio ya nombra la revisión con palabras («Revisión 3 · por aprobar»), pero la Bandeja, el delta, la revisión completa y los comentarios siguen diciendo «r3 frente a r2», «desde que aprobaste r2» o «· r2». Con este cambio, toda la UI nombra las revisiones de la misma forma y ya no queda ningún «rN» suelto.

## Fuera de alcance

- El origen de cada revisión (tras tus comentarios, ajuste, cierre), que va con la pestaña Historial.
- La salida del CLI.
- El select propio de la Bandeja, en su propio cambio.

## Supuestos

- A1: En la Bandeja, una spec por revisar dice «Spec por revisar · revisión 3, frente a la 2 aprobada»; si no hay revisión aprobada, «Spec por revisar · revisión 1».
- A2: El título del delta deja de decir «desde que aprobaste», porque en un equipo puede haberla aprobado otra persona: pasa a «Qué cambió desde la revisión 2». Encima lleva la misma línea que la cabecera: «La 2 está aprobada · 19 oct · Ana Gómez».
  - impacto: alto
- A3: La spec completa dice «Estás viendo la spec completa de la revisión 3» y su botón «Ver solo los cambios desde la revisión 2».
- A4: Cada comentario dice «Ana Gómez · hace 9 min · en la revisión 2» y, si se resolvió, «· resuelto en la 3».

## Criterios de aceptación

- AC1: CUANDO la Bandeja muestra una spec por revisar ENTONCES nombra su revisión con palabras («revisión 3, frente a la 2 aprobada»), sin «r3».
- AC2: CUANDO se abre el delta ENTONCES su título dice desde qué revisión («Qué cambió desde la revisión 2»), y encima aparecen cuál está aprobada, cuándo y quién la aprobó.
- AC3: CUANDO se ve la spec completa de un cambio con delta ENTONCES el aviso y el botón nombran las revisiones con palabras.
- AC4: CUANDO se ven los comentarios ENTONCES cada uno dice con palabras en qué revisión se escribió y en cuál se resolvió.

## Diseño

- **Bandeja** (`inbox/inbox-row.ts`): la línea de qué espera usa «revisión N» y, con delta, «frente a la M aprobada».
- **Delta** (`review/delta-review.ts`): la línea de encima del título usa `approvedNote` de `data/revision.ts`; el título usa la revisión aprobada.
- **Revisión completa** (`review/spec-review.ts`) y **comentarios** (`review/comments.ts`): textos con «la revisión N».

## Archivos

- modificar packages/ui/src/inbox/inbox-row.ts — la revisión con palabras en la Bandeja
- modificar packages/ui/src/inbox/inbox.test.ts — test de la Bandeja
- modificar packages/ui/src/review/delta-review.ts — título y línea de la revisión aprobada
- modificar packages/ui/src/review/delta-review.test.ts — tests del delta
- modificar packages/ui/src/review/spec-review.ts — aviso y botón de la spec completa
- modificar packages/ui/src/review/spec-review-modes.test.ts — tests de los modos
- modificar packages/ui/src/review/comments.ts — la revisión de cada comentario
- modificar packages/ui/src/review/comments.test.ts — tests de los comentarios
- modificar docs/ui.md — la revisión con palabras en toda la UI

## Tareas

- [x] T1: La revisión con palabras en la Bandeja
  - files: packages/ui/src/inbox/inbox-row.ts, packages/ui/src/inbox/inbox.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/inbox/inbox.test.ts
- [ ] T2: El delta y la spec completa
  - files: packages/ui/src/review/delta-review.ts, packages/ui/src/review/delta-review.test.ts, packages/ui/src/review/spec-review.ts, packages/ui/src/review/spec-review-modes.test.ts
  - ac: AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/review/delta-review.test.ts --include src/review/spec-review-modes.test.ts
- [ ] T3: Los comentarios y la documentación
  - files: packages/ui/src/review/comments.ts, packages/ui/src/review/comments.test.ts, docs/ui.md
  - ac: AC4
  - verify: pnpm check
  - notes: Comprobar en el navegador, a 390 y 1280 px, que no queda ningún «rN» suelto en la Bandeja, el delta, la spec completa ni los comentarios.
