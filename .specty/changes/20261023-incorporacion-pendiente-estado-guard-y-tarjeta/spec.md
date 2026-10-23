---
kind: standard
---

# Incorporación pendiente: estado, guard y tarjeta

## Objetivo

Core aprende qué es una incorporación pendiente, para que un conflicto al incorporar la rama principal lo resuelva el agente en la worktree del cambio que lo causa. Para eso, el estado del cambio la registra, el guard deja tocar solo los archivos que junta la fusión y `specty next` le dice al agente qué resolver. Hoy, con conflictos o con la verificación en rojo, `close` aborta y la persona incorpora `main` a mano. Este cambio pone las piezas de core, y el siguiente hace que la CLI deje el merge en curso para el agente.

## Fuera de alcance

- La CLI. Que `close` y `accept` dejen el merge en curso y registren la incorporación, el comando del agente que la termina (`specty integrate`), y pasar la incorporación al guard, a `next` y a `status`: es el siguiente cambio de la serie.
- Que el agente resuelva el reintento de un cambio ya cerrado (fase `done`): sigue a mano.
- La UI.

## Supuestos

- A1: La incorporación pendiente vive en `state.json`, en un campo `integration`. Guarda la rama destino, el commit que se incorpora, el motivo (`conflicts` o `verify`), los archivos en conflicto, los que puede tocar el agente y la fecha, y al resolverse añade `resolved` con el commit de merge y la fecha. No va en el estado local de git porque la UI y el historial la necesitan, y se conserva una vez resuelta para que la persona vea al cerrar qué resolvió el agente.
  - impacto: alto
- A2: Mientras está pendiente, el agente solo puede escribir y borrar los archivos que cambió cualquiera de los dos lados desde la base común (la rama del cambio y la principal), más sus tests implícitos y los archivos generados, como en una tarea. Le basta para resolver los conflictos y arreglar lo que rompa la verificación, sin tocar nada más.
  - impacto: alto
- A3: La fase no cambia: sigue `closing`, o `acceptance` en un quick. La incorporación pendiente solo cambia el acceso al código y a quién se espera (al agente), así que la máquina de estados no necesita una fase nueva.
- A4: Con la incorporación pendiente, si el agente intenta `git commit`, el guard le propone `specty integrate` en lugar de `task done`.

## Criterios de aceptación

- AC1: CUANDO `state.json` trae `integration` ENTONCES se valida su forma (motivo `conflicts` o `verify`, commits como SHA, `resolved` opcional), y un estado sin `integration` sigue siendo válido.
- AC2: CUANDO hay una incorporación pendiente ENTONCES `phasePermissions` da al código el acceso `integration` y espera al agente, tanto en `closing` como en `acceptance`; sin ella o ya resuelta, los permisos son los de siempre.
- AC3: CUANDO hay una incorporación pendiente ENTONCES el guard permite escribir y borrar los archivos que junta, sus tests implícitos y los generados, y bloquea cualquier otro archivo gobernado con un motivo que nombra la rama destino y un SIGUIENTE que lleva a `specty integrate`.
- AC4: CUANDO hay una incorporación pendiente y el agente intenta `git commit` ENTONCES el guard lo bloquea con el SIGUIENTE `specty integrate`.
- AC5: CUANDO hay una incorporación pendiente ENTONCES la tarjeta de `next` muestra la rama destino, el motivo (los conflictos con su lista, o la verificación en rojo), los archivos que se pueden tocar (los primeros 20 y cuántos más hay) y el SIGUIENTE «resuélvelo… y ejecuta `specty integrate`»; ya resuelta, la tarjeta vuelve a ser la de la fase.

## Diseño

- `schema/state.ts`: `integration` opcional con `target`, `commit`, `reason`, `conflicts`, `paths`, `at` y `resolved` (`commit`, `at`).
- `flow/phases.ts`: `CodeAccess` suma `"integration"`, y `phasePermissions(phase, closingSubmitted, integrating)` lo devuelve, esperando al agente, cuando `integrating` es verdadero. La spec conserva el acceso de su fase.
- `guard/integration.ts` (nuevo): `decideIntegration(path, integration, ctx)` clasifica la ruta con `classifyPath`, con los archivos de la incorporación como si fueran los de una tarea. Fuera de ellos, deniega con la regla nueva `integration`. También incluye el SIGUIENTE de `git commit` durante la incorporación. Va aparte porque `decide.ts` está cerca de las 300 líneas.
- `guard/decide.ts`: `GuardChange.integration` opcional (`target`, `paths`). `decidePath` lo consulta antes que la fase, y la denegación de `git commit` usa el SIGUIENTE de la incorporación.
- `cards/view.ts`: `ChangeView.integration` opcional (`target`, `reason`, `conflicts`, `paths`), solo mientras está pendiente.
- `cards/integration.ts` (nuevo): `integrationCard(change, ctx)`. `cards/next.ts` la devuelve antes de mirar la fase.
- `index.ts` exporta lo nuevo.

## Archivos

- modificar packages/core/src/schema/state.ts — campo `integration`
- modificar packages/core/src/flow/phases.ts — acceso `integration` al código
- crear packages/core/src/guard/integration.ts — decisión del guard durante la incorporación
- modificar packages/core/src/guard/decide.ts — `GuardChange.integration` y su uso
- modificar packages/core/src/cards/view.ts — `ChangeView.integration`
- crear packages/core/src/cards/integration.ts — tarjeta de la incorporación pendiente
- modificar packages/core/src/cards/next.ts — `next` muestra la incorporación pendiente
- modificar packages/core/src/index.ts — exportaciones
- modificar packages/core/test/schema/schema.test.ts — `integration` en `state.json`
- modificar packages/core/test/flow/machine.test.ts — permisos con la incorporación pendiente
- modificar packages/core/test/guard/decide.test.ts — el guard durante la incorporación
- modificar packages/core/test/cards.test.ts — la tarjeta
- modificar docs/formats.md — §3: `integration` en `state.json`
- modificar docs/ARCHITECTURE.md — §4: permisos durante la incorporación; §10: el guard

## Tareas

- [x] T1: Estado y permisos de la incorporación pendiente
  - files: packages/core/src/schema/state.ts, packages/core/src/flow/phases.ts, packages/core/src/index.ts, packages/core/test/schema/schema.test.ts, packages/core/test/flow/machine.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/schema test/flow
- [x] T2: El guard durante la incorporación
  - files: packages/core/src/guard/integration.ts, packages/core/src/guard/decide.ts, packages/core/src/index.ts, packages/core/test/guard/decide.test.ts
  - ac: AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/guard
- [ ] T3: La tarjeta de la incorporación pendiente
  - files: packages/core/src/cards/view.ts, packages/core/src/cards/integration.ts, packages/core/src/cards/next.ts, packages/core/src/index.ts, packages/core/test/cards.test.ts
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards.test.ts
- [ ] T4: Documentar la incorporación pendiente
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm check
  - type: docs

## Riesgos

- R1: Si la rama principal avanzó mucho, la lista de archivos que se pueden tocar es larga y abulta `state.json` — es lo justo para resolver la fusión, y la tarjeta muestra solo los primeros 20.
- R2: Hasta el siguiente cambio nada escribe `integration`, así que esto no se ve en uso — las pruebas cubren el estado, el guard y la tarjeta por separado, y el siguiente cambio prueba el flujo completo.
