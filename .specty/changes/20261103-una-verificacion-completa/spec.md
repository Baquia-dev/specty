---
kind: standard
---

# Solo una verificación completa a la vez entre sesiones

## Objetivo

Con varias sesiones trabajando en el mismo clon, dos `specty accept` o dos incorporaciones de main pueden lanzar a la vez la verificación completa (`pnpm check` en este repositorio). Se pisan la máquina, tardan el doble y a veces fallan por tiempo, como el test intermitente de la extensión de VS Code (P10). Con este cambio, Specty ejecuta una sola verificación completa a la vez en todo el clon: la segunda avisa de quién está verificando y espera a que termine. Resuelve la entrada P29 de la memoria.

## Fuera de alcance

- La verificación completa que arranca la persona desde `specty ui`: corre en segundo plano, y esperar allí va en otro cambio.
- Las verificaciones de cada tarea (`task done`) y los comandos que un agente lanza por su cuenta, como `pnpm check` en su shell.

## Supuestos

- A1: El turno es un archivo común a todas las worktrees, `locks/full-verification.json`, con la misma forma y las mismas reglas que el bloqueo de un cambio: se crea en exclusiva, se borra al terminar, y el de un proceso que ya no existe no cuenta.
  - impacto: alto
- A2: Quien encuentra el turno ocupado avisa una vez por la salida de error, con el comando, la carpeta y desde cuándo, y vuelve a mirar cada dos segundos. Si espera más de `verify.timeoutSec`, verifica igualmente, porque el otro debería haber terminado.
  - impacto: alto
- A3: Toman el turno la verificación completa de `accept` (la de `runLive` sin tarea) y la de la incorporación de main (`integrate`, `close`). Lo sueltan al terminar, también si falla.

## Criterios de aceptación

- AC1: CUANDO otra sesión está haciendo una verificación completa en el clon ENTONCES la nueva avisa de quién la hace, en qué carpeta y desde cuándo, y espera a que termine antes de empezar.
- AC2: CUANDO nadie está verificando, o quien tenía el turno ya no existe ENTONCES la verificación empieza enseguida, y al terminar, bien o mal, suelta el turno.

## Diseño

- CLI:
  - `store/lock.ts`: `lockFullVerification(git, holder)`, con la misma lógica que `lockChange` sobre `locks/full-verification.json`.
  - `flow/full-verification.ts`, nuevo: `oneAtATime(session, command, run, options?)` toma el turno, espera si hace falta y lo suelta en un `finally`.
  - `flow/live-run.ts` (sin tarea) y `flow/integrate.ts` ejecutan su verificación completa dentro de `oneAtATime`.
- Core: `fullVerificationWaitNote(holder, lang)` en `cards/lock.ts`.

## Archivos

- modificar packages/cli/src/store/lock.ts — el turno de la verificación completa
- crear packages/cli/src/flow/full-verification.ts — esperar el turno, verificar y soltarlo
- modificar packages/cli/src/flow/live-run.ts — la verificación completa de `accept`, por turno
- modificar packages/cli/src/flow/integrate.ts — la de la incorporación de main, por turno
- modificar packages/core/src/cards/lock.ts — el aviso de espera
- modificar packages/core/src/cards/index.ts — exporta el aviso
- crear packages/cli/src/flow/full-verification.test.ts — esperar a otra sesión viva, no a una muerta, y soltar el turno
- crear packages/core/test/cards/full-verification.test.ts — el aviso en español y en inglés
- modificar docs/formats.md — `locks/full-verification.json`
- modificar docs/ARCHITECTURE.md — una verificación completa a la vez

## Tareas

- [ ] T1: El aviso de espera
  - files: packages/core/src/cards/lock.ts, packages/core/src/cards/index.ts, packages/core/test/cards/full-verification.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/full-verification.test.ts && pnpm lint
- [ ] T2: El turno de la verificación completa
  - files: packages/cli/src/store/lock.ts, packages/cli/src/flow/full-verification.ts, packages/cli/src/flow/full-verification.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run src/flow/full-verification.test.ts test/lock.test.ts && pnpm typecheck && pnpm lint
- [ ] T3: `accept` y la incorporación de main verifican por turno, y la documentación
  - files: packages/cli/src/flow/live-run.ts, packages/cli/src/flow/integrate.ts, packages/cli/src/flow/full-verification.test.ts, docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run src/flow/full-verification.test.ts test/lock.test.ts test/accept-live.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: Una sesión espera mucho a otra que tarda — como mucho `verify.timeoutSec`, y avisa de quién la hace esperar.
- R2: Un proceso muere con el turno — el de un proceso que ya no existe no cuenta, como en el bloqueo de un cambio.
