---
kind: standard
epic: 20261107-verificacion-sin-repetir
slice: C2
---

# En modo delegado, un cambio rápido se acepta y aterriza en un solo turno

## Objetivo

Cuando el agente acepta un cambio `quick` en modo delegado, hoy la verificación completa suelta el turno al terminar y el cierre lo pide otra vez para aterrizar. Si mientras tanto otra sesión aterriza, el cierre incorpora main y verifica de nuevo (4 de 11 cambios rápidos, 16 min). Con este cambio, ese `accept` tiene el turno de aterrizaje desde antes de incorporar main hasta aterrizar, así que la verificación corre una vez y el cierre no tiene nada que fusionar. Con la persona todo sigue como hoy.

## Fuera de alcance

- Aceptar y cerrar en un paso un cambio normal con su cierre enviado (corte C4), aunque usará el mismo turno.
- Mantener el turno mientras la persona responde, en la terminal o en la UI.
- Cambiar el orden de la cola del turno o cómo se toma (`onTurn`, `joinTurnQueue`).
- Los demás flujos de la épica (cortes C1, C3 y C4).

## Supuestos

- A1: «Modo delegado» es el caso en que el agente ejecuta el comando de la persona, `session.actor === "agent"` tras `humanChange`, como ya distingue `accept` para ejecutar siempre la verificación. La persona en la terminal o en la UI es `actor: "human"`, también con el modo delegado activo.
  - impacto: alto
- A2: En modo delegado, el `accept` de un cambio `quick` corre dentro de `landingTurn` desde `mergeFirst` hasta `closeQuick`. La verificación de la incorporación, la del `accept` y el `landingTurn` de `closeQuick` reciben el mismo turno sin esperar, porque `onTurn` es reentrante para el proceso que lo tiene (`holdsFullVerification`). Así ninguna otra sesión aterriza en medio, y el `absorbTarget` del cierre no encuentra nada que fusionar.
  - impacto: alto
- A3: Dentro del turno no se pregunta a nadie: en modo delegado la terminal delegada responde por la persona sin esperar, así que sigue valiendo la regla de ARCHITECTURE §9 de que ninguna pregunta a la persona ocurre con el turno tomado.
- A4: Sin aterrizaje (`integrationOf` sin rama destino) o sin verificación completa ni `verify.default`, `landingTurn` corre en el acto, como hoy. Con un conflicto o una verificación en rojo, `accept` termina y el turno se suelta, también como hoy.
- A5: Este corte no añade ni cambia textos visibles: quien espera el turno ve el aviso que ya tiene en español y en inglés (`fullVerificationWaitNote`), así que el AC13 de la épica no tiene nada que comprobar aquí.
- A6: `accept.ts` queda por debajo del aviso de tamaño (unas 290 líneas de código de 300), así que no se separa. El turno queda en una función propia, `closingTurn`, para que el corte C4 solo amplíe su condición al cambio normal con el cierre enviado.

## Criterios de aceptación

- AC1: CUANDO en modo delegado el agente acepta un cambio `quick` y otra sesión espera el turno para aterrizar ENTONCES la verificación completa corre una sola vez y con el turno, la otra sesión no aterriza entre esa verificación y el aterrizaje del cambio, y el cierre no vuelve a fusionar main ni a verificar.
- AC2: CUANDO la persona acepta un cambio `quick`, en la terminal o en la UI, también con el modo delegado activo ENTONCES el turno se toma como hoy, solo para la verificación y para el aterrizaje, y no está tomado mientras ella responde.

## Diseño

- `commands/accept.ts`: `accept`, tras `integrationOf`, delega el resto en una función que incorpora main (`mergeFirst`), verifica, pregunta y acepta, y la ejecuta dentro de `closingTurn`. `closingTurn(session, change, plan, run)` llama a `landingTurn(session, plan, run)` cuando el actor es el agente y el cambio es `quick`, y a `run()` en otro caso. `closeQuick` no cambia: su `landingTurn` ya no espera, porque el proceso tiene el turno.
- Tests en `packages/cli/test/accept-quick-turn.test.ts`. La verificación completa es un script que anota cada ejecución en `$(git rev-parse --git-common-dir)/runs`, con si el turno estaba tomado, como `integrate.test.ts`. En AC1, en su primera ejecución, pone en la cola del turno a otra sesión, como en `close-turn.test.ts`: un proceso vivo que, en cuanto nadie tiene el turno, hace un commit en main y termina. En AC2, la terminal de la persona y la de la UI (`accept` con una sesión de `openSession`, como `server-actions.test.ts`) anotan en cada pregunta si el turno está tomado.

## Archivos

- modificar packages/cli/src/commands/accept.ts — en modo delegado, el `accept` de un cambio rápido corre en el turno de aterrizaje de principio a fin (`closingTurn`)
- crear packages/cli/test/accept-quick-turn.test.ts — AC1 y AC2
- modificar docs/ARCHITECTURE.md — §9: el turno del `accept` rápido en modo delegado
- modificar docs/formats.md — §1: quién tiene `locks/full-verification.json`

## Tareas

- [ ] T1: En modo delegado, el `accept` de un cambio rápido tiene el turno de aterrizaje de principio a fin
  - files: packages/cli/src/commands/accept.ts, packages/cli/test/accept-quick-turn.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/accept-quick-turn.test.ts test/accept-turn-time.test.ts test/close-turn.test.ts test/integrate.test.ts && pnpm typecheck && pnpm lint
  - type: fix
- [ ] T2: ARCHITECTURE y formats.md cuentan el turno del `accept` rápido en modo delegado
  - files: docs/ARCHITECTURE.md, docs/formats.md
  - ac: —
  - verify: grep -q 'el `accept` de un cambio rápido toma el turno antes de incorporar main' docs/ARCHITECTURE.md && grep -q 'en modo delegado, el `accept` de un cambio rápido lo tiene desde antes de incorporar main' docs/formats.md
  - type: docs

## Riesgos

- R1: Mantener el turno durante todo el `accept` rápido bloquea a las demás sesiones más tiempo — solo se añade el archivado y el aterrizaje (segundos), porque la verificación ya tenía el turno, y solo en modo delegado, donde nadie espera una respuesta.
