---
kind: quick
---

# El rechazo de un supuesto desde la UI deja la revisión con la persona

## Objetivo

Cuando la persona rechaza un supuesto suelto desde la UI, la respuesta del servidor (`decideAssumption` de `flow/review.ts`, con `assumptionDecidedLine` de `cards/review-ui.ts`) sigue diciendo «el agente debe corregir la spec», aunque desde P231 `changeWaitsFor` deja el turno con la persona hasta que apruebe, con lo que el rechazo devuelve la revisión al agente, o pida los cambios (P233). Con este cambio la línea dice lo mismo que `changeWaitsFor`: el supuesto queda rechazado y la revisión sigue con la persona, que puede aprobarla, y el rechazo se la devuelve al agente, o pedir los cambios; en español y en inglés. La línea de un supuesto confirmado y la conducta no cambian, y la de rechazar supuestos al aprobar (`rejectedAssumptionsLine`) sigue diciendo que el agente corrige la spec, porque ahí sí le devuelve la revisión.

## Archivos

- modificar packages/core/src/cards/review-ui.ts — `assumptionDecidedLine` con `rejected` dice que la revisión sigue con la persona, que puede aprobarla, y el rechazo se la devuelve al agente, o pedir los cambios
- modificar packages/core/test/cards/review-texts.test.ts — la línea de un supuesto rechazado en los dos idiomas; el caso que ya había deja de comprobar el texto viejo

## Tareas

- [x] T1: La línea de un supuesto rechazado desde la UI deja la revisión con la persona
  - files: packages/core/src/cards/review-ui.ts, packages/core/test/cards/review-texts.test.ts
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/review-texts.test.ts && pnpm typecheck && pnpm lint
  - type: fix

## Cierre

### Resumen

assumptionDecidedLine con rejected dice, en los dos idiomas, que la revisión sigue con la persona, que puede aprobarla (el rechazo se la devuelve al agente) o pedir los cambios, como changeWaitsFor; el caso que ya había en review-texts.test.ts deja de comprobar el texto viejo
