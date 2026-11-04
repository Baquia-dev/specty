---
kind: standard
---

# Las vistas de las tareas y las preguntas de init, en sus propios archivos

## Objetivo

Dos archivos pasan del aviso de tamaño (300 líneas de código): `cli/src/flow/views.ts` (321) y `core/src/cards/init.ts` (377). Cada uno mezcla dos responsabilidades que se separan bien, y este cambio los divide por ellas sin cambiar lo que hacen (P42 y P59 de la memoria).

## Fuera de alcance

- Los datos del borrador (`draftFacts`, `request`, `resolvesOf`) siguen en `views.ts`, aunque P42 proponía llevarlos a `flow/draft-facts.ts`: sin las vistas de las tareas, `views.ts` queda muy por debajo del aviso, y tres funciones que solo usa `changeView` no justifican otro archivo. `filesAtHand` y `pathEntriesOf` sirven a todas las fases, no solo al borrador.
- `core/src/index.ts` y `core/src/cards/index.ts` (P2 y P9): son las listas explícitas de la API de core; si estorban, la persona las añade a `lines.exclude`.
- Cambiar lo que hacen `next`, `task done`, `audit` o `init`: los tests que ya existen son el contrato y no cambian.

## Supuestos

- A1: Basta con mover código a archivos nuevos dentro del mismo paquete, sin reglas ni textos nuevos; los tests que ya existen cubren lo movido, porque ejecutan el CLI o importan desde la API pública de core.

## Criterios de aceptación

- AC1: CUANDO se ejecuta `specty check --all` con el CLI construido sobre este cambio ENTONCES `max-lines` ya no avisa de `flow/views.ts` ni de `cards/init.ts`, ni de los archivos nuevos.
  - test: manual
- AC2: CUANDO se ejecuta `pnpm check` ENTONCES pasa sin cambiar ningún test que ya existía.
  - test: manual

## Diseño

- `flow/views.ts` se queda con la vista del cambio: `changeView`, los datos de cada fase (`phaseFacts`, `draftFacts`, `requested`), los supuestos rechazados, la incorporación, las notas, las convenciones, el glosario y las entradas de la memoria de los archivos a mano.
- Las vistas de las tareas pasan a `flow/task-views.ts`: `taskVerification`, `taskCommits` y una función nueva `taskViews(session, spec, state, audit)` que devuelve las tareas y sus commits, con lo privado que usa (`taskView`, `recordedFindings`, `findingsByTask`, `criteriaOf`, `listOf`, `TaskRecords`, `TaskFindings`). `changeView` llama a `taskViews` y pasa los commits a `phaseFacts`, como hoy.
- `commands/task.ts` y `flow/task-done.ts` importan `taskVerification`, y `commands/audit.ts` `taskCommits`, del archivo nuevo.
- `cards/init.ts` se queda con lo que `init` rechaza, lo que hizo con cada archivo, su tarjeta y la de `--dry-run`.
- Las opciones que `init` ofrece a la persona pasan a `cards/init-questions.ts`: el idioma (`languageQuestion`, `languageChoices`), los agentes (`agentQuestion`, `agentChoices`, `noAgentWarning`, con `AGENT_TOOLS` y `AGENT_HINTS`) y el flujo de git (`flowQuestion`, `flowChoices`, `flowLine`, `noFlowWarning`, con `FLOW_BRANCHES`, `FLOW_HINTS` y `FLOW_TITLES`). Los textos se mueven tal cual.
- `cards/index.ts` exporta cada nombre desde su archivo nuevo; la API de core no cambia.

## Archivos

- modificar packages/cli/src/flow/views.ts — se queda con la vista del cambio
- crear packages/cli/src/flow/task-views.ts — las vistas de las tareas
- modificar packages/cli/src/commands/task.ts — importa taskVerification del archivo nuevo
- modificar packages/cli/src/commands/audit.ts — importa taskCommits del archivo nuevo
- modificar packages/cli/src/flow/task-done.ts — importa taskVerification del archivo nuevo
- modificar packages/core/src/cards/init.ts — se queda con lo que init rechaza, hizo y mostraría
- crear packages/core/src/cards/init-questions.ts — las opciones que init ofrece a la persona
- modificar packages/core/src/cards/index.ts — exporta cada nombre desde su archivo

## Tareas

- [ ] T1: Las vistas de las tareas, en su propio archivo
  - files: packages/cli/src/flow/views.ts, packages/cli/src/flow/task-views.ts, packages/cli/src/commands/task.ts, packages/cli/src/commands/audit.ts, packages/cli/src/flow/task-done.ts
  - ac: AC1, AC2
  - verify: pnpm typecheck && pnpm lint && pnpm knip && pnpm --filter @baquia-dev/specty exec vitest run test/audit.test.ts test/audit-who.test.ts test/task-check.test.ts test/findings.test.ts test/criteria-tests.test.ts test/commands.test.ts
  - type: refactor
- [ ] T2: Las opciones que init ofrece, en su propio archivo
  - files: packages/core/src/cards/init.ts, packages/core/src/cards/init-questions.ts, packages/core/src/cards/index.ts
  - ac: AC1, AC2
  - verify: pnpm typecheck && pnpm lint && pnpm knip && pnpm sources && pnpm --filter @baquia-dev/specty-core exec vitest run test/cards && pnpm --filter @baquia-dev/specty exec vitest run test/init-agents.test.ts test/init-git-flow.test.ts test/init-language.test.ts
  - type: refactor

## Riesgos

- R1: Un import circular entre `views.ts` y `task-views.ts`, o entre `init.ts` y `init-questions.ts`. Mitigación: los archivos nuevos no importan de los que se dividen.
