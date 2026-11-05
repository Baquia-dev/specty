---
kind: standard
epic: 20261105-verificacion-por-unidades
slice: C4
---

# Una verificación fresca encuentra los tests inestables y los anota en la memoria

## Objetivo

Con las unidades de `verify.units`, la verificación completa salta las que ya pasaron con la misma huella, y nada la ejecuta entera fuera del CI, ni distingue un test inestable de un fallo de verdad. Con este cambio, `specty verify --fresh` ejecuta todas las unidades (o `verify.full` sin unidades) sin mirar el registro y repite una vez la que falla. Si pasa al repetirla, es inestable y queda en la memoria como lección de sus `paths`; si falla las dos veces, como pendiente. Es el corte C4 de la épica `20261105-verificacion-por-unidades` (AC6 y AC7 de la épica).

## Fuera de alcance

- `specty verify` sin `--fresh`: la verificación completa con el registro la siguen ejecutando `accept` y, con el corte C2, la incorporación, `specty integrate` y la UI.
- Anotar `change.verified` en la auditoría del cambio: la verificación fresca solo escribe el registro de las unidades y la memoria.
- Verla en vivo en la UI o en la MCP App, y una herramienta `specty_verify` del servidor MCP.
- Decir qué test concreto es el inestable: la salida del intento que falló sale en la tarjeta, sin leer informes de tests.
- Ejecutar varias unidades a la vez y borrar los archivos viejos del registro, como dice la épica.

## Supuestos

- A1: `specty verify --fresh` es un comando del agente que no concede nada, así que lo ejecutan el agente y la persona, desde cualquier carpeta del clon y sin que haga falta un cambio abierto. No toma el bloqueo del cambio, porque no cambia su estado. Corre en el turno de la verificación completa y con todas las plazas del clon (`oneAtATime`), con el comando de la verificación completa (`fullCommand`).
  - impacto: alto
- A2: Ejecuta las unidades en el orden de la configuración, todas, también las que siguen a una que falló dos veces, para dar el cuadro completo. Cada intento corre con `verify.timeoutSec` y a baja prioridad, como las verificaciones; uno que se corta cuenta como fallo. Antes de cada intento dice por la salida de error qué ejecuta.
  - impacto: alto
- A3: Las huellas se toman antes de empezar, con la misma lectura del árbol que usa `accept` (`printsOf` en `flow/units.ts`). Las unidades que pasan, a la primera o al repetirlas, se anotan en el registro como en `accept`, porque pasaron con ese código. El campo `change` del registro es el cambio abierto de la carpeta, y sin cambio abierto no va.
  - impacto: alto
- A4: Una unidad inestable queda como lección con sus `paths`, y una que falla las dos veces como pendiente, con el cambio abierto de la carpeta como origen si lo hay, como `close` deja sus pendientes (`harvestEntries`, que pasa a aceptar un origen sin cambio). El texto nombra la unidad y su comando y no lleva la salida del fallo, para que una unidad que vuelve a fallar no anote otra entrada igual mientras la primera siga abierta.
  - impacto: alto
- A5: Sin `verify.units`, `verify.full` se ejecuta del mismo modo como una sola unidad sin nombre. Al no tener rutas a las que atar una lección, si es inestable queda como pendiente, y nada se anota en el registro, que es de unidades.
- A6: El comando sale con 1 si alguna unidad falló las dos veces, y con 0 si todas pasaron, aunque alguna fuera inestable. Sin `--fresh`, o sin `verify.full` ni `verify.units`, no ejecuta nada, dice por qué y sale con 1.

## Criterios de aceptación

