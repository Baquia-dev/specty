---
kind: standard
follows:
  - 20261025-los-textos-de-la-incorporacion-viven-en-core
---

# Los textos de review viven en core

## Objetivo

Undécimo cambio de la serie que lleva a core los textos de la CLI. `specty review` arma en la CLI sus rechazos (fase que no lo admite, sin revisor configurado, diff demasiado grande o vacío, revisor que falla) y el aviso «revisando con…». `flow/review.ts`, con lo que la persona decide en la revisión desde la UI (un supuesto, un comentario, pedir los cambios), también. Pasan a `cards/review.ts`, junto a los prompts y la tarjeta de la revisión independiente, y a un `cards/review-ui.ts` nuevo. «vuelve a cargar la UI» pasa a ser un solo texto en `cards/refusals.ts`. La salida no cambia ni una letra.

## Fuera de alcance

- Qué hace la revisión: solo cambia dónde viven sus textos.
- Los textos de las épicas, `prune`, `ui`, `export`, del servidor, de los hooks y de `check`, que llegan en los siguientes cambios de la serie.

## Supuestos

- A1: `inputFor`, que hoy devuelve el motivo del rechazo ya escrito, pasa a devolver el motivo como dato (diff demasiado grande o vacío), y `review` arma la tarjeta con core.

## Criterios de aceptación

- AC1: CUANDO `specty review` no revisa nada o el revisor falla ENTONCES el motivo y el SIGUIENTE son los mismos que antes, y salen de `cards/review.ts` de core.
- AC2: CUANDO la persona decide un supuesto, comenta o pide los cambios desde la UI ENTONCES lo que responde Specty es lo mismo que antes y sale de `cards/review-ui.ts` de core.
- AC3: CUANDO se ejecutan los tests de core ENTONCES cubren cada texto, en español y en inglés.

## Archivos

- modificar packages/core/src/cards/review.ts — los rechazos de review y el aviso «revisando con…»
- crear packages/core/src/cards/review-ui.ts — la revisión de la persona desde la UI
- modificar packages/core/src/cards/refusals.ts — «vuelve a cargar», un solo texto
- modificar packages/core/src/cards/index.ts — exportarlos
- crear packages/core/test/cards/review-texts.test.ts — sus tests
- modificar packages/cli/src/commands/review.ts — pedir sus textos a core
- modificar packages/cli/src/flow/review.ts — pedir sus textos a core

## Tareas

- [x] T1: Core tiene los textos de review y de la revisión desde la UI
  - files: packages/core/src/cards/review.ts, packages/core/src/cards/review-ui.ts, packages/core/src/cards/refusals.ts, packages/core/src/cards/index.ts, packages/core/test/cards/review-texts.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-core typecheck && pnpm --filter @baquia-dev/specty-core test
  - type: refactor
- [x] T2: review y la revisión desde la UI piden sus textos a core
  - files: packages/cli/src/commands/review.ts, packages/cli/src/flow/review.ts
  - ac: AC1, AC2
  - verify: pnpm check
  - type: refactor

## Cierre

### Resumen

Los textos de `review` viven en core: sus rechazos y el aviso «revisando con…» en `cards/review.ts`, junto a los prompts y la tarjeta de la revisión independiente, y la revisión de la persona desde la UI en `cards/review-ui.ts`. «vuelve a cargar» es ahora un solo texto, `reloadNext`, que también usa la tarjeta de «No hay un cambio activo». Los dos archivos de la CLI ya no llaman al traductor, y la salida es la misma: los tests de la CLI pasan sin cambios.

### Desviaciones

- Ninguna.

### Decisiones

- `inputFor` devuelve el motivo del rechazo como dato (`ReviewRefusal`), no como texto, y `review` arma la tarjeta con core.

### Pendientes

- Siguen en la CLI los textos de las épicas, `prune`, `ui`, `export`, `why`, `audit`, `delegate`, del servidor, de los hooks y de `check`.
