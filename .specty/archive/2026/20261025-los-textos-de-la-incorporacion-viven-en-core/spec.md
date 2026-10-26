---
kind: standard
follows:
  - 20261025-los-textos-de-uninstall-viven-en-core
---

# Los textos de la incorporación viven en core

## Objetivo

Décimo cambio de la serie que lleva a core los textos de la CLI, con la incorporación (ARCHITECTURE §9). Para traer la rama principal al cambio, `flow/integrate.ts` arma en la CLI sus rechazos, lo que queda para el agente y lo que dice al terminar. `specty integrate` hace lo mismo al rematar el merge que dejó un cierre. `flow/land.ts`, al llevar el cambio a la rama principal y salir de su carpeta, también. Con ellos va el aviso «verificando…» que comparten con `task done`. Pasan a `cards/integration.ts`, junto a la tarjeta de `next` durante una incorporación, a `cards/land.ts` y a `cards/text.ts`. La salida no cambia ni una letra.

## Fuera de alcance

- Cómo se incorpora un cambio: solo cambia dónde viven sus textos.
- Los textos de `review`, del servidor, de `check` y de los demás comandos, que llegan en los siguientes cambios de la serie.

## Supuestos

- A1: Los títulos de los detalles de una incorporación rechazada («CONFLICTOS», «SALIDA DE LA VERIFICACIÓN»…) se repiten entre `integrate`, `flow/integrate.ts` y la tarjeta de `next`, así que una sola función los da todos.

## Criterios de aceptación

- AC1: CUANDO traer la rama principal al cambio se rechaza (carpeta con cambios sin commit, conflictos, merge fallido o verificación que falla), queda para el agente o termina ENTONCES las líneas, los detalles y el SIGUIENTE son los mismos que antes, y salen de core.
- AC2: CUANDO `specty integrate` no tiene nada que rematar, encuentra el merge abortado, marcadores, cambios fuera o una verificación que falla, o termina ENTONCES su salida es la misma que antes y sale de core.
- AC3: CUANDO el cambio llega a la rama principal, o no llega, y su carpeta se elimina o se queda ENTONCES las líneas y el SIGUIENTE del cierre son los mismos que antes, y salen de `cards/land.ts` de core.
- AC4: CUANDO se ejecutan los tests de core ENTONCES cubren cada texto, en español y en inglés.

## Archivos

- modificar packages/core/src/cards/integration.ts — los textos de traer la rama principal al cambio y de integrate
- modificar packages/core/src/cards/text.ts — el aviso «verificando…»
- crear packages/core/src/cards/land.ts — los textos de llevar el cambio a la rama principal y salir de su carpeta
- modificar packages/core/src/cards/index.ts — exportarlos
- crear packages/core/test/cards/incorporation.test.ts — tests de integration.ts, land.ts y el aviso
- modificar packages/cli/src/flow/integrate.ts — pedir sus textos a core
- modificar packages/cli/src/commands/integrate.ts — pedir sus textos a core
- modificar packages/cli/src/flow/land.ts — pedir sus textos a core
- modificar packages/cli/src/flow/task-done.ts — el aviso «verificando…», desde core

## Tareas

- [x] T1: Core tiene los textos de la incorporación
  - files: packages/core/src/cards/integration.ts, packages/core/src/cards/text.ts, packages/core/src/cards/land.ts, packages/core/src/cards/index.ts, packages/core/test/cards/incorporation.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty-core typecheck && pnpm --filter @baquia-dev/specty-core test
  - type: refactor
- [x] T2: La incorporación pide sus textos a core
  - files: packages/cli/src/flow/integrate.ts, packages/cli/src/commands/integrate.ts, packages/cli/src/flow/land.ts, packages/cli/src/flow/task-done.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm check
  - type: refactor

## Cierre

### Resumen

Los textos de la incorporación viven en core: `cards/integration.ts` (traer la rama principal al cambio, lo que queda para el agente, `integrate` y los títulos de sus detalles, que ya usaba la tarjeta de `next`), `cards/land.ts` (llevar el cambio a la rama principal y salir de su carpeta) y `verifyingNote` en `text.ts`, que también usa `task done`. Los cuatro archivos de la CLI ya no llaman al traductor y sale `askAgent`; la salida es la misma: los tests de la CLI pasan sin cambios.

### Desviaciones

- Ninguna.

### Decisiones

- `notYetLine` junta el «No se cerró / No se aceptó / No se incorporó» con lo que pasó después (nada cambió, o el merge espera al agente), que antes eran dos funciones de la CLI.

### Pendientes

- Siguen en la CLI los textos de `review`, de las épicas, `prune`, `ui`, `export`, del servidor, de los hooks y de `check`.