- AC1: CUANDO se ejecuta `specty verify --fresh` con `verify.units` ENTONCES corre todas las unidades en orden sin mirar el registro, también las que siguen a una que falla, repite una vez la que falla, anota en el registro las que pasan, y la salida da el resultado y el tiempo de cada una.
- AC2: CUANDO en `specty verify --fresh` una unidad falla y pasa al repetirla ENTONCES queda en la memoria como lección de sus `paths` y el comando sale con 0; si falla las dos veces, queda como pendiente y el comando sale con 1, con la salida del fallo.
- AC3: CUANDO no hay `verify.units` ENTONCES `specty verify --fresh` ejecuta `verify.full` del mismo modo, y si es inestable queda en la memoria como pendiente.
- AC4: CUANDO se ejecuta `specty verify` sin `--fresh`, o sin `verify.full` ni `verify.units` ENTONCES no ejecuta nada, dice por qué y sale con 1.
- AC5: CUANDO salen la salida de `specty verify --fresh`, sus rechazos y los textos que deja en la memoria ENTONCES salen en español y en inglés.

## Diseño

- Core: `cards/fresh.ts` (nuevo) da `freshCard`, la tarjeta con el resultado y el tiempo de cada unidad, la salida de las que fallaron, las entradas que dejó en la memoria y las que anotó en el registro; `freshProgressLine`, la línea antes de cada intento; `freshMemoryText`, el texto de la lección o del pendiente, y `freshRefusalCard`. Con los tipos `FreshUnit` y `FreshResult`, exportados en `cards/index.ts`.
- CLI: `commands/verify.ts` (nuevo) registra `specty verify --fresh` entre los comandos del agente (`agent-commands.ts`), ejecuta los intentos con `execute` dentro de `oneAtATime`, anota en el registro con `record` y en la memoria con `rememberEntries`. `flow/units.ts` exporta `printsOf`, `record` y `Printed`, y `record` acepta un registro sin cambio. `flow/archive-memory.ts` da `rememberEntries(session, change, items)`, con el cambio opcional, y `harvestEntries` la llama con el del estado.
- Docs: ARCHITECTURE §6 (el comando) y §9 (la verificación fresca y el registro); formats.md §1 (`change` opcional en `verified/`) y §6 (`verify.units` y `verify --fresh`).

## Archivos

- crear packages/core/src/cards/fresh.ts — los textos de `specty verify --fresh`, en español y en inglés
- modificar packages/core/src/cards/index.ts — exportar los textos
- crear packages/core/test/cards/fresh.test.ts — los textos de la verificación fresca
- crear packages/cli/src/commands/verify.ts — `specty verify --fresh`
- modificar packages/cli/src/commands/agent-commands.ts — registrar `verify`
- modificar packages/cli/src/flow/units.ts — exportar las huellas y el registro, con un registro sin cambio
- modificar packages/cli/src/flow/archive-memory.ts — anotar en la memoria con un origen sin cambio
- crear packages/cli/test/verify-fresh.test.ts — `specty verify --fresh`, de punta a punta
- modificar docs/ARCHITECTURE.md — el comando y la verificación fresca
- modificar docs/formats.md — `change` opcional en `verified/` y `verify --fresh`

## Tareas

- [x] T1: Los textos de la verificación fresca
  - files: packages/core/src/cards/fresh.ts, packages/core/src/cards/index.ts, packages/core/test/cards/fresh.test.ts
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/fresh.test.ts && pnpm --filter @baquia-dev/specty-core typecheck
  - type: feat
- [x] T2: specty verify --fresh ejecuta todo, repite lo que falla y lo anota en la memoria
  - files: packages/cli/src/commands/verify.ts, packages/cli/src/commands/agent-commands.ts, packages/cli/src/flow/units.ts, packages/cli/src/flow/archive-memory.ts, packages/cli/test/verify-fresh.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/verify-fresh.test.ts test/accept-units.test.ts test/risk-lessons.test.ts test/close-harvest.test.ts && pnpm typecheck && pnpm lint && pnpm knip && pnpm sources
  - type: feat
- [x] T3: La documentación de la verificación fresca
  - files: docs/ARCHITECTURE.md, docs/formats.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: Una unidad que falla por el trabajo a medias de un cambio deja un pendiente que no es de main — el texto nombra la unidad y el origen es el cambio de la carpeta, así que la persona lo descarta con `specty memory drop` si no aplica.
- R2: La verificación fresca tarda lo que `verify.full` o más, por los reintentos, y ocupa el turno y todas las plazas — es para cuando se quiere el cuadro completo, no para cada cambio.
