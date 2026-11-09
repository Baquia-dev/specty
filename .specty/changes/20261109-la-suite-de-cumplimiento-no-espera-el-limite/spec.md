---
kind: standard
---

# La suite de cumplimiento no espera el límite cuando nadie decide

## Objetivo

En una ejecución de la suite sin una persona que decida, el agente que llega a `specty wait` ya terminó su trabajo: nadie va a aprobar ni aceptar. Hoy la suite lo deja esperando hasta su límite de 10 minutos (con agy, 601 s de los que unos 80 fueron trabajo), así que cada ejecución dura el límite y sus segundos miden la espera. Con este cambio, la suite trata ese momento como el fin del turno del agente, igual para todos los agentes, y el informe mide el tiempo de trabajo.

## Fuera de alcance

- Cambiar `specty wait`, su marca o su tarjeta.
- El experimento `wait`, cuya persona decide mientras el agente espera: sigue hasta que termina o lo corta su límite.
- Parar el `specty wait` que deja el agente parado. Como hoy con el límite, acaba cuando la suite borra su carpeta temporal al terminar. Matarlo por el número de proceso de su marca podría alcanzar otro proceso si el sandbox del agente tiene sus propios números.
- Medir la suite con cuatro agentes y repetirla (criterio de salida de F3): este cambio lo hace posible, pero no lo hace.
- Una columna nueva en el informe: sus segundos cambian de significado, pero no de forma.

## Supuestos

- A1: `specty wait` escribe su marca (`waits/<id>.json` en la carpeta común de git, formats.md §1) solo cuando el cambio espera una decisión de la persona que el modo delegado no cubre, y la preparación de los escenarios y experimentos nunca ejecuta `wait`. Así, una marca en una ejecución sin persona significa que el agente espera una decisión que nadie va a tomar. Lo leí en `packages/cli/src/commands/wait.ts`: sin nada que esperar, o en modo delegado con una decisión del agente, responde antes de escribirla.
  - impacto: alto
- A2: Juzgar el repositorio cuando el agente empieza a esperar da el mismo veredicto que juzgarlo en el límite. `specty wait` espera 3300 s por defecto, más que el límite de 600 s, así que hoy el agente sigue bloqueado en él hasta que la suite lo corta, sin tocar el repositorio.
  - impacto: alto
- A3: Todos los agentes ejecutan `specty` con el envoltorio de la suite, que corre el bundle en el repositorio desechable, así que la marca aparece igual con cualquiera de ellos.
- A4: Un agente que deja `specty wait` en segundo plano y termina su turno lo hace en pocos segundos. 15 s de gracia le dejan terminar solo, con su mensaje final y su consumo en la transcripción. Si sigue, la suite lo para con la misma señal que su límite (SIGTERM).

## Criterios de aceptación

- AC1: CUANDO, en una ejecución sin persona que decida, aparece la marca de un `specty wait` en el repositorio y el agente sigue corriendo 15 s después ENTONCES la suite lo para sin esperar su límite y lo juzga por el repositorio, como antes.
- AC2: CUANDO la suite para al agente que espera ENTONCES los segundos de esa ejecución son los que pasaron hasta que vio su espera, sin la gracia. CUANDO el agente termina solo dentro de la gracia, o sin haber esperado nunca, ENTONCES son los que pasaron hasta su fin.
- AC3: CUANDO el experimento tiene una persona que decide (`wait`) ENTONCES la suite no para al agente al llegar a `specty wait`: la persona decide y el agente sigue.
- AC4: CUANDO la suite pide parar una ejecución ENTONCES el agente acaba como lo corta su límite: con una señal y sin código de salida.
- AC5: CUANDO se ejecuta `pnpm evals` con un agente real (Claude Code o agy) y `SPECTY_EVALS_SCENARIOS=no-spec` ENTONCES la ejecución acaba muy por debajo del límite de 10 minutos, y ARCHITECTURE §16 explica el fin del turno en `specty wait` y da ese resultado.
  - test: manual

## Diseño

- `evals/src/launch.ts`: `Launched` gana `stop()`, que manda al agente la misma señal que su límite (SIGTERM).
- `evals/src/person.ts`, junto a la persona que decide, la ausencia de ella:
  - `unattended(root, run, timing)`: mientras el agente corre, mira cada segundo la carpeta de las marcas de `specty wait` del repositorio (`git rev-parse --git-path common/specty/waits`). Cuando aparece una, anota ese momento (`performance.now()`) y le da 15 s de gracia. Si el agente sigue corriendo, lo para con `stop()` y devuelve el momento anotado; si terminó solo, o nunca esperó, no devuelve nada.
  - `attendance(root, run, person)`: con persona, `attend` como hoy; sin ella, `unattended`. Devuelve lo mismo que `unattended`.
- `evals/run/compliance.eval.ts`: `runOnce` usa `attendance`. Los segundos van desde el lanzamiento hasta el momento anotado, si la suite paró al agente esperando, o hasta su fin.
- `evals/src/report.ts`: el comentario de `seconds` dice qué mide ahora.

## Archivos

- modificar evals/src/launch.ts — `stop()` en la ejecución lanzada
- modificar evals/test/launch.test.ts — `stop()` acaba como el límite (AC4)
- modificar evals/src/person.ts — `unattended` y `attendance`
- crear evals/test/unattended.test.ts — el fin del turno en `specty wait`, la gracia y la persona que decide (AC1, AC2, AC3)
- modificar evals/run/compliance.eval.ts — `runOnce` con `attendance` y los segundos de trabajo
- modificar evals/src/report.ts — qué miden los segundos
- modificar docs/ARCHITECTURE.md — §16: el fin del turno en `specty wait`, los segundos y el resultado de la ejecución real

## Tareas

- [x] T1: La suite puede parar una ejecución como la para su límite
  - files: evals/test/launch.test.ts, evals/src/launch.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty-evals exec vitest run test/launch.test.ts && pnpm lint
  - type: fix
- [x] T2: Sin persona, la suite termina el turno del agente cuando espera con `specty wait`
  - files: evals/test/unattended.test.ts, evals/src/person.ts, evals/run/compliance.eval.ts, evals/src/report.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-evals exec vitest run test/unattended.test.ts && pnpm typecheck && pnpm lint
  - type: fix
- [x] T3: La ejecución real y el fin del turno en ARCHITECTURE §16
  - files: docs/ARCHITECTURE.md
  - ac: AC5
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: Un agente cuya herramienta corta `specty wait` antes de tiempo podría, después, hacer algo que hoy se juzgaría como violación y que con este cambio no llega a hacer. Mitigación: llegar a `specty wait` es el fin de turno que piden sus instrucciones, y la gracia de 15 s deja ver un fin inmediato; se anota en §16.
- R2: La ejecución real gasta la cuota de la persona. Mitigación: un solo escenario corto, una vez.
