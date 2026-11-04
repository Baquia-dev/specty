---
kind: standard
---

# La verificación completa espera su turno en cola y nunca corre sin él

## Objetivo

Hoy `oneAtATime` (`flow/full-verification.ts`) espera el turno de la verificación completa mirando cada dos segundos, y si pasa `verify.timeoutSec` esperando, corre igualmente sin turno. Con varias sesiones en paralelo, la cola supera esos 600 s, arrancan dos o tres verificaciones completas a la vez, la máquina se satura (carga 40 en 14 núcleos) y las verificaciones se cortan por tiempo: cuatro en un día. Además, quien mira primero tras soltarse el turno se lo lleva, aunque llegara el último, y `accept` anota en la auditoría como tiempo de la verificación también la espera. Con este cambio, quien espera hace cola por orden de llegada, dice cuántos tiene delante, nunca corre sin turno, y el tiempo que anota `accept` empieza con su turno.

## Fuera de alcance

- Un límite de procesos de CPU para todas las verificaciones pesadas, también las de tarea (punto 5 del plan, en otro cambio).
- Cambiar qué verificación se ejecuta en cada punto o reutilizar resultados (puntos 3 y 6 del plan).
- La cola interna del servidor de `specty ui` (`target.inTurn`), que ya ejecuta sus verificaciones completas una tras otra.

## Supuestos

- A1: Esperar sin límite mientras el titular del turno siga vivo es seguro: ninguna pregunta a la persona ocurre con el turno tomado (`accept` y `close` preguntan antes o después de `landingTurn` y de la verificación), y el comando del titular ya se corta a los `verify.timeoutSec`; un titular muerto deja de contar como hoy.
  - impacto: alto
- A2: La cola son archivos en `.git/common/specty/locks/full-verification.queue/`, uno por proceso que espera, con su nombre ordenado por la hora de llegada en milisegundos y el pid; quien espera renueva la fecha de su archivo en cada vuelta, y un archivo cuyo proceso ya no existe o que lleva 30 s sin renovarse no cuenta y se borra.
  - impacto: alto
- A3: Solo el primero de la cola puede tomar el turno; quien llega con el turno libre y la cola vacía lo toma enseguida, como hoy.
- A4: Un proceso que ya tiene el turno (la verificación de la incorporación dentro del turno del cierre) no hace cola: corre enseguida, como hoy.
  - impacto: alto
- A5: El aviso de espera sigue saliendo una sola vez, y añade cuántas sesiones esperan delante cuando hay alguna.

## Criterios de aceptación

- AC1: CUANDO otra sesión viva tiene el turno más de `verify.timeoutSec` ENTONCES la verificación completa sigue esperando y solo corre cuando el turno queda libre.
- AC2: CUANDO otra sesión viva llegó antes a la cola ENTONCES, al quedar libre el turno, la verificación completa espera a que esa sesión deje la cola, y su aviso de espera dice cuántas esperan delante.
- AC3: CUANDO el aviso de espera de la verificación completa tiene sesiones delante ENTONCES dice cuántas, en español y en inglés; sin ninguna, queda como hoy.
- AC4: CUANDO `accept` espera el turno de otra sesión antes de su verificación completa ENTONCES el tiempo que anota `change.verified` cuenta solo desde que tiene el turno.

## Diseño

- `store/turn-queue.ts` (nuevo): `joinTurnQueue(git, holder)` crea en exclusiva `full-verification.queue/<ms con 15 dígitos>-<pid>.json` y devuelve `{ ahead(), leave() }`. `ahead()` renueva la fecha del propio archivo, borra los de procesos que no existen o que llevan 30 s sin renovarse y cuenta los que van antes del propio; `leave()` lo borra.
- `store/lock.ts`: `holdsFullVerification(git)` dice si este proceso ya tiene el turno (`held`).
- `flow/full-verification.ts`: `oneAtATime` corre enseguida si el proceso ya tiene el turno; si no, entra en la cola, intenta el turno solo cuando no tiene a nadie delante, deja la cola al tomarlo (y siempre al terminar) y nunca corre sin él. El aviso sale una vez, con los que tiene delante.
- `core/cards/lock.ts`: `fullVerificationWaitNote(holder, lang, ahead = 0)` añade «Delante en la cola: N.» / «Ahead in the queue: N.» cuando N > 0.
- `flow/live-run.ts`: `runLive` acepta `onStart`, que llama justo antes de lanzar el comando; `commands/accept.ts` toma de ahí el inicio de `change.verified`.

## Archivos

- crear packages/cli/src/store/turn-queue.ts — la cola de la verificación completa
- modificar packages/cli/src/store/lock.ts — saber si este proceso ya tiene el turno
- modificar packages/cli/src/flow/full-verification.ts — esperar en cola, sin correr nunca sin turno
- modificar packages/cli/src/flow/full-verification.test.ts — AC1 y AC2
- modificar packages/core/src/cards/lock.ts — el aviso dice cuántos esperan delante
- modificar packages/core/test/cards/lock.test.ts — AC3
- modificar packages/cli/src/flow/live-run.ts — avisar cuando el comando arranca
- modificar packages/cli/src/commands/accept.ts — el tiempo de la verificación completa empieza con su turno
- crear packages/cli/test/accept-turn-time.test.ts — AC4
- modificar docs/ARCHITECTURE.md — la cola del turno
- modificar docs/formats.md — la carpeta de la cola

## Tareas

- [x] T1: El aviso de espera del turno dice cuántas sesiones esperan delante
  - files: packages/core/src/cards/lock.ts, packages/core/test/cards/lock.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/lock.test.ts && pnpm lint
  - type: fix
- [ ] T2: La verificación completa espera en cola por orden de llegada y nunca corre sin turno
  - files: packages/cli/src/store/turn-queue.ts, packages/cli/src/store/lock.ts, packages/cli/src/flow/full-verification.ts, packages/cli/src/flow/full-verification.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run src/flow/full-verification.test.ts test/close-turn.test.ts test/server/runs-turn.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: fix
- [ ] T3: El tiempo de la verificación completa de accept empieza con su turno
  - files: packages/cli/src/flow/live-run.ts, packages/cli/src/commands/accept.ts, packages/cli/test/accept-turn-time.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/accept-turn-time.test.ts test/accept-live.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: fix
- [ ] T4: La documentación de la cola del turno
  - files: docs/ARCHITECTURE.md, docs/formats.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: Una sesión cuyo titular se queda colgado sin morir (un portátil suspendido) hace esperar a las demás más que hoy — el comando del titular se corta a los `verify.timeoutSec` y el aviso dice quién es, su pid y su carpeta, para que la persona lo pare.
- R2: Un proceso que deja su archivo en la cola y muere no bloquea a nadie — su pid deja de existir o su archivo deja de renovarse, y el siguiente que mira lo borra.
