---
kind: standard
follows:
  - 20261025-los-textos-de-propose-task-done-y-scope-add-vive
---

# Los textos de adjust y retro viven en core

## Objetivo

Tercer cambio de la serie que lleva a core los textos de la CLI, con los dos comandos del agente que quedaban. `adjust` arma en la CLI sus rechazos, y `retro` los suyos, el título de la spec de una retro, la pregunta que hace `retro --minimal` y lo que dice al documentar los cambios. Pasan a `cards/adjust.ts` y `cards/retro.ts` de core, con tests, y `adjust` usa la tarjeta común de «No hay un cambio activo». La salida no cambia ni una letra.

## Fuera de alcance

- Los textos de las decisiones de la persona (`approve`, `reject`, `accept`, `close`, `cancel`) y de la instalación, que llegan en los siguientes cambios de la serie.
- Cambiar cualquier texto: se mueven tal cual.

## Supuestos

- A1: `retroDone`, que también usa `approve.ts` al aprobar una retro, se queda en la CLI como un envoltorio sin textos de `retroDoneCard`, para no tocar `approve.ts` antes de su cambio.

## Criterios de aceptación

- AC1: CUANDO `specty adjust` no registra el ajuste (sin cambio activo, sin petición o fuera de la aceptación) ENTONCES muestra el mismo motivo, estado y SIGUIENTE que antes, y el texto sale de core.
- AC2: CUANDO `specty retro` no documenta nada (otra retro en curso, nada preparado, sin modo minimal o sin motivo) o crea su spec, pregunta el motivo o termina ENTONCES su salida es la misma que antes y sale de `cards/retro.ts` de core.
- AC3: CUANDO se ejecutan los tests de core ENTONCES cubren cada caso, en español y en inglés.

## Archivos

- crear packages/core/src/cards/adjust.ts — los rechazos de adjust
- crear packages/core/src/cards/retro.ts — los rechazos de retro, el título de su spec, su pregunta y su tarjeta final
- modificar packages/core/src/index.ts — exportarlos
- crear packages/core/test/cards/adjust.test.ts — tests de adjust.ts
- crear packages/core/test/cards/retro.test.ts — tests de retro.ts
- modificar packages/cli/src/commands/adjust.ts — pedir sus textos a core
- modificar packages/cli/src/commands/retro.ts — pedir sus textos a core

## Tareas

- [ ] T1: Core tiene los textos de adjust y retro
  - files: packages/core/src/cards/adjust.ts, packages/core/src/cards/retro.ts, packages/core/src/index.ts, packages/core/test/cards/adjust.test.ts, packages/core/test/cards/retro.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-core typecheck && pnpm --filter @baquia-dev/specty-core test
  - type: refactor
- [ ] T2: adjust y retro piden sus textos a core
  - files: packages/cli/src/commands/adjust.ts, packages/cli/src/commands/retro.ts
  - ac: AC1, AC2
  - verify: pnpm check
  - type: refactor
