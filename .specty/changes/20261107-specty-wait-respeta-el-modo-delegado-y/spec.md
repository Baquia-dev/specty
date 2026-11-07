---
kind: standard
---

# specty wait respeta el modo delegado y despierta con la caché viva

## Objetivo

Con el modo delegado activo, `specty wait` hoy espera hasta una hora a una persona que no va a decidir, porque solo mira la fase, y al agotarse pide recordárselo y volver a esperar: un bucle. Con este cambio, en modo delegado `wait` vuelve enseguida con la tarjeta que le dice al agente que decida él, y solo espera las decisiones que siguen siendo de la persona (desbloquear un test aprobado); también despierta si la persona activa el modo mientras espera. El encargo de los subagentes dice lo mismo, y `wait` pasa a esperar 55 min por defecto, para que cada despertar caiga dentro de la caché de prompts de una hora y no pague reescribir todo el contexto.

## Fuera de alcance

- El intervalo de sondeo de 500 ms de `wait`: lo trata otro cambio de la épica «flujo configurable».
- El fin de turno del agente y el freno del guard a `sleep`: ya tienen su rama delegada (la tarjeta de `next` y `waitCommandDenial`).
- La tarjeta de la tarea de `next` con solicitudes de alcance pendientes en modo delegado.
- El máximo de `internal.waits.waitTimeoutSec` (3600 s) y el `timeout: 3660000` de OpenCode 1.

## Supuestos

- A1: De lo que un cambio puede esperar de la persona, la única decisión que el modo delegado no cubre es desbloquear un test aprobado, es decir, una solicitud de alcance con alguna ruta en `lockedTests` (ADR 0014); `delegate` y `uninstall`, los PERSON_ONLY del guard, no son decisiones que un cambio espere, así que `wait` no los mira; con varias solicitudes pendientes, basta una que el agente pueda decidir para que `wait` no espere.
  - impacto: alto
- A2: En modo delegado, para una solicitud de alcance que el agente decide, `wait` devuelve la tarjeta de la solicitud en modo delegado (`scopeRequestedCard`, la misma que da `scope add`) y no la de `next`, porque la de la tarea solo la lista y no le dice que la apruebe él; en las demás decisiones devuelve la de `next`, que ya lo dice.
  - impacto: medio
- A3: `wait` relee el modo delegado en cada vuelta con `readDelegation`, la lectura de un archivo pequeño; si la persona lo activa y la decisión pasa a ser del agente, termina su marca como `decided`, sin una razón nueva, así que formats.md §1 no cambia; la tarjeta y la de tiempo agotado siguen el modo de ese momento, y la terminal de la sesión no cambia porque ni `next` ni las tarjetas le preguntan nada.
  - impacto: medio
- A4: `isWaitingForHuman` conserva su significado sin el modo delegado para el fin de turno y el freno del guard, y solo `wait` le pasa el modo.
  - impacto: bajo
- A5: La caché de prompts de Claude Code dura una hora desde su último uso, y 55 min (3300 s) deja cinco minutos de margen; el máximo sigue en 3600 s, que la persona puede elegir sabiendo que el despertar caería con la caché caducada.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO el modo delegado está activo y el cambio espera una decisión que el agente toma por la persona (aprobar la spec, aprobar los tests enviados, aceptar, cerrar con el cierre enviado, o una solicitud de alcance que no desbloquea un test aprobado) ENTONCES `specty wait` vuelve enseguida, sin dejar su marca, con la tarjeta que le dice al agente que decida él: la de `next` o, para la solicitud, la de la solicitud en modo delegado («modo delegado: aprueba tú la solicitud…»).
- AC2: CUANDO el modo delegado está activo y lo único que espera a la persona son solicitudes que desbloquean un test aprobado ENTONCES `specty wait` espera como hoy; sin el modo delegado, espera como hoy cualquier decisión de la persona.
- AC3: CUANDO `specty wait` espera y la persona activa el modo delegado con una decisión que el agente toma ENTONCES en la vuelta siguiente termina su marca como `decided` y devuelve la tarjeta de `next` en modo delegado, sin cambiar el estado del cambio.
- AC4: CUANDO `specty wait` se agota en modo delegado ENTONCES su tarjeta dice que la decisión pendiente es solo de la persona, también en modo delegado, y pide recordársela y volver a ejecutar `specty wait` en la forma de su herramienta, en español y en inglés; sin el modo delegado, la tarjeta sigue igual.
- AC5: CUANDO una tarjeta da el encargo de un subagente (un cambio pedido, un corte de una épica o un huérfano que retomar) con el modo delegado activo ENTONCES su paso de seguir `next` dice que, cuando su `SIGUIENTE:` diga «modo delegado», lo haga él, y que use `specty wait` solo cuando espere a la persona en una decisión que no le delega, en español y en inglés; sin el modo delegado, el paso sigue igual.
- AC6: CUANDO `specty wait` corre sin `--timeout` y sin `internal.waits.waitTimeoutSec` ENTONCES espera 3300 s (55 min) y su marca lo dice, `DEFAULT_CONFIG` y la página «Configuración» dan 3300 s por defecto, y la clave sigue admitiendo de 60 a 3600 s.

## Diseño

