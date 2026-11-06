---
kind: standard
---

# Tras pedir cambios, la revisión espera al agente

## Objetivo

Cuando la persona pide cambios en la revisión, o rechaza supuestos al aprobar, el cambio sigue en `review` pero le toca al agente. Hoy `specty wait`, el fin de turno, el freno de `sleep` del guard y `status` dicen que espera a la persona, así que el agente no se entera hasta agotar su espera. Una sola regla de core, `changeWaitsFor`, dirá a quién espera un cambio, y la usarán todos.

## Fuera de alcance

- La UI (`packages/ui/src/data/views.ts`) y la tarjeta de `specty next`: ya leen los cambios pedidos de la auditoría y los muestran bien.
- Marcar «Nadie retoma tu decisión» tras rechazar supuestos en la terminal: `assumption.decided` no está entre las decisiones que mira `server/unattended.ts`.
- El análisis del shell del guard (`packages/core/src/guard/`), `enforce/guard.ts`, `enforce/agent-stop.ts` y la instalación de los agentes, que llevan otros cambios abiertos.

## Supuestos

- A1: El hecho va en `state.json`, en un campo nuevo y opcional, `changesRequestedAt` (la fecha ISO 8601 en que la persona devolvió la revisión), y no se deduce de la auditoría. El guard lo lee en cada llamada a una herramienta y `specty wait` en cada vuelta, y hoy los dos leen solo `state.json`. `review.changes_requested` sigue en la auditoría como registro.
  - impacto: alto
- A2: Devuelven el turno al agente las dos formas que tiene la persona de mandar la revisión de vuelta: pedir cambios (`requestChanges` de `flow/review.ts`, desde la UI) y aprobar con supuestos rechazados (`specty approve` en su terminal, o la aprobación desde la UI, que pasa por el mismo código). Rechazar un supuesto suelto en la UI (`decideAssumption`) o comentar no lo devuelve, porque la persona puede seguir revisando antes de pedir los cambios.
  - impacto: alto
- A3: Cualquier propuesta nueva (`specty propose`) borra `changesRequestedAt`, aunque la spec no cambie y la revisión no suba, y el turno vuelve a la persona. Aprobar también lo borra, para que no siga en las fases siguientes.
  - impacto: medio
- A4: `changeWaitsFor`, en un archivo nuevo, `packages/core/src/flow/waiting.ts`, da a quién espera el cambio. Espera a la persona si hay solicitudes de alcance pendientes y al agente en `review` con `changesRequestedAt`. Si no, da lo que dice `phasePermissions` con el envío (`testsSubmittedAt` o `closingSubmittedAt`) y la incorporación pendiente. No va en `flow/phases.ts` porque ese archivo lo exporta `light.ts`, que no debe cargar zod, y `isIntegrating` vive en `schema/state.ts`.
  - impacto: medio
- A5: `isWaitingForHuman` de `commands/wait.ts` queda como envoltorio de `changeWaitsFor`, así que el fin de turno y el guard, que ya la usan, no cambian. `status` usa `changeWaitsFor` en lugar de su `waitingForOf`. `server/unattended.ts` lee el `waitingFor` que calcula `status` y deja su caso especial de `review.changes_requested`.
  - impacto: medio
- A6: Un cambio con cambios pedidos antes de esta versión no tiene el campo: sigue esperando a la persona hasta su próxima propuesta, y la UI deja de marcarlo como «Nadie retoma tu decisión».
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO la persona pide cambios en la revisión ENTONCES `state.json` lleva `changesRequestedAt`, `specty wait` devuelve enseguida la tarjeta de `next` con los cambios pedidos, `specty status` dice que el cambio espera al agente (`waitingFor: "agent"` con `--json`), el guard deja pasar `sleep` y el fin de turno no le pide al agente que espere.
- AC2: CUANDO la persona aprueba en su terminal y rechaza un supuesto ENTONCES `state.json` lleva `changesRequestedAt` y el cambio espera al agente como en AC1, con los supuestos rechazados en la tarjeta de `next`.
- AC3: CUANDO, tras los cambios pedidos, el agente propone una revisión nueva ENTONCES `state.json` ya no lleva `changesRequestedAt` y el cambio vuelve a esperar a la persona: `status` lo dice, el guard frena `sleep` y el fin de turno pide `specty wait`. CUANDO, en cambio, la persona aprueba ENTONCES tampoco lo lleva.
- AC4: CUANDO la persona solo comenta o rechaza un supuesto suelto desde la UI, sin pedir los cambios, ENTONCES el cambio sigue esperando a la persona y `state.json` no lleva `changesRequestedAt`.
- AC5: CUANDO `changeWaitsFor` recibe el estado de un cambio ENTONCES da `human` con solicitudes de alcance pendientes, `agent` en `review` con `changesRequestedAt`, `human` en `review` sin él, y en las demás fases lo mismo que `phasePermissions` con el envío y la incorporación pendiente.

