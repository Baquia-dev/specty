---
kind: standard
epic: 20261026-las-funciones-de-specty-dentro-de-sus-limites
slice: C2
---

# Las tarjetas de core, segunda parte: new, next, review, task, text y work

## Objetivo

Once funciones de las tarjetas de core pasan de los límites de Specty: `newRefusalCard` (86 líneas) y `worktreeCreatedCard` (56) en new, `nextCard` (complejidad 11), `noChangeCard` (53) y `reviewCard` (60) en next, `reviewRefusalCard` (56) en review, `taskDoneRefusalCard` (67) en task, `draftingGuide` (67) en text, y `taskCard` (51), `acceptanceCard` (55) y `closingCard` (68) en work. Cada una se divide por responsabilidad, o pasa a tabla, sin cambiar ningún texto.

## Fuera de alcance

- Cambiar cualquier texto, estado o siguiente paso de una tarjeta.
- Las tarjetas que ya están dentro de los límites.

## Supuestos

- A1: Los tests de las tarjetas de core cubren estos textos, así que pasan sin cambios si el refactor no cambia nada.
  - impacto: alto
- A2: Una tarjeta que reúne varias (sin cambio, revisión, cierre) se separa en las que contiene; un rechazo, en su razón, su paso y su estado; y la tarjeta de cada fase de `next`, en una tabla por fase.

## Criterios de aceptación

- AC1: CUANDO se mide `packages/core/src/cards` con `specty check --all` ENTONCES new, next, review, task, text y work no tienen funciones de más de 50 líneas ni de complejidad mayor que 10.
- AC2: CUANDO se ejecutan los tests de core ENTONCES pasan sin cambiar lo que comprueban.

## Archivos

- modificar packages/core/src/cards/new.ts — el rechazo por razón, paso y estado, y la carpeta creada por bloques
- modificar packages/core/src/cards/next.ts — la tabla por fase y las tarjetas sin cambio y de revisión, separadas
- modificar packages/core/src/cards/review.ts — la razón del rechazo de la revisión
- modificar packages/core/src/cards/task.ts — los rechazos por las notas, aparte
- modificar packages/core/src/cards/text.ts — la guía común y la de cada tipo de cambio
- modificar packages/core/src/cards/work.ts — la tarea, la aceptación y el cierre, por partes

## Tareas

- [x] T1: La creación de un cambio
  - files: packages/core/src/cards/new.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run
  - type: refactor
- [x] T2: La siguiente tarjeta y la revisión
  - files: packages/core/src/cards/next.ts, packages/core/src/cards/review.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run
  - type: refactor
- [ ] T3: El rechazo de una tarea y la guía de redacción
  - files: packages/core/src/cards/task.ts, packages/core/src/cards/text.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run
  - type: refactor
- [ ] T4: La tarea, la aceptación y el cierre
  - files: packages/core/src/cards/work.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run
  - type: refactor