- Core, `flow/waiting.ts`: `unlocksApprovedTest(request, state)` dice si una solicitud toca un test de `lockedTests`. `waitsForPerson(state, delegated)` es `changeWaitsFor(state) === "human"` sin el modo; con él, solo si hay solicitudes pendientes y todas desbloquean un test aprobado. Los dos se exportan en `index.ts`.
- CLI, `commands/wait.ts`: `isWaitingForHuman(change, delegated = false)` usa `waitsForPerson`. `wait` le pasa `session.delegated` al empezar y, en cada vuelta, la sesión con el modo que lee `readDelegation` (`delegated` y `cards.delegated`), que usan `decided`, la tarjeta de tiempo agotado y la de la decisión. La respuesta sin espera y tras decidir es la de `next` o, en modo delegado con una solicitud que el agente decide, `scopeRequestedCard` de la primera de ellas. El comentario del tiempo por defecto dice 55 min.
- Core, `cards/wait.ts`: `waitTimeoutCard` con `ctx.delegated` cambia su `SIGUIENTE:`: la decisión pendiente es solo de la persona, también en modo delegado; recuérdasela y vuelve a ejecutar ya `specty wait` (`waitWith`).
- Core, `cards/subagents.ts`: `inItsFolder` con `ctx.delegated` dice «Cuando su `SIGUIENTE:` diga «modo delegado: …», hazlo tú; cuando espere a la persona en una decisión que no te delega (como desbloquear un test aprobado), » y `waitStep`.
- Core, `schema/internal-waits.ts`: `waitTimeoutSec` 3300 por defecto, con el motivo en su comentario; el máximo sigue en 3600. `agent-commands.ts` dice «55 min by default» en la ayuda de `--timeout`.

## Archivos

- modificar packages/core/src/flow/waiting.ts — `waitsForPerson` y `unlocksApprovedTest`: qué espera a la persona con el modo delegado
- modificar packages/core/src/index.ts — exporta `waitsForPerson` y `unlocksApprovedTest`
- modificar packages/cli/src/commands/wait.ts — el modo delegado al empezar y en cada vuelta, la tarjeta de la solicitud que decide el agente y el comentario de los 55 min
- modificar packages/core/src/cards/wait.ts — `waitTimeoutCard` con rama delegada
- crear packages/cli/test/wait-delegated.test.ts — `wait` en modo delegado: vuelve enseguida, espera lo que es solo de la persona, despierta al activarse y se agota con su rama
- modificar packages/core/test/flow/waiting.test.ts — `waitsForPerson` y `unlocksApprovedTest`
- modificar packages/core/test/cards/wait.test.ts — la tarjeta de tiempo agotado en modo delegado, en español y en inglés
- modificar docs/ARCHITECTURE.md — §6: `wait` en modo delegado y los 55 min por defecto
- modificar packages/core/src/cards/subagents.ts — el paso de `next` del encargo según el modo delegado
- modificar packages/core/test/cards/idle-subagents.test.ts — el encargo en modo delegado, en español y en inglés
- modificar packages/core/src/schema/internal-waits.ts — `waitTimeoutSec` 3300 por defecto y su motivo
- modificar packages/cli/src/commands/agent-commands.ts — la ayuda de `--timeout` dice 55 min
- modificar packages/core/test/schema/schema.test.ts — el valor por defecto de `waitTimeoutSec`
- modificar packages/cli/test/wait.test.ts — `wait` sin `--timeout` espera 3300 s
- modificar packages/ui/src/settings/settings-page.test.ts — «Por defecto: 3300 s» en la página «Configuración»
- modificar docs/formats.md — §6: `internal.waits.waitTimeoutSec` 3300 por defecto y por qué

## Tareas

- [x] T1: `specty wait` respeta el modo delegado
  - files: packages/core/src/flow/waiting.ts, packages/core/src/index.ts, packages/cli/src/commands/wait.ts, packages/core/src/cards/wait.ts, packages/cli/test/wait-delegated.test.ts, packages/core/test/flow/waiting.test.ts, packages/core/test/cards/wait.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/flow/waiting.test.ts test/cards/wait.test.ts && pnpm --filter @baquia-dev/specty exec vitest run test/wait-delegated.test.ts test/wait-folder.test.ts test/wait-guard.test.ts && pnpm lint
  - type: fix
- [x] T2: El encargo de los subagentes decide en modo delegado
  - files: packages/core/src/cards/subagents.ts, packages/core/test/cards/idle-subagents.test.ts
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/idle-subagents.test.ts test/cards/epic.test.ts test/cards/orphans-subagents.test.ts && pnpm lint
  - type: fix
- [ ] T3: `specty wait` espera 55 min por defecto
  - files: packages/core/src/schema/internal-waits.ts, packages/cli/src/commands/agent-commands.ts, packages/core/test/schema/schema.test.ts, packages/cli/test/wait.test.ts, packages/ui/src/settings/settings-page.test.ts, docs/formats.md
  - ac: AC6
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/schema/schema.test.ts && pnpm --filter @baquia-dev/specty exec vitest run test/wait.test.ts && pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/settings/settings-page.test.ts && pnpm typecheck && pnpm lint
  - type: fix

## Riesgos

- R1: Otra sesión cambia en paralelo los ajustes internos (los intervalos de sondeo) y puede tocar `wait.ts` e `internal-waits.ts`. Mitigación: al aceptar, incorporar main y resolver los conflictos conservando lo de ambos (`specty integrate`).
- R2: `wait` lee el modo delegado en cada vuelta, una lectura más cada 500 ms. Mitigación: es un archivo pequeño de la carpeta común, y la ruta de git se resuelve una vez.
