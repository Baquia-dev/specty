---
kind: standard
epic: 20261105-verificacion-por-unidades
slice: C2
---

# La incorporación, integrate y la UI verifican por unidades

## Objetivo

Desde el corte C1, la verificación completa de `accept` ejecuta solo las unidades de `verify.units` que no pasaron ya con su huella. Pero la incorporación de main (dentro de `accept` y al cerrar), `specty integrate` y la verificación que la persona lanza desde la UI siguen ejecutando `verify.full` entero, y si main avanzó, `accept` corre las dos. Con este cambio, las tres usan las unidades y el registro del clon como `accept`: solo corren las que faltan, y las que pasan quedan anotadas para las demás. Es el corte C2 de la épica `20261105-verificacion-por-unidades` (AC5 de la épica).

## Fuera de alcance

- Configurar las unidades de este repositorio: es el corte C3.
- `specty verify --fresh` y los tests inestables (corte C4), y el aviso de los tests lentos (corte C5).
- Mostrar en la UI qué unidades se reutilizaron en la última verificación: la UI sigue mostrando `change.verified` como hoy.
- Borrar archivos viejos del registro (P125).

## Supuestos

- A1: La incorporación, `specty integrate` y la UI eligen la verificación completa con `fullCommand` y `fullPlan` del corte C1 (`verify.units`, si no `verify.full`, y si no `verify.default` en la incorporación y en `integrate`, como hoy). Con unidades, corren solo las que no pasaron, en orden, en un turno con todas las plazas, y antes de cada una se vuelve a mirar el registro. La primera que falla para las siguientes, y solo se anotan las que pasan.
  - impacto: alto
- A2: La verificación de la incorporación y la de `specty integrate` corren con `runFull` del corte C1, también sin unidades: en vivo (`runLive`, con su archivo de `runs/`), como la de `accept`, en lugar del `execute` sin archivo de hoy. Así la UI las ve mientras corren.
  - impacto: alto
- A3: Si todas las unidades ya pasaron, la incorporación y `specty integrate` no ejecutan nada ni piden el turno. La incorporación no anota `change.verified`, como `accept` en el corte C1, y su línea lo dice. `specty integrate` lo dice en su salida de error.
- A4: La línea de una incorporación por unidades dice que pasaron las unidades de su verificación completa, y le siguen las líneas del corte C1 (`unitsLines`). La incorporación de un cambio abierto anota `change.verified` con `units`, y el comando de todas las unidades unidas con ` && `, así que la verificación de `accept` no las repite. Si una falla, el motivo nombra el comando de la que falló, y el detalle da su salida y las líneas de las unidades.
- A5: `specty integrate` da por la salida de error lo que hicieron las unidades, como la nota de `accept`. Si una falla, el detalle de su tarjeta es la salida de la que falló.
- A6: En la UI, el servidor calcula las unidades que faltan cuando tiene el turno. Las ejecuta en orden, cada una en un proceso, con su salida en vivo en la misma ejecución, y su tiempo límite es `verify.timeoutSec` para cada unidad. `change.verified` lleva `units`, con la salida de la última que corrió. Si ya pasaron todas, la ejecución termina sin ejecutar nada y se anota igual, con todas en `reused`, porque la persona la pidió. La tarjeta y la ejecución muestran el comando de todas las unidades unidas con ` && `.
  - impacto: alto
- A7: Con solo `verify.units`, sin `verify.full`, el aterrizaje también toma el turno de la verificación completa (`landingTurn`), con el comando de todas las unidades.

## Criterios de aceptación

- AC1: CUANDO `accept` o `close` incorporan una rama principal que avanzó y `.specty/config.yaml` da `verify.units` ENTONCES la verificación del merge ejecuta solo las unidades que no pasaron con su huella, anota en el registro las que pasan, y su línea dice qué unidades reutilizó y cuáles ejecutó.
- AC2: CUANDO la incorporación dentro de `accept` verificó el merge por unidades ENTONCES la verificación completa de `accept` no vuelve a ejecutar ninguna.
- AC3: CUANDO una unidad falla en la verificación del merge ENTONCES no ejecuta las siguientes, no la anota en el registro, y el merge queda para el agente con la salida de la que falló y las líneas de las unidades.
- AC4: CUANDO `specty integrate` verifica el merge resuelto con `verify.units` ENTONCES ejecuta solo las unidades que no pasaron, anota las que pasan, y si una falla no hace el commit del merge y da su salida.
- AC5: CUANDO la persona lanza la verificación completa desde la UI con `verify.units` ENTONCES el servidor ejecuta en orden solo las unidades que no pasaron, anota en el registro las que pasan, y `change.verified` lleva `units`, como en `accept`.
- AC6: CUANDO sale la línea de una incorporación verificada por unidades ENTONCES sale en español y en inglés.

## Diseño

