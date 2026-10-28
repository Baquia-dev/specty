---
kind: standard
---

# Un solo comando a la vez sobre cada cambio

## Objetivo

Dos comandos que cambian el mismo cambio pueden correr a la vez, desde dos sesiones o desde la terminal y la UI. Cada uno lee el estado al empezar y lo escribe al terminar, así que el segundo pisa lo que hizo el primero. El 2026-10-28, dos `accept` y dos `close` simultáneos chocaron en la cobertura de vitest, y el segundo `accept` borró del estado una incorporación pendiente. Con este cambio, un comando que cambia un cambio lo bloquea mientras corre, y otro que llega a la vez se niega sin tocar nada.

## Fuera de alcance

- Esperar en cola a que el otro comando termine: el segundo se niega y se vuelve a ejecutar.
- Bloquear los comandos que solo leen (`status`, `doctor`, `why`, `check`, `audit`, `export`, `ui`) y el guard.
- Un repositorio compartido entre máquinas: el bloqueo reconoce los procesos de la máquina en la que corre.
- Que dos comandos no puedan crear a la vez cambios distintos (`new`).

## Supuestos

- A1: Toman el bloqueo de su cambio las decisiones de la persona (`approve`, `reject`, `accept`, `close` y `cancel`), desde la terminal o desde la UI, y los comandos del agente que escriben el cambio de su carpeta: `next`, `propose`, `review`, `integrate`, `adjust`, `retro`, `task done` y `scope add`.
  - impacto: alto
- A2: El segundo comando no espera. Se niega enseguida, sin leer ni escribir el cambio, con una tarjeta que dice qué comando lo tiene, desde cuándo y en qué carpeta.
  - impacto: alto
- A3: El bloqueo es un archivo, `.git/common/specty/locks/<id>.json`, compartido por todas las worktrees. Se crea en exclusiva y guarda el pid, el comando, la carpeta y la hora.
- A4: Un bloqueo cuyo proceso ya no existe, porque se cayó o lo mataron, no cuenta: el siguiente comando lo toma.
- A5: Dentro de un mismo proceso, el bloqueo de un cambio se toma una vez, y lo suelta quien lo tomó, al terminar.

## Criterios de aceptación

- AC1: CUANDO un comando que cambia un cambio está en marcha y empieza otro que también lo cambia, desde la misma carpeta, desde otra o desde la UI ENTONCES el segundo se niega con la salida 2, sin tocar el estado ni el registro, y su tarjeta nombra el comando en marcha, desde cuándo y su carpeta.
- AC2: CUANDO el bloqueo de un cambio lo dejó un proceso que ya no existe ENTONCES el siguiente comando lo toma y actúa como siempre.
- AC3: CUANDO un comando que tomó el bloqueo termina, ya sea bien, con una tarjeta de fallo o con una excepción ENTONCES suelta el bloqueo, y el siguiente comando sobre ese cambio corre.
- AC4: CUANDO un cambio está bloqueado ENTONCES `specty status`, `specty check` y los comandos sobre otros cambios siguen funcionando.
- AC5: CUANDO se leen docs/formats.md y docs/ARCHITECTURE.md ENTONCES describen el archivo de bloqueo, qué comandos lo toman y qué pasa con el segundo.
  - test: manual

## Diseño

- `store/lock.ts` toma el bloqueo con `open(…, "wx")` en `git.gitPath("common/specty/locks/<id>.json")`. Si el archivo ya existe y su pid no está vivo (`process.kill(pid, 0)` da `ESRCH`), lo reemplaza. Si el pid está vivo, devuelve quién lo tiene. `release` borra el archivo solo si sigue siendo suyo.
- `withChangeLock(session, command, handler)` en `flow/active.ts` resuelve el cambio de la carpeta. Sin cambio, ejecuta el comando tal cual. Con cambio, lo bloquea, ejecuta el comando y lo suelta en un `finally`. Si otro proceso lo tiene, devuelve la tarjeta del cambio ocupado.
- `agent-commands.ts` envuelve con él los comandos del agente de A1. `decider` (`person-commands.ts`) y `runAction` (`server/actions.ts`) lo usan con la sesión del cambio que eligió `personSession`.
- `cards/lock.ts` en el core trae `busyChangeCard`, en español y en inglés.

## Archivos

- crear packages/cli/src/store/lock.ts — tomar, reconocer y soltar el bloqueo de un cambio
- modificar packages/cli/src/flow/active.ts — `withChangeLock`
- crear packages/core/src/cards/lock.ts — la tarjeta del cambio ocupado
- modificar packages/core/src/cards/index.ts — exportarla
- modificar packages/cli/src/commands/agent-commands.ts — los comandos del agente que escriben, con el bloqueo
- modificar packages/cli/src/commands/person-commands.ts — las decisiones de la persona, con el bloqueo
- modificar packages/cli/src/server/actions.ts — las acciones de la UI, con el bloqueo
- crear packages/cli/test/lock.test.ts — el bloqueo y los comandos de punta a punta
- modificar docs/formats.md — `common/specty/locks/<id>.json`
- modificar docs/ARCHITECTURE.md — §9: un comando a la vez sobre cada cambio

## Tareas

- [x] T1: El bloqueo de un cambio y su tarjeta
  - files: packages/cli/src/store/lock.ts, packages/cli/src/flow/active.ts, packages/core/src/cards/lock.ts, packages/core/src/cards/index.ts, packages/cli/test/lock.test.ts
  - ac: AC2, AC3, AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards && pnpm --filter @baquia-dev/specty exec vitest run test/lock.test.ts
  - type: fix
  - notes: documenta el archivo en docs/formats.md.
- [x] T2: Los comandos que cambian un cambio toman su bloqueo
  - files: packages/cli/src/commands/agent-commands.ts, packages/cli/src/commands/person-commands.ts, packages/cli/src/server/actions.ts, packages/cli/test/lock.test.ts
  - ac: AC1, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/lock.test.ts test/flow.test.ts test/anywhere.test.ts test/server-actions.test.ts
  - type: fix
  - notes: documenta en ARCHITECTURE §9 qué comandos lo toman y qué pasa con el segundo.

## Riesgos

- R1: Un comando que se cuelga deja el cambio bloqueado mientras su proceso viva. Mitigación: la tarjeta da el pid y la carpeta para terminarlo, y en cuanto muere el bloqueo deja de contar.
- R2: Un pid reutilizado por otro proceso hace que un bloqueo viejo parezca vivo. Mitigación: el bloqueo guarda la hora, y la tarjeta la enseña para que se vea que es antiguo.
