---
kind: standard
---

# Los textos de new viven en core

## Objetivo

ARCHITECTURE y AGENTS.md dicen que los textos que ve el agente viven en `packages/core/src/cards/`, pero `specty new` arma los suyos en la CLI: los ocho motivos por los que no crea nada, el «Cambio creado» y la tarjeta de un cambio creado en su worktree. Pasan a `core/src/cards/new.ts`, con tests en core, y la CLI solo decide qué caso es y le pasa los datos. Es el primer cambio de la serie que lleva a core los textos de la CLI, y la salida no cambia ni una letra.

## Fuera de alcance

- Los textos de los demás comandos, que llegan en los siguientes cambios de la serie.
- Cambiar cualquier texto: se mueven tal cual.

## Supuestos

- A1: Los tests de la CLI que comprueban la salida de `new` (worktrees, épicas, proyecto nuevo y petición) siguen pasando sin cambios, porque los textos se mueven letra a letra.

## Criterios de aceptación

- AC1: CUANDO `specty new` no crea nada (tipo desconocido, primer cambio quick de un proyecto nuevo, sin título, petición vacía, `--from` sin `--worktree`, `--worktree` sin rama por cambio, base que no existe o un cambio ya en curso) ENTONCES muestra el mismo motivo, estado y SIGUIENTE que antes, y el texto sale de `cards/new.ts` de core.
- AC2: CUANDO `specty new` crea un cambio, en esta carpeta o en su propia worktree ENTONCES su salida es la misma que antes y sale de `cards/new.ts` de core.
- AC3: CUANDO se ejecutan los tests de core ENTONCES cubren cada motivo por el que `new` no crea nada y las dos salidas de un cambio creado, en español y en inglés.

## Archivos

- crear packages/core/src/cards/new.ts — los motivos por los que new no crea nada, el lead de un cambio creado y la tarjeta de su worktree
- modificar packages/core/src/index.ts — exportarlos
- crear packages/core/test/cards/new.test.ts — sus tests
- modificar packages/cli/src/commands/new.ts — pedir a core cada texto
- modificar packages/cli/src/commands/agent-commands.ts — el tipo desconocido, también desde core

## Tareas

- [x] T1: Core tiene las tarjetas de new
  - files: packages/core/src/cards/new.ts, packages/core/src/index.ts, packages/core/test/cards/new.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-core typecheck && pnpm --filter @baquia-dev/specty-core test
  - type: refactor
- [x] T2: new pide sus textos a core
  - files: packages/cli/src/commands/new.ts, packages/cli/src/commands/agent-commands.ts
  - ac: AC1, AC2
  - verify: pnpm check
  - type: refactor

## Cierre

### Resumen

Los textos de `specty new` viven en `core/src/cards/new.ts`: `newRefusalCard` (un caso por cada motivo por el que no crea nada), `changeCreatedLead` y `worktreeCreatedCard`, con tests en core. `new.ts` y `agent-commands.ts` ya no llaman al traductor, y la salida es la misma: los tests de la CLI pasan sin cambios.

### Desviaciones

- Ninguna.

### Decisiones

- El tipo de cambio desconocido usa `bareCards`, porque se rechaza antes de abrir la sesión.
- `worktreeCreatedCard` recibe el resultado de preparar la carpeta tal como lo da la CLI (comando, si fue bien y el final de su salida).

### Pendientes

- Siguen en la CLI los textos de los demás comandos: los siguientes cambios de la serie los llevan a core, por grupos.
