---
kind: standard
---

# Hallazgos que pasan de una tarea y un cambio al siguiente

## Objetivo

Lo que el agente descubre mientras trabaja deja de perderse entre tareas y entre cambios, sin depender de una memoria externa. `specty task done <T> --finding "<texto>"` guarda cada hallazgo en la auditoría; las tarjetas de las tareas siguientes y la del cierre lo muestran, y la del cierre pide pasar a Pendientes los que sigan abiertos. Un cambio creado con `--follows <id>` muestra en su borrador los Pendientes y los hallazgos del cambio que continúa, como ya promete ARCHITECTURE §7 («un cambio de seguimiento carga la sección Cierre del anterior») y hoy no hace.

## Fuera de alcance

- Mostrar los hallazgos en la UI: el dato queda en la auditoría que ya sirve `/api/changes`.
- Sugerir `--follows` al crear un cambio, o listar los pendientes de todos los cambios cerrados.
- Hallazgos fuera de `task done`, por ejemplo durante la redacción de la spec.

## Supuestos

- A1: Los hallazgos van en `task.completed.data.findings` (una lista de textos, en el orden dado), porque nacen al terminar una tarea y la auditoría es la fuente que ya leen las tarjetas y la UI.
  - impacto: medio
- A2: Del cambio que se continúa se cargan solo sus Pendientes (la subsección `### Pendientes` o `### Follow-ups` de su Cierre, por viñetas) y sus hallazgos, no todo el Cierre: es lo que el siguiente tiene que decidir.
  - impacto: medio
- A3: El cambio que se continúa se busca entre los abiertos y los archivados de la carpeta del nuevo; uno abierto en otra worktree no se ve, y el borrador lo dice.
- A4: Un texto vacío en `--finding` es un error de uso, como un resumen vacío.

## Criterios de aceptación

- AC1: CUANDO el agente ejecuta `specty task done T1 --summary "<s>" --finding "<a>" --finding "<b>"` ENTONCES `task.completed` guarda `findings: ["<a>", "<b>"]`, y uno vacío se rechaza sin completar la tarea.
- AC2: CUANDO la tarea siguiente o el cierre están en curso ENTONCES su tarjeta muestra un bloque HALLAZGOS con «T1: <a>», y la del cierre pide llevar a ### Pendientes los que sigan abiertos.
- AC3: CUANDO un cambio creado con `--follows <id>` está en borrador ENTONCES su tarjeta muestra los Pendientes del Cierre de `<id>` y sus hallazgos, y si `<id>` no está en esta carpeta, lo dice.
- AC4: CUANDO alguien lee ARCHITECTURE §7 y formats.md §4 ENTONCES encuentra `--finding`, dónde se guardan los hallazgos y qué carga un cambio de seguimiento.

## Diseño

- Core, tarjetas: `TaskView.findings` y `ChangeView.carried` (por cada cambio seguido: su id, si se encontró, sus pendientes y sus hallazgos). La tarjeta de tarea y la de cierre muestran HALLAZGOS; la del borrador, un bloque por cambio seguido.
- CLI: `--finding <texto>` repetible en `task done`; `task done` lo valida y lo añade a `task.completed`. `changeView` lee los hallazgos de la auditoría con lo demás; `flow/carried.ts` carga, en borrador, cada cambio de `follows` con `locateChange`, saca los Pendientes de su Cierre y sus hallazgos.

## Archivos

- modificar packages/core/src/cards/view.ts — `TaskView.findings` y `ChangeView.carried`
- modificar packages/core/src/cards/work.ts — HALLAZGOS en la tarjeta de tarea y en la de cierre
- modificar packages/core/src/cards/next.ts — lo que trae el cambio seguido en el borrador
- crear packages/core/test/cards/findings.test.ts — las tres tarjetas
- modificar packages/cli/src/program.ts — la opción `--finding`
- modificar packages/cli/src/commands/task.ts — validar y guardar los hallazgos
- modificar packages/cli/src/flow/views.ts — los hallazgos de la auditoría y los cambios seguidos
- crear packages/cli/src/flow/carried.ts — los pendientes y hallazgos de un cambio seguido
- crear packages/cli/test/findings.test.ts — de punta a punta
- modificar docs/ARCHITECTURE.md — §7: hallazgos y cambios de seguimiento
- modificar docs/formats.md — §4: `findings` en `task.completed`

## Tareas

- [ ] T1: Los hallazgos en las tarjetas
  - files: packages/core/src/cards/view.ts, packages/core/src/cards/work.ts, packages/core/src/cards/next.ts, packages/core/test/cards/findings.test.ts
  - ac: AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards test/cards.test.ts
- [ ] T2: task done --finding y los cambios seguidos
  - files: packages/cli/src/program.ts, packages/cli/src/commands/task.ts, packages/cli/src/flow/views.ts, packages/cli/src/flow/carried.ts, packages/cli/test/findings.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/findings.test.ts test/flow.test.ts
- [ ] T3: Documentar los hallazgos
  - files: docs/ARCHITECTURE.md, docs/formats.md
  - ac: AC4
  - verify: pnpm check
  - type: docs
