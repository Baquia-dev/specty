---
kind: standard
epic: 20261026-las-funciones-de-specty-dentro-de-sus-limites
slice: C4
---

# Los comandos del flujo en la CLI: accept, approve, propose, review, close, cancel, task, new y la sesión de la persona

## Objetivo

Nueve funciones de los comandos del flujo pasan de los límites de Specty: `accept` (84 líneas, complejidad 31), `approveSpec` (137, 22), `propose` (71, 13), `review` (13), `close` (66, 23) y `cancel` (14), `taskDone` (12), `createNew` (14) y `personSession` (11). Cada una se divide en los pasos que ya sigue, en el mismo orden, sin cambiar lo que pregunta, registra o responde.

## Fuera de alcance

- Cambiar una pregunta a la persona, su orden, un evento del registro, un commit o una tarjeta.
- Los demás comandos, que son del corte C5.

## Supuestos

- A1: Los tests de la CLI recorren estos comandos con una terminal que responde por guion, así que un cambio en el orden de las preguntas o en lo que se registra los haría fallar.
  - impacto: alto
- A2: Cada comando se divide en sus pasos con nombre (las guardas, la verificación, la decisión de los supuestos, la escritura de la revisión, el archivo…), sin tablas nuevas, porque son flujos y no datos.

## Criterios de aceptación

- AC1: CUANDO se miden los comandos de la CLI con `specty check --all` ENTONCES accept, approve, propose, review, finish, task, new y human no tienen funciones de más de 50 líneas ni de complejidad mayor que 10.
- AC2: CUANDO se ejecutan los tests de la CLI ENTONCES pasan sin cambiar lo que comprueban.

## Archivos

- modificar packages/cli/src/commands/accept.ts — el resumen, la verificación completa y la aceptación
- modificar packages/cli/src/commands/approve.ts — el resumen, los supuestos, la aprobación y su registro
- modificar packages/cli/src/commands/propose.ts — la revisión escrita y su tarjeta
- modificar packages/cli/src/commands/review.ts — la revisión ejecutada y registrada
- modificar packages/cli/src/commands/finish.ts — el cierre confirmado y la cancelación confirmada
- modificar packages/cli/src/commands/task.ts — las comprobaciones antes de completar una tarea
- modificar packages/cli/src/commands/new.ts — el cambio creado en esta carpeta
- modificar packages/cli/src/commands/human.ts — el cambio nombrado y el elegido entre varios

## Tareas

- [x] T1: La aceptación
  - files: packages/cli/src/commands/accept.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run
  - type: refactor
- [ ] T2: La aprobación
  - files: packages/cli/src/commands/approve.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run
  - type: refactor
- [ ] T3: La propuesta y la revisión independiente
  - files: packages/cli/src/commands/propose.ts, packages/cli/src/commands/review.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run
  - type: refactor
- [ ] T4: El cierre y la cancelación
  - files: packages/cli/src/commands/finish.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run
  - type: refactor
- [ ] T5: La tarea, el cambio nuevo y la sesión de la persona
  - files: packages/cli/src/commands/task.ts, packages/cli/src/commands/new.ts, packages/cli/src/commands/human.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run
  - type: refactor