- Core: en `cards/integration.ts`, el caso `passed` de `MergeVerification` admite `units` (`UnitsOutcome`), y `absorbedLine` dice entonces que pasaron las unidades de la verificación completa.
- CLI, `flow/full-verification.ts`: recibe `fullCommand` de `flow/units.ts`, con `unitsCommand` (los comandos unidos con ` && `), para que `landingTurn` los use sin un import circular. `landingTurn` toma el turno con `fullCommand ?? verify.default`.
- CLI, `flow/units.ts`: `runUnits(session, change, units, run)` se exporta y recibe `run`, que ejecuta un comando en el turno que ya tiene y da su código y su salida. `runFull` le pasa `runLive` con `held`.
- CLI, `flow/integrate.ts`: `mergeVerification` usa `fullCommand`, y la verificación del merge usa `fullPlan` y `runFull`. Devuelve la `MergeVerification` con sus `units`, que `commitAbsorbed` pone en la línea seguida de `unitsLines`.
- CLI, `commands/integrate.ts`: `failedVerification` usa `fullCommand`, `fullPlan` y `runFull` con el id del cambio.
- CLI, `server/runs.ts`: `start` usa `fullCommand`. En el turno, `fullPlan` y, con unidades, `runUnits` con un `run` que lanza cada comando como hoy el único (`spawned`), con su salida en la ejecución en vivo. `ended` anota `units` y añade `unitsLines` a la ejecución antes de terminarla.
- Docs: ARCHITECTURE §9 y formats.md §4 y §6 dejan de decir que la incorporación, `integrate` y la UI siguen con `verify.full`.

## Archivos

- modificar packages/core/src/cards/integration.ts — la línea de una incorporación verificada por unidades
- modificar packages/core/test/cards/incorporation.test.ts — sus textos en español y en inglés
- modificar packages/cli/src/flow/full-verification.ts — `fullCommand` y el turno del aterrizaje con unidades
- modificar packages/cli/src/flow/units.ts — `runUnits` con cómo ejecutar cada comando
- modificar packages/cli/src/flow/integrate.ts — la verificación del merge por unidades
- modificar packages/cli/src/commands/accept.ts — importar `fullCommand` de su nuevo sitio
- crear packages/cli/test/incorporation-units.test.ts — la incorporación por unidades, de punta a punta
- modificar packages/cli/src/commands/integrate.ts — `specty integrate` por unidades
- crear packages/cli/test/integrate-units.test.ts — `specty integrate` por unidades, de punta a punta
- modificar packages/cli/src/server/runs.ts — la verificación de la UI por unidades
- crear packages/cli/test/server/verify-units.test.ts — la verificación de la UI por unidades
- modificar docs/ARCHITECTURE.md — la incorporación, `integrate` y la UI con unidades
- modificar docs/formats.md — `change.verified` y `verify.units` en la incorporación, `integrate` y la UI

## Tareas

- [x] T1: La línea de una incorporación por unidades
  - files: packages/core/src/cards/integration.ts, packages/core/test/cards/incorporation.test.ts
  - ac: AC6
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/incorporation.test.ts && pnpm --filter @baquia-dev/specty-core typecheck
  - type: feat
- [x] T2: La incorporación de main verifica por unidades
  - files: packages/cli/src/flow/full-verification.ts, packages/cli/src/flow/units.ts, packages/cli/src/flow/integrate.ts, packages/cli/src/commands/accept.ts, packages/cli/test/incorporation-units.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/incorporation-units.test.ts test/accept-units.test.ts test/integrate.test.ts test/close-turn.test.ts test/delegated-integration.test.ts test/unverified.test.ts
  - type: feat
- [ ] T3: specty integrate verifica por unidades
  - files: packages/cli/src/commands/integrate.ts, packages/cli/test/integrate-units.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/integrate-units.test.ts test/integrate-turn.test.ts test/integrate-aborted.test.ts test/resolve.test.ts
  - type: feat
- [ ] T4: La verificación de la UI por unidades
  - files: packages/cli/src/server/runs.ts, packages/cli/test/server/verify-units.test.ts
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server/verify-units.test.ts test/server/verify.test.ts test/server/runs.test.ts test/server/runs-turn.test.ts && pnpm typecheck && pnpm lint && pnpm knip && pnpm sources
  - type: feat
- [ ] T5: La documentación de la incorporación, integrate y la UI por unidades
  - files: docs/ARCHITECTURE.md, docs/formats.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: La verificación de la incorporación pasa a correr en vivo también sin unidades, y la UI la ve como la verificación completa del cambio — es la misma que `accept` ya mostraba; la de un cambio cerrado deja un archivo de `runs/` que se borra al terminar.
- R2: Unos `paths` que no cubren lo que lee una unidad saltan tests en la incorporación como en `accept` — es responsabilidad de quien los escribe (A4 de la épica); el CI lo ejecuta todo.