## Diseño

- Core: `ChangeStateSchema` gana `changesRequestedAt: Timestamp.optional()`. `flow/waiting.ts` exporta `changeWaitsFor(state)`, que `index.ts` publica (no `light.ts`).
- CLI, quién escribe el campo: `requestChanges` lo pone con la hora de la sesión. La rama de `approveSpec` con supuestos rechazados también. `propose` (`recordProposal`) y `approvalState` lo quitan del estado nuevo.
- CLI, quién lo lee: `isWaitingForHuman` (`wait`, fin de turno, guard), `openChanges` y `lostEntries` de `status` y, a través del `waitingFor` de `status`, `unattendedById`.
- `server-unattended.test.ts` sigue comprobando que pedir cambios desde la UI deja la marca `unattended`, ahora por la regla común.

## Archivos

- crear packages/core/src/flow/waiting.ts — `changeWaitsFor`, la regla de a quién espera un cambio
- modificar packages/core/src/schema/state.ts — el campo `changesRequestedAt`
- modificar packages/core/src/index.ts — exporta `changeWaitsFor`
- crear packages/core/test/flow/waiting.test.ts — tests de `changeWaitsFor`
- modificar packages/cli/src/flow/review.ts — pedir cambios anota `changesRequestedAt`
- modificar packages/cli/src/commands/approve.ts — rechazar supuestos lo anota; aprobar lo quita
- modificar packages/cli/src/commands/propose.ts — proponer lo quita
- modificar packages/cli/src/commands/wait.ts — `isWaitingForHuman` usa `changeWaitsFor`
- modificar packages/cli/src/commands/status.ts — `waitingFor` sale de `changeWaitsFor`
- modificar packages/cli/src/server/unattended.ts — sin el caso especial de `review.changes_requested`
- crear packages/cli/test/changes-requested-state.test.ts — tests de quién anota y quita `changesRequestedAt`
- crear packages/cli/test/changes-requested-turn.test.ts — tests de `wait`, `status`, el guard y el fin de turno tras pedir cambios
- modificar docs/formats.md — el campo `changesRequestedAt` de `state.json`
- modificar docs/ARCHITECTURE.md — quién espera en `review` tras pedir cambios, y la regla común

## Tareas

- [x] T1: La regla común de a quién espera un cambio, en core
  - files: packages/core/src/flow/waiting.ts, packages/core/src/schema/state.ts, packages/core/src/index.ts, packages/core/test/flow/waiting.test.ts
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/flow/waiting.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint && pnpm sources
  - type: fix
- [ ] T2: Pedir cambios y rechazar supuestos anotan `changesRequestedAt`; proponer y aprobar lo quitan
  - files: packages/cli/src/flow/review.ts, packages/cli/src/commands/approve.ts, packages/cli/src/commands/propose.ts, packages/cli/test/changes-requested-state.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/changes-requested-state.test.ts test/comments.test.ts test/server-actions.test.ts test/flow.test.ts && pnpm lint
  - type: fix
- [ ] T3: `wait`, `status` y la marca de la UI leen la regla común
  - files: packages/cli/src/commands/wait.ts, packages/cli/src/commands/status.ts, packages/cli/src/server/unattended.ts, packages/cli/test/changes-requested-turn.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/changes-requested-turn.test.ts test/server-unattended.test.ts test/wait.test.ts test/wait-guard.test.ts test/agent-stop-wait.test.ts test/status-json.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: fix
- [ ] T4: La documentación cuenta quién espera tras pedir cambios
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3
  - verify: pnpm lint && pnpm sources
  - type: docs

## Riesgos

- R1: Otro código copia `{ ...state }` al cambiar de fase y arrastra el campo. Mitigación: la regla solo lo mira en `review`, y solo `propose` lleva un cambio a `review`, y lo borra.
- R2: P219 y P221 tocan ARCHITECTURE en los párrafos del guard y del fin de turno. Mitigación: la documentación va en §4 y §15, sin tocar esos párrafos; si chocan al incorporar main, se resuelve con `specty integrate`.
