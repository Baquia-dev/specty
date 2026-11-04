---
kind: standard
---

# La verificación completa de la UI espera su turno

## Objetivo

La verificación completa que la persona lanza desde `specty ui` (`runFull` en `packages/cli/src/server/runs.ts`) corre sin tomar el turno de `locks/full-verification.json`, así que puede ir a la vez que el `accept` o el cierre de otra sesión y quitarles la máquina. Con este cambio espera su turno como las demás, y la UI muestra en su salida a quién espera.

## Fuera de alcance

- Cancelar desde la UI una verificación que espera su turno: se para como hoy, al cerrar el servidor.
- Cambiar cómo esperan `accept`, `close` o `integrate`.

## Supuestos

- A1: La verificación de la UI toma el turno con `oneAtATime`, con su comando y la carpeta del cambio, y lo suelta al terminar, también si falla o el servidor la para.
  - impacto: alto
- A2: El aviso de espera de `oneAtATime` va a la salida de la verificación que ve la UI, en vez de a la salida de error del servidor.
- A3: Dos verificaciones completas lanzadas desde el mismo servidor van una tras otra: el turno es del proceso, así que el servidor las encadena él mismo.

## Criterios de aceptación

- AC1: CUANDO otra sesión tiene el turno de la verificación completa y la persona lanza la verificación completa de un cambio desde la UI ENTONCES su salida dice quién la tiene, el comando no empieza hasta que la otra termina, y después corre y queda en la auditoría.
- AC2: CUANDO la verificación completa de la UI termina ENTONCES el turno queda libre.

## Diseño

- `server/runs.ts`:
  - `changeRuns` guarda una cola (`turns`, una promesa) para que sus verificaciones completas vayan una tras otra.
  - `runFull` publica enseguida la ejecución (sin salida) y, en la cola, llama a `oneAtATime(waiting, command, …)`, donde `waiting` es la sesión del cambio con `io.err` hacia la salida de la ejecución. Dentro, si el servidor no está cerrando, lee el árbol de código, anota el inicio, lanza el comando y espera a que termine; `ended` corre como hoy.
- La espera no cuenta en `started`: la auditoría mide la verificación, como en la incorporación.

## Archivos

- modificar packages/cli/src/server/runs.ts — la verificación completa de la UI, por turno
- crear packages/cli/test/server/runs-turn.test.ts — esperar a otra sesión y soltar el turno
- modificar docs/ARCHITECTURE.md — la verificación de la UI también toma el turno

## Tareas

- [x] T1: La verificación completa de la UI toma el turno
  - files: packages/cli/src/server/runs.ts, packages/cli/test/server/runs-turn.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server/runs-turn.test.ts test/server/runs.test.ts test/server/verify.test.ts && pnpm typecheck && pnpm lint
- [x] T2: La documentación
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: Una verificación de la UI espera mucho a otra sesión — como mucho `verify.timeoutSec`, y la UI muestra a quién espera.

## Cierre

### Resumen

La verificación completa que la persona lanza desde `specty ui` toma el turno de `locks/full-verification.json` como las de `accept` y del cierre. La UI la muestra enseguida; mientras otra sesión tiene el turno, el aviso de a quién espera (comando, carpeta y desde cuándo) va a su salida, y el comando empieza cuando el turno queda libre. La auditoría mide desde que empieza el comando, y el turno se suelta al terminar. El servidor encola sus propias verificaciones completas, porque el turno es del proceso.

### Desviaciones

Ninguna.

### Decisiones

- `runFull` publica la ejecución sin salida y la corre en `inTurn`, la cola del servidor, con `oneAtATime`; el comando y su espera de fin van en `spawned`, y la lectura de su salida en `streamed`, para que ninguna función crezca.
- El aviso de espera de `oneAtATime` va a la salida de la ejecución con una sesión cuyo `io.err` escribe en ella, en vez de a la salida de error del servidor, que la persona no ve.
- Si el servidor se cierra mientras espera, el comando no llega a lanzarse.

### Pendientes

Ninguno.
