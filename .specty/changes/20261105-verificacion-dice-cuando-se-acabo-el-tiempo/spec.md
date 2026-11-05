---
kind: standard
---

# La verificación completa dice cuándo se le acabó el tiempo

## Objetivo

Cuando la verificación completa se corta por `verify.timeoutSec`, `accept`, la incorporación de main y `specty integrate` solo muestran sus últimas líneas, como si hubiera fallado, sin decir que se acabó el tiempo. `exec` ya sabe que lo cortó (`timedOut`), pero nadie lo mira. En 20261104-cada-subagente-de-opencode-trabaja-en-la, `accept` falló así: la salida acababa justo al empezar los tests de la UI, sin ningún error, unos 600 s después de empezar, con la máquina muy cargada por otras sesiones (P95). Con este cambio, la salida de una verificación completa cortada por tiempo acaba en una línea que dice que se agotó el tiempo, a cuántos segundos, y que reintentar con menos carga puede bastar.

## Fuera de alcance

- La verificación completa que la persona lanza desde la UI (`server/runs.ts`), que corre sus comandos por su cuenta y tiene su propia salida.
- La verificación de cada tarea (`task done`) y los comandos de `specty check`, que ya dice cuándo uno se corta por tiempo.
- Cambiar `verify.timeoutSec` o reintentar solo: decide el agente o la persona.

## Supuestos

- A1: `accept`, la incorporación de main (dentro de `accept` y al cerrar) y `specty integrate` corren la verificación completa con `runFull` de `flow/units.ts`, también por unidades, y muestran las últimas líneas de su salida. Así, una línea al final de esa salida llega a los tres sin tocar sus tarjetas, y el test de `accept` basta para las tres.
  - impacto: alto
- A2: `exec` marca `timedOut` solo cuando corta el comando por el tiempo límite, y el código queda sin valor. Un comando que termina con un error por su cuenta no lo marca.
- A3: El límite que se cumplió es `verify.timeoutSec` de la configuración de la carpeta que verifica, el mismo que usa `runLive`.

## Criterios de aceptación

- AC1: CUANDO la verificación completa de `accept` (`verify.full`) se corta por `verify.timeoutSec` ENTONCES su nota acaba en una línea que dice que se agotó el tiempo, a cuántos segundos (`verify.timeoutSec`), que se cortó antes de terminar y que, si la máquina estaba cargada, reintentar con menos carga puede bastar.
- AC2: CUANDO con `verify.units` se corta por tiempo la unidad que corre ENTONCES la salida de esa unidad acaba en la misma línea, y las líneas de las unidades dicen que falló esa unidad.
- AC3: CUANDO la verificación completa falla sin cortarse por tiempo ENTONCES su salida es la de hoy, sin esa línea.
- AC4: CUANDO sale esa línea ENTONCES sale en español y en inglés.

## Diseño

- core `cards/units.ts`: `timedOutLine(seconds, lang)`, el texto de la verificación completa cortada por tiempo, exportada en `cards/index.ts`.
- cli `flow/units.ts`: `runFull` toma las últimas líneas de cada comando que corre con `outputOf(session, result)`, que añade `timedOutLine` cuando `result.timedOut`, con `session.config.verify.timeoutSec`. Vale para `verify.full` y para cada unidad. `runUnits` no cambia: recibe la salida ya hecha.

## Archivos

- modificar packages/core/src/cards/units.ts — el texto de la verificación completa cortada por tiempo
- modificar packages/core/src/cards/index.ts — exportarlo, porque lo usa la CLI
- modificar packages/cli/src/flow/units.ts — la salida de un comando cortado por tiempo acaba en ese texto
- modificar packages/core/test/cards/units.test.ts — el texto en español y en inglés
- crear packages/cli/test/verify-timeout.test.ts — `accept` con `verify.full` y con `verify.units` que se cortan por tiempo, y uno que falla sin cortarse
- modificar docs/formats.md — `verify.timeoutSec`: qué dice la salida cuando se cumple

## Tareas

- [x] T1: El texto de una verificación completa cortada por tiempo
  - files: packages/core/src/cards/units.ts, packages/core/src/cards/index.ts, packages/core/test/cards/units.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/units.test.ts && pnpm typecheck
- [x] T2: `accept` dice que la verificación completa se cortó por tiempo
  - files: packages/cli/src/flow/units.ts, packages/cli/test/verify-timeout.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/verify-timeout.test.ts test/accept-units.test.ts && pnpm typecheck
- [ ] T3: formats.md cuenta qué dice la salida al cumplirse `verify.timeoutSec`
  - files: docs/formats.md
  - ac: —
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/units.test.ts
  - type: docs

## Riesgos

- R1: El test espera a que se cumpla un tiempo límite real. Mitigación: `verify.timeoutSec: 1` y un comando que tarda mucho más, así que el test tarda alrededor de un segundo por caso y no depende de la carga.
- R2: Otras sesiones siguen con la épica de verificación por unidades y pueden tocar `flow/units.ts`. Mitigación: el cambio es puntual, y `propose` avisa si comparten archivos.
