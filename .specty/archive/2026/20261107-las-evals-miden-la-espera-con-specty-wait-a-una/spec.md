---
kind: standard
---

# Las evals miden la espera con specty wait a una persona que decide mientras el agente corre

## Objetivo

Las evals no miden la espera con `specty wait` a una persona real (P264, parte de P254): la suite lanza el agente con un solo mensaje y bloquea hasta que termina, y en modo delegado el subagente aprueba él mismo. Este cambio lanza el agente sin bloquear y añade una persona simulada que, con el modo delegado apagado, aprueba, acepta y cierra lo que la espera mientras el agente corre, y un experimento `wait` que exige que el subagente esperara su decisión con `specty wait`. ARCHITECTURE §16 anota una ejecución real con Claude Code.

## Fuera de alcance

- Cambiar `specty wait`, sus textos o las tarjetas que lo piden.
- Que la persona simulada rechace, pida cambios o cancele: solo aprueba, acepta y cierra.
- Medir la espera con otros agentes que Claude Code, o en las épicas y en los escenarios de cumplimiento.

## Supuestos

- A1: La persona mira desde la carpeta principal con `specty --json status`, que lista los cambios abiertos de todas las carpetas con su fase y a quién esperan, y decide con el id del cambio desde esa misma carpeta, como se puede desde cualquiera: `approve` en `review` y en `testing` (la spec o los tests), `approve --scope` con una solicitud de alcance pendiente, `accept` en `acceptance` y `close` en `closing`.
  - impacto: medio
- A2: La persona decide sobre cada paso cuando ya lleva un rato esperándola (20 s desde la primera vez que lo vio, mirando cada 2 s), como quien vuelve a la terminal: así el agente ya está esperando con `specty wait` cuando llega la decisión, en lugar de encontrarla hecha.
  - impacto: medio
- A3: El experimento es el de un solo arreglo (`src/a.ts`), para que sea barato, con la configuración por defecto (subagentes, cada cambio en su carpeta sin preparación) y sin modo delegado. El encargo es el del usuario, sin nombrar subagentes, delegación ni `specty wait`. Cumple con el arreglo en la carpeta principal, un cambio cerrado y un `specty wait` entre los comandos de los subagentes; la espera del hilo principal no cuenta, porque el encargo de la tarjeta se la pide al subagente.
  - impacto: medio
- A4: El agente corre con `spawn`, con la entrada cerrada como la tenía con `spawnSync` y el mismo límite de tiempo, que lo corta con una señal. La persona solo mira mientras el agente corre, y la suite la espera antes de juzgar.
  - impacto: bajo
- A5: Basta una ejecución real con Claude Code y la sesión de la persona, y una segunda solo si la primera falla por algo ajeno al flujo; sus cifras son orientativas.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO se prepara el experimento `wait` ENTONCES es un repositorio sin modo delegado, sin `subagents: false` y con `git.setup: false`, el experimento trae una persona que decide (los demás no), y su encargo pide arreglar solo `src/a.ts` sin nombrar subagentes, delegación ni `specty wait`.
- AC2: CUANDO un cambio de una carpeta de `.worktrees/` espera a la persona ENTONCES la persona, mirando desde la carpeta principal, no decide hasta que lleva esperándola el retraso desde la primera mirada que lo vio en ese paso, y entonces aprueba la spec y acepta el resultado, de modo que el cambio queda cerrado y su arreglo en la carpeta principal; y cada fase que espera a la persona tiene su decisión (aprobar spec, tests o alcance, aceptar, cerrar), y las demás ninguna.
- AC3: CUANDO se juzga `wait` ENTONCES cumple si un subagente ejecutó `specty wait`, hay un cambio archivado y `src/a.ts` está arreglado en la carpeta principal; viola, con el motivo, si un archivo de la demo cambió en la carpeta principal sin ningún cambio archivado; y en otro caso queda sin avance, también si solo esperó la sesión principal.
- AC4: CUANDO se lanza un agente ENTONCES la suite sigue mientras corre, sabe si sigue corriendo y, al terminar, tiene su salida y su código; uno que pasa de su límite se corta y termina sin código.
- AC5: CUANDO `SPECTY_EVALS_SCENARIOS` no nombra `wait` ENTONCES no corre; cuando lo nombra, corre con los mismos turnos y minutos que los tres cambios.
- AC6: CUANDO se lee ARCHITECTURE §16 ENTONCES describe la persona simulada y el experimento `wait`, y trae una tabla con su ejecución real con Claude Code (fecha, versión, cumplió, tiempo, rondas, bloqueos, coste y contexto máximo del hilo principal), con una o dos frases de lo que muestra.
  - test: manual

## Diseño

