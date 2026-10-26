---
kind: standard
follows:
  - 20261025-los-textos-de-review-viven-en-core
---

# Los textos de las épicas y del trabajo en paralelo viven en core

## Objetivo

Duodécimo cambio de la serie que lleva a core los textos de la CLI. Varios archivos de la CLI arman textos propios:
- `flow/epic.ts`, los rechazos de `new --epic --slice`;
- `commands/prune.ts` y `flow/prune.ts`, la tarjeta de `prune` y por qué deja cada carpeta o rama;
- `flow/shared.ts`, los archivos que también lista otro cambio abierto;
- `flow/worktree.ts`, el aviso «preparando la carpeta con…»;
- `flow/detected.ts`, la pista de la verificación que detecta el cierre.

Pasan a `cards/epic.ts`, a un `cards/parallel.ts` nuevo y a `cards/close.ts`. La salida no cambia ni una letra.

## Fuera de alcance

- Qué hacen esos comandos: solo cambia dónde viven sus textos.
- Los textos de `ui`, `export`, `why`, `audit`, `delegate`, del servidor, de los hooks y de `check`, que llegan en los siguientes cambios de la serie.

## Supuestos

- A1: Los archivos compartidos, preparar la carpeta de un cambio y `prune` son partes de trabajar con una worktree por cambio, así que comparten módulo en core.

## Criterios de aceptación

- AC1: CUANDO `new --epic --slice` no puede empezar el corte ENTONCES el motivo, el estado y el SIGUIENTE son los mismos que antes, y salen de `cards/epic.ts` de core.
- AC2: CUANDO `specty prune` limpia o no tiene nada que limpiar, o se listan archivos compartidos, o se prepara la carpeta de un cambio ENTONCES la salida es la misma que antes y sale de `cards/parallel.ts` de core.
- AC3: CUANDO un cierre detecta una verificación que `config.yaml` no tiene ENTONCES la pista es la misma que antes y sale de `cards/close.ts` de core.
- AC4: CUANDO se ejecutan los tests de core ENTONCES cubren cada texto, en español y en inglés.

## Archivos

- modificar packages/core/src/cards/epic.ts — los rechazos de new --epic --slice
- crear packages/core/src/cards/parallel.ts — archivos compartidos, preparar la carpeta y prune
- modificar packages/core/src/cards/close.ts — la pista de la verificación detectada al cerrar
- modificar packages/core/src/cards/index.ts — exportarlos
- crear packages/core/test/cards/parallel.test.ts — sus tests
- modificar packages/cli/src/flow/epic.ts — pedir sus textos a core
- modificar packages/cli/src/commands/prune.ts — pedir sus textos a core
- modificar packages/cli/src/flow/prune.ts — pedir sus textos a core
- modificar packages/cli/src/flow/shared.ts — pedir sus textos a core
- modificar packages/cli/src/flow/worktree.ts — el aviso «preparando la carpeta con…», desde core
- modificar packages/cli/src/flow/detected.ts — la pista, desde core

## Tareas

- [x] T1: Core tiene los textos de las épicas, del trabajo en paralelo y de la pista del cierre
  - files: packages/core/src/cards/epic.ts, packages/core/src/cards/parallel.ts, packages/core/src/cards/close.ts, packages/core/src/cards/index.ts, packages/core/test/cards/parallel.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty-core typecheck && pnpm --filter @baquia-dev/specty-core test
  - type: refactor
- [x] T2: Las épicas y prune piden sus textos a core
  - files: packages/cli/src/flow/epic.ts, packages/cli/src/commands/prune.ts, packages/cli/src/flow/prune.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty typecheck
  - type: refactor
- [x] T3: Los archivos compartidos, la preparación de la carpeta y la pista piden sus textos a core
  - files: packages/cli/src/flow/shared.ts, packages/cli/src/flow/worktree.ts, packages/cli/src/flow/detected.ts
  - ac: AC2, AC3
  - verify: pnpm check
  - type: refactor

## Cierre

### Resumen

Los rechazos de `new --epic --slice` viven en `cards/epic.ts` (`sliceRefusalCard`); los textos del trabajo en paralelo (archivos compartidos, preparar la carpeta y `prune`), en un `cards/parallel.ts` nuevo; y la pista de la verificación detectada al cerrar, en `cards/close.ts`. Los seis archivos de la CLI ya no llaman al traductor, y la salida es la misma: los tests de la CLI pasan sin cambios.

### Desviaciones

- Ninguna.

### Decisiones

- `sliceRefusal` sigue en la CLI decidiendo el caso (lee la épica y sus cortes); core solo escribe cada motivo con su estado y su SIGUIENTE.

### Pendientes

- Siguen en la CLI los textos de `ui`, `export`, `delegate`, `why`, `audit`, del servidor, de los hooks y de `check`.
