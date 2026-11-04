---
kind: standard
---

# El cierre toma el turno antes de incorporar main

## Objetivo

Hoy `close` incorpora main a la rama del cambio y solo después pide el turno de la verificación completa. Si otra sesión lo tiene, espera; mientras tanto esa sesión integra su cambio en main, y el avance rápido del cierre falla («main no avanzó»), así que hay que repetir `close`. Con este cambio, el cierre toma el turno antes de incorporar main y lo suelta cuando main ya avanzó: dos cierres a la vez quedan uno tras otro y el segundo incorpora lo que integró el primero.

## Fuera de alcance

- La verificación completa de `accept` sin carril rápido, que no integra nada en main: sigue tomando el turno solo mientras verifica.
- `specty integrate`, que confirma la incorporación tras resolver conflictos y no integra el cambio en main.
- La verificación completa lanzada desde la UI (`runFull`, P36 de la memoria).
- Repetir solo el avance rápido cuando main se mueve sin pasar por el turno (una sesión con un Specty anterior o un commit a mano): sigue el SIGUIENTE de hoy, volver a ejecutar `close`.

## Supuestos

- A1: El turno ya es reentrante dentro de un proceso (`held` en `store/lock.ts`): la verificación de la incorporación, que corre dentro del turno del cierre, no lo pide dos veces ni lo suelta antes de tiempo.
  - impacto: alto
- A2: Toman el turno de principio a fin las tres maneras de integrar un cambio en main: `close` tras la confirmación, el reintento de `close` para un cambio cerrado que no llegó a main, y el `accept` que cierra un cambio del carril rápido. Lo toman solo si Specty integra el cambio (`integrationOf`) y hay verificación completa (`verify.full` o `verify.default`); sin verificación, nada que esperar.
  - impacto: alto
- A3: El turno se toma tras la confirmación de la persona, así que la espera no la hace contestar dos veces, y se suelta al terminar, también si la incorporación se rechaza.

## Criterios de aceptación

- AC1: CUANDO otra sesión tiene el turno de la verificación completa al confirmar `close`, e integra un cambio en main antes de soltarlo, ENTONCES el cierre espera el turno antes de incorporar main, incorpora también ese cambio y main avanza hasta el cambio cerrado.
- AC2: CUANDO el cierre termina, con main avanzado o con la incorporación rechazada ENTONCES el turno de la verificación completa queda libre.

## Diseño

- `flow/full-verification.ts`: `landingTurn(session, plan, run)` ejecuta `run`, la incorporación de main y la integración en main, dentro de `oneAtATime` con el comando de la verificación completa. Con `plan` indefinido o sin comando, lo ejecuta enseguida.
- `commands/finish.ts`: `closeConfirmed` calcula `integrationOf` y ejecuta el resto (incorporar, archivar, integrar) en `landingTurn`; `landClosed`, tras la confirmación, incorpora e integra en `landingTurn`.
- `commands/accept.ts`: `closeQuick` hace lo mismo que `closeConfirmed`.
- La verificación de la incorporación (`failedVerification` en `flow/integrate.ts`) no cambia: dentro del turno del cierre, `lockFullVerification` le da el turno sin esperar y su `release` no lo suelta.

## Archivos

- modificar packages/cli/src/flow/full-verification.ts — `landingTurn`, el turno de quien integra un cambio en main
- modificar packages/cli/src/commands/finish.ts — `close` y su reintento incorporan e integran en el turno
- modificar packages/cli/src/commands/accept.ts — el cierre del carril rápido, en el turno
- crear packages/cli/test/close-turn.test.ts — dos cierres a la vez y el turno libre al terminar
- modificar docs/ARCHITECTURE.md — el cierre toma el turno antes de incorporar main
- modificar docs/formats.md — quién toma `locks/full-verification.json`

## Tareas

- [ ] T1: El cierre toma el turno antes de incorporar main y lo suelta cuando main avanzó
  - files: packages/cli/src/flow/full-verification.ts, packages/cli/src/commands/finish.ts, packages/cli/src/commands/accept.ts, packages/cli/test/close-turn.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/close-turn.test.ts test/integrate.test.ts src/flow/full-verification.test.ts && pnpm typecheck && pnpm lint
  - type: fix
- [ ] T2: La documentación del turno del cierre
  - files: docs/ARCHITECTURE.md, docs/formats.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: Un cierre espera ahora a una verificación larga de otra sesión aunque su rama ya contenga main — como mucho `verify.timeoutSec`, y dice quién lo hace esperar; esperar es lo que evita repetir el cierre.
- R2: El cierre sostiene el turno mientras archiva y hace commits, y retrasa a las demás verificaciones — esos pasos duran segundos, frente a los minutos de la verificación.
