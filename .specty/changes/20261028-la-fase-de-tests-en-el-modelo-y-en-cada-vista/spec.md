---
kind: standard
follows:
  - 20261027-cada-criterio-se-comprueba-con-un-test-que-lleva
---

# La fase de tests en el modelo y en cada vista

## Objetivo

El corte C2 de la épica «Tests como contrato» añade la fase `testing`, entre `review` e `implementing`: con `policy.tests: contract`, el agente escribe primero los tests de los criterios y la persona los aprueba antes del código. La lista de fases es un tipo exhaustivo en core, en el servidor de la CLI y en la UI, así que la fase nueva tiene que llegar a los tres a la vez. Este cambio es ese paso: `state.json` admite `testing`, la máquina deja cancelar un cambio en esa fase, `specty next` tiene su tarjeta, el servidor sabe desde cuándo está ahí y la UI la nombra con su icono. Entrar en ella, enviar los tests y aprobarlos llegan en los cambios siguientes; hasta entonces ningún cambio llega a `testing`.

## Fuera de alcance

- Entrar en `testing` al aprobar la spec, el valor `contract` y abrir el código a los tests: el cambio siguiente.
- Enviar los tests con `specty propose`, el rojo y el gate 2 con `specty approve`: los cambios siguientes, el último el corte C2.
- La pantalla de la UI para la fase de tests (C6): aquí solo su nombre, su icono, su pestaña y el estado de la revisión.

## Supuestos

- A1: Mientras nadie entra en `testing`, sus permisos son los de una fase de espera del agente con todo bloqueado (código y spec); el cambio siguiente abre los tests al abrir la entrada.
- A2: En la UI, la fase se llama «Tests» en los dos idiomas, con el icono `flask-conical` de Lucide, abre la pestaña de progreso, como `implementing`, y su revisión se ve «aprobada».
- A3: El servidor fecha la entrada en `testing` por `spec.approved`, el evento que la abrirá.

## Criterios de aceptación

- AC1: CUANDO `state.json` de un cambio tiene `phase: testing` ENTONCES Specty lo lee como válido, y la máquina deja cancelarlo y rechaza los demás eventos.
- AC2: CUANDO un cambio está en `testing` ENTONCES `specty next` muestra la tarjeta de la fase de tests: los criterios de sus tareas `feat` con su id, que solo se escriben tests (ni código de producción ni sus firmas), que cada test lleva el id de su criterio en el nombre, y que el siguiente paso es `specty propose`.
- AC3: CUANDO el servidor sirve un cambio en `testing` ENTONCES su `phaseSince` es la hora de su última aprobación de la spec.
- AC4: CUANDO la UI muestra un cambio en `testing` ENTONCES lo nombra «Tests» con su icono, abre la pestaña de progreso y su revisión se ve «aprobada».
- AC5: CUANDO se leen docs/formats.md y docs/ARCHITECTURE.md ENTONCES nombran la fase `testing`, qué permite y que todavía no se entra en ella.
  - test: manual

## Diseño

- `Phase`, `PHASES` y `PhaseSchema` ganan `testing` después de `review`. Sus permisos: código y spec bloqueados, espera al agente (A1).
- La tarjeta de la fase va en un archivo propio, `core/src/cards/testing.ts`, porque `cards/work.ts` ya pasa de 300 líneas; `cards/next.ts` la pone en `PHASE_CARDS`.
- La máquina añade `testing` a las fases abiertas (`OPEN`), las que se pueden cancelar.
- El servidor: `ENTERS.testing` es `spec.approved`. La UI: `PHASE_ICONS`, `PHASE_LABELS`, `TABS` y `STATES` ganan su entrada, y `components/icons.ts` el icono.

## Archivos

- modificar packages/core/src/flow/phases.ts — la fase `testing` y sus permisos
- modificar packages/core/src/schema/state.ts — `testing` en `PhaseSchema`
- modificar packages/core/src/flow/machine.ts — `testing` entre las fases que se pueden cancelar
- modificar packages/core/src/cards/next.ts — la tarjeta de la fase en `PHASE_CARDS`
- crear packages/core/src/cards/testing.ts — la tarjeta de la fase de tests
- modificar packages/cli/src/server/records.ts — desde cuándo un cambio está en `testing`
- crear packages/cli/test/server/records.test.ts — `phaseSince` de un cambio en `testing`
- modificar packages/ui/src/components/badge.ts — el icono de la fase
- modificar packages/ui/src/components/icons.ts — el icono `flask-conical`
- modificar packages/ui/src/theme/tokens.ts — el nombre de la fase
- modificar packages/ui/src/data/views.ts — la pestaña que abre
- modificar packages/ui/src/data/revision.ts — el estado de su revisión
- modificar docs/formats.md — `testing` entre los valores de `phase`
- modificar docs/ARCHITECTURE.md — §4: la fase en el diagrama y en la tabla; §15: desde cuándo está en ella

## Tareas

- [ ] T1: La fase testing en el modelo, su tarjeta, el servidor y la UI
  - files: packages/core/src/flow/phases.ts, packages/core/src/schema/state.ts, packages/core/src/cards/next.ts, packages/core/src/cards/testing.ts, packages/cli/src/server/records.ts, packages/cli/test/server/records.test.ts, packages/ui/src/components/badge.ts, packages/ui/src/components/icons.ts, packages/ui/src/theme/tokens.ts, packages/ui/src/data/views.ts, packages/ui/src/data/revision.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm typecheck && pnpm --filter @baquia-dev/specty-core exec vitest run test/schema test/cards && pnpm --filter @baquia-dev/specty exec vitest run test/server/records.test.ts && pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data --include src/theme --include src/components
  - notes: una sola tarea porque cada `Record<Phase, …>` de core, cli y ui exige la fase a la vez: repartida, una tarea dejaría los tipos en rojo.
- [ ] T2: Un cambio en testing se puede cancelar; la documentación nombra la fase
  - files: packages/core/src/flow/machine.ts, docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC1, AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/flow

## Riesgos

- R1: Una fase a la que no se llega es código que no se usa hasta el cambio siguiente. Mitigación: la épica ya planea los cambios siguientes, y los tests de core y de la UI la ejercitan con un `state.json` en `testing`.