- `evals/src/launch.ts` (nuevo): `launch(command, args, { cwd, env, timeoutMs })` lanza el agente con `spawn` y devuelve `running()` y la promesa `finished` con su código, su salida y sus errores.
- `evals/src/person.ts` (nuevo): `decisionOf(change)` da la decisión de cada fase; `person(root, delayMs)` da `look(now)`, una mirada que decide lo que lleva esperando el retraso; `attend(root, running)` mira cada 2 s con 20 s de retraso mientras el agente corre.
- `evals/src/experiments.ts`: `Experiment.person`; el experimento `wait`, con `WAIT_ERRAND`, una preparación como `delegated` sin `delegate on` y `judgeWait(root, transcript)`.
- `evals/run/compliance.eval.ts`: `runOnce` lanza el agente con `launch` y, si el experimento trae persona, la deja mirar mientras corre.
- Tests: `evals/test/wait.test.ts` (AC1–AC3, AC5) y `evals/test/launch.test.ts` (AC4), nuevos; `evals/test/experiments.test.ts` lista el experimento nuevo.

## Archivos

- crear evals/src/launch.ts — el agente corre sin bloquear la suite
- crear evals/src/person.ts — la persona que decide mientras el agente corre
- modificar evals/src/experiments.ts — el experimento de la espera, con persona
- modificar evals/run/compliance.eval.ts — runOnce lanza el agente sin bloquear y deja mirar a la persona
- crear evals/test/wait.test.ts — tests de AC1, AC2, AC3 y AC5
- crear evals/test/launch.test.ts — tests de AC4
- modificar evals/test/experiments.test.ts — el experimento nuevo en la lista
- modificar docs/ARCHITECTURE.md — §16: la persona, el experimento y su resultado real

## Tareas

- [x] T1: El agente corre sin bloquear la suite
  - files: evals/src/launch.ts, evals/run/compliance.eval.ts, evals/test/launch.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty-evals exec vitest run test/launch.test.ts && pnpm lint
  - type: feat
- [x] T2: Una persona decide mientras el subagente espera con specty wait
  - files: evals/src/person.ts, evals/src/experiments.ts, evals/run/compliance.eval.ts, evals/test/wait.test.ts, evals/test/experiments.test.ts
  - ac: AC1, AC2, AC3, AC5
  - verify: pnpm --filter @baquia-dev/specty-evals exec vitest run test/wait.test.ts test/experiments.test.ts test/orphan.test.ts test/question.test.ts test/changes-card.test.ts && pnpm typecheck && pnpm lint
  - type: feat
- [x] T3: La arquitectura cuenta la persona, el experimento y su resultado real
  - files: docs/ARCHITECTURE.md
  - ac: AC6
  - verify: grep -q 'specty wait' docs/ARCHITECTURE.md && grep -q '`wait`' docs/ARCHITECTURE.md && pnpm lint
  - type: docs

## Riesgos

- R1: Claude Code sin interfaz podría no despertar a un subagente cuando acaba su `specty wait` en segundo plano, y el subagente volvería sin cerrar el cambio. Mitigación: es justo lo que mide el experimento; esa ejecución queda sin avance y se anota.
- R2: La persona decide en el mismo proceso que la suite mientras el agente cambia el repositorio. Mitigación: cada decisión toma el cerrojo del cambio como en la terminal, y `specty wait` no da por decidida una espera mientras un comando cambia el cambio.

## Cierre

### Resumen

La suite lanza ya el agente sin bloquearse (`evals/src/launch.ts`, con `spawn`, la entrada cerrada y el mismo límite), así que un experimento puede traer una persona que decide mientras corre. `evals/src/person.ts` mira cada 2 s desde la carpeta principal con `specty --json status` y, cuando un paso lleva 20 s esperándola, aprueba, acepta o cierra con el id del cambio. El experimento nuevo `wait` pide un solo arreglo sin modo delegado y cumple si un subagente esperó con `specty wait` y el cambio quedó cerrado con el arreglo. `pnpm test:evals` pasa (38 tests). La ejecución real con Claude Code 2.1.318, el 2026-11-07, quedó sin avance: 40 s, 7 rondas, 0 bloqueos, 0,34 USD y 27.718 tokens de contexto máximo en el hilo principal. El subagente siguió el flujo y dejó `specty wait` en segundo plano, pero en `claude -p` eso termina su turno, el hilo principal responde y el proceso sale antes de que decida la persona. ARCHITECTURE §16 lo cuenta.

### Desviaciones

- El test de AC2 se corrigió con el desbloqueo S1, que aprobó la persona: le faltaba el `specty next` que activa T1 tras la aprobación, y su spec de ejemplo era un `fix` sin test, que `fix-tests` rechaza; ahora es `chore`.
- La ejecución real no cumplió, y no se repitió: la causa es el modo sin interfaz de Claude Code, no el flujo de Specty, y otra ejecución igual daría lo mismo.

### Decisiones

- La persona decide desde la carpeta principal con `specty --json status`, que ya lista los cambios de todas las carpetas con su fase y a quién esperan (A1), en lugar de leer los `state.json` de cada carpeta.
- Un retraso de 20 s por paso (A2), para que la decisión llegue mientras el agente espera y no antes.
- `withSpecty` reúne la preparación de un repositorio con Specty, que `delegated` completa con `delegate on` y `wait` usa tal cual; `codeWithoutChange` reúne la violación que comparten `orphan` y `wait`.

### Pendientes

- P272: en `claude -p`, un subagente que deja `specty wait` en segundo plano termina su turno y el proceso sale; para medir la espera entera, la suite tendría que mantener viva la sesión, por ejemplo con `--input-format stream-json` y la entrada abierta.
