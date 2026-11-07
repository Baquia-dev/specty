---
kind: standard
---

# Las evals miden la vuelta a un cambio huérfano con un subagente

## Objetivo

Sin cambio activo, la tarjeta de `specty next` en la carpeta principal lista los cambios que ninguna conversación lleva y, con subagentes, trae un «ENCARGO PARA RETOMAR» para lanzar uno con el id del huérfano. Nada comprueba con un agente real que la sesión lo lanza y que el subagente entra con `specty enter <id>` y cierra ese cambio en lugar de crear otro (P262). Este cambio añade a las evals un experimento `orphan` que lo mide, y anota en ARCHITECTURE §16 una ejecución real con Claude Code.

## Fuera de alcance

- Cambiar el bloque de huérfanos o su encargo (`packages/core/src/cards/rejoin.ts`): lo cambia otro cambio en paralelo.
- Las épicas huérfanas, que ya miden `epic` y `epic-subagent`.
- Medir la espera con `specty wait` a una persona real (P264, otro cambio) o medir el experimento con otros agentes que Claude Code.

## Supuestos

- A1: El huérfano es un cambio quick aprobado, en `implementing`, en su carpeta de `.worktrees/`, que cambia `a` de `src/a.ts`, en un repositorio como el de los otros experimentos: modo delegado, configuración por defecto (subagentes), `git.setup: false`. Su `state.json` se escribió hace dos horas, como el de `approvedEpic`, así que `next` en la carpeta principal lo ofrece para retomar. Un quick basta: lo que se mide es la vuelta al cambio, no su tamaño.
  - impacto: medio
- A2: El juicio necesita el id del huérfano, y un cambio cerrado ya no tiene carpeta en `.worktrees/`. La preparación lo anota en la configuración local de git del repositorio desechable (`evals.orphan`), que no lee ni Specty ni el agente, y el juicio lo lee de ahí: sigue juzgando por el repositorio y por la transcripción.
  - impacto: bajo
- A3: El encargo pide seguir con el cambio por su título hasta cerrarlo, en modo delegado, sin nombrar subagentes ni `specty enter`: lo decide la tarjeta. Ni el experimento ni sus tests dependen del texto del bloque de huérfanos, que otro cambio está tocando: solo de que `next` nombre el id.
  - impacto: medio
- A4: Basta una ejecución real con Claude Code y la sesión de la persona, y una segunda solo si la primera falla por algo ajeno al flujo; sus cifras son orientativas.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO se prepara el experimento `orphan` ENTONCES hay un cambio quick aprobado, en `implementing`, en su carpeta de `.worktrees/`, cuya spec nombra `src/a.ts`; el repositorio está en modo delegado, sin `subagents: false`; la carpeta principal conserva `src/a.ts` sin arreglar; `specty next` en la carpeta principal nombra el id del cambio; y el encargo nombra el título del cambio sin nombrar subagentes ni `specty enter`.
- AC2: CUANDO se juzga `orphan` ENTONCES cumple si un subagente ejecutó `specty enter` con el id del huérfano, ese cambio está archivado y `src/a.ts` está arreglado en la carpeta principal; viola, con el motivo, si un archivo de la demo cambió en la carpeta principal sin ningún cambio archivado; y en otro caso queda sin avance, también cuando fue la sesión principal la que entró o cuando se cerró otro cambio en lugar del huérfano.
- AC3: CUANDO `SPECTY_EVALS_SCENARIOS` no nombra `orphan` ENTONCES no corre; cuando lo nombra, corre con los mismos turnos y minutos que los tres cambios.
- AC4: CUANDO se lee ARCHITECTURE §16 ENTONCES describe el experimento `orphan` y trae una tabla con su ejecución real con Claude Code (fecha, versión, cumplió, tiempo, rondas, bloqueos, coste y contexto máximo del hilo principal), con una o dos frases de lo que muestra.
  - test: manual

## Diseño

- `evals/src/experiments.ts`: `orphanChange(tool)` prepara el repositorio con `delegated(tool)`, crea el cambio quick con `new`, escribe su spec (`ORPHAN_SPEC`), lo propone y lo aprueba como persona, envejece su `state.json` dos horas y anota su id en `evals.orphan`. `judgeOrphan(root, transcript)` lee ese id, los cambios archivados (por id) y los `Bash` de los subagentes (`subagentCommandsOf`). `ORPHAN_ERRAND` pide seguirlo por su título. El experimento `orphan` va tras `question` en `EXPERIMENTS`, con `TURNS` y `MINUTES`.
- Tests: `evals/test/orphan.test.ts` (nuevo) con AC1–AC3; `evals/test/experiments.test.ts` lista el experimento nuevo.

## Archivos

- modificar evals/src/experiments.ts — el experimento de un cambio huérfano
- crear evals/test/orphan.test.ts — tests de AC1 a AC3
- modificar evals/test/experiments.test.ts — el experimento nuevo en la lista
- modificar docs/ARCHITECTURE.md — §16: el experimento y su resultado real

## Tareas

- [x] T1: Un experimento que retoma un cambio huérfano con un subagente
  - files: evals/src/experiments.ts, evals/test/orphan.test.ts, evals/test/experiments.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-evals exec vitest run test/orphan.test.ts test/experiments.test.ts test/question.test.ts test/changes-card.test.ts && pnpm typecheck && pnpm lint
  - type: feat
- [ ] T2: La arquitectura cuenta el experimento y su resultado real
  - files: docs/ARCHITECTURE.md
  - ac: AC4
  - verify: grep -q 'orphan' docs/ARCHITECTURE.md && pnpm lint
  - type: docs

## Riesgos

- R1: La sesión principal puede entrar ella misma en el huérfano en lugar de lanzar el subagente, o crear un cambio nuevo. Mitigación: el juicio lo deja sin avance, no como cumplido, y se anota.
- R2: El texto del bloque de huérfanos cambia en paralelo. Mitigación: ni el experimento ni sus tests dependen de él, solo del id.
