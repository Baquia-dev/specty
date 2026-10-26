---
kind: standard
epic: 20261026-las-funciones-de-specty-dentro-de-sus-limites
slice: C1
---

# Las tarjetas de core, primera parte: audit, doctor, epic, flow y human

## Objetivo

Las tarjetas de auditoría, de épica, de propuesta y de estado tienen funciones fuera de los límites de Specty: `what` (84 líneas, complejidad 29) y `auditReport` (58) en audit, `sliceRefusalCard` (75) en epic, `proposedCard` (58) en flow y `statusCard` (54) en human. Cada una se divide por responsabilidad, o pasa a tabla, sin cambiar ningún texto. `doctorLine` ya no está fuera de los límites.

## Fuera de alcance

- Cambiar cualquier texto, estado o siguiente paso de una tarjeta.
- Las demás tarjetas de core, que son del corte C2.

## Supuestos

- A1: Los tests de las tarjetas (`test/cards/*.test.ts` y `test/cards.test.ts`) cubren los textos de estas funciones, así que pasan sin cambios si el refactor no cambia nada.
  - impacto: alto
- A2: Las descripciones de los eventos de la auditoría son datos: una tabla por evento, leída con `lookup`, sustituye al `switch`, y un evento desconocido sigue mostrándose por su nombre.

## Criterios de aceptación

- AC1: CUANDO se mide `packages/core/src/cards` con `specty check --all` ENTONCES audit, epic, flow y human no tienen funciones de más de 50 líneas ni de complejidad mayor que 10.
- AC2: CUANDO se ejecutan los tests de core ENTONCES pasan sin cambiar lo que comprueban.

## Archivos

- modificar packages/core/src/cards/audit.ts — la tabla de eventos y el informe por bloques
- modificar packages/core/src/cards/epic.ts — el estado, la razón y el paso de un corte rechazado
- modificar packages/core/src/cards/flow.ts — la propuesta del cierre y la de la spec
- modificar packages/core/src/cards/human.ts — la línea de cada cambio, el modo delegado y el paso siguiente

## Tareas

- [ ] T1: La auditoría, por eventos y por bloques
  - files: packages/core/src/cards/audit.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run
  - type: refactor
- [ ] T2: El corte rechazado y la propuesta
  - files: packages/core/src/cards/epic.ts, packages/core/src/cards/flow.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run
  - type: refactor
- [ ] T3: El estado de los cambios
  - files: packages/core/src/cards/human.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run
  - type: refactor
