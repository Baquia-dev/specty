---
kind: standard
epic: 20261107-verificacion-sin-repetir
slice: C3
---

# «Verificar» de la UI incorpora main antes de verificar

## Objetivo

Hoy «Verificar» en la UI verifica la rama del cambio sin main, y después «Aceptar» incorpora main y vuelve a verificar: dos verificaciones completas. Con este cambio, si main avanzó desde la rama del cambio, «Verificar» incorpora main primero, con el mismo paso que `accept`, y verifica una sola vez el código incorporado. Así, «Aceptar» encuentra esa verificación anotada y no la repite mientras main no avance otra vez.

## Fuera de alcance

- Cambiar la UI: el botón, la sección de la verificación completa con su bloque en vivo y la bandeja con el cambio que espera al agente ya muestran lo que hace falta.
- Cortar la verificación de la incorporación al cerrar el servidor: corre en el proceso, como la de `accept`, y termina con su `verify.timeoutSec`.
- Verificar desde la UI fuera de aceptación o en un cambio que Specty no incorpora (sin rama propia, un spike, `mode: team`): sigue como hoy.
- Los demás flujos de la épica (cortes C1, C2 y C4).

## Supuestos

- A1: «Verificar» incorpora main solo si la rama del cambio no contiene la rama destino (`integrationOf` y `contains` de `flow/integrate.ts`), y lo hace con el mismo paso que `accept`: `mergeTarget` con `again: "accept"`. En verde, ese paso hace el commit del merge y anota `change.verified` con el `tree` del código incorporado. Con conflictos o en rojo, deja el merge en curso para el agente y lo anota en el estado (`integration`). Si main no avanzó, corre como hoy con `runFull` del servidor.
  - impacto: alto
- A2: La incorporación cambia el estado, así que va en la cola de las acciones de la persona del servidor (`serial` de `http.ts`), dentro del turno de sus verificaciones completas (`inTurn`) y con el bloqueo del cambio frente a otros procesos (`lockChange`). Así, un «Aceptar» pulsado mientras dura espera a que termine y no vuelve a verificar. Mientras tanto, las demás acciones de la UI esperan, como ya esperan a un «Aceptar» que verifica. Sin merge, «Verificar» sigue fuera de la cola.
  - impacto: alto
- A3: La ejecución en vivo de «Verificar» con incorporación muestra primero sus propias líneas: la nota de lo que verifica y la espera del turno. Después muestra las de `runLive` de la incorporación, que el servidor ya lee del almacén de ejecuciones (`store/runs.ts`), una unidad tras otra. Al terminar añade lo que dijo la incorporación: la línea del merge o el motivo por el que se quedó. Solo entonces se oye su fin, con el resultado ya anotado.
  - impacto: medio
- A4: Si el agente aún resuelve una incorporación anterior (su merge sigue en curso), «Verificar» se rechaza al momento con el texto de `accept` (`pendingIntegration`). Un merge que alguien abortó se olvida, como en `accept`.
  - impacto: medio
- A5: Lo que la para sin mover nada una vez en marcha solo sale en su salida en vivo, que termina sin resultado: cambios sin commit que el merge cambiaría, una configuración fusionada no válida, otro proceso con el cambio bloqueado o un cambio que ya no está en aceptación. «Aceptar» lo vuelve a decir, porque hace la misma incorporación.
  - impacto: bajo
- A6: El único texto nuevo es la respuesta de «Verificar» cuando main se incorpora antes. Va en español y en inglés en `packages/core/src/cards/server.ts`, como la respuesta de siempre (`runStartedCard`).
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO la persona pulsa «Verificar» en la UI con el cambio en aceptación y main avanzó desde la rama del cambio ENTONCES la respuesta dice que main se incorpora antes de verificar, Specty lo incorpora en la carpeta del cambio y verifica una vez el código incorporado, en vivo, y en verde hace el commit del merge y anota `change.verified` con el `tree` de ese código; después `specty accept` no vuelve a fusionar ni a verificar y dice que ya pasó.
- AC2: CUANDO esa incorporación tiene conflictos o su verificación falla ENTONCES el merge queda en curso en la carpeta del cambio, el estado lleva la incorporación pendiente para el agente (`integration`, con su motivo), no se anota `change.verified` y la salida en vivo dice por qué; CUANDO la persona pulsa «Verificar» otra vez mientras el agente la resuelve ENTONCES se rechaza diciendo que el agente aún resuelve la incorporación.
- AC3: CUANDO la persona pulsa «Verificar» y main no avanzó ENTONCES corre como hoy: sin merge, con la respuesta de siempre y su resultado en `change.verified`.
- AC4: CUANDO la cola de las acciones de la persona del servidor está ocupada ENTONCES la incorporación de «Verificar» no empieza hasta que se libera.
- AC5: CUANDO sale la respuesta de «Verificar» con main por incorporar ENTONCES sale en español y en inglés.

## Diseño

- Core: `runStartedCard` (`cards/server.ts`) recibe la rama destino cuando se incorpora antes y lo dice.
- `server/runs.ts`: `start` mira si la rama del cambio contiene la destino; si no, rechaza mientras el agente resuelve una incorporación (`pendingIntegration`) y lanza `runMerged`, que muestra su ejecución enseguida y corre en `inTurn` y en la cola (`queued`, que `http.ts` llena con su `serial`). Su ejecución en vivo sigue la de `runLive` del almacén: el vigilante de esas ejecuciones se la pasa (`follow`) en vez de callarla, y la ejecución la junta tras sus propias líneas, por partes, una por ejecución de `runLive`. Su fin se oye tras el resultado, y el vigilante olvida lo que vio para no repetirlo.
- `server/merged-run.ts` (nuevo): el cuerpo de la incorporación, con la sesión cuya salida de error va a la ejecución en vivo. Vuelve a leer el cambio, sigue solo en aceptación, aplica `pendingIntegration`, toma el bloqueo del cambio y llama a `mergeTarget`. Devuelve las líneas que dijo: las del merge o la tarjeta del motivo (`renderText`).
- `server/watched-runs.ts` (nuevo): el vigilante de las ejecuciones que otros procesos dejan en el almacén (`taskRuns` y `alive`), que sale de `runs.ts` sin cambiar para que este no pase del aviso de tamaño.
- Tests: `packages/cli/test/server/verify-merge.test.ts` (nuevo), sobre `changeRuns`, con el cambio en su worktree y main que avanza. Cuenta las verificaciones en `$(git rev-parse --git-common-dir)/runs`, como `integrate.test.ts`, y su comando tarda lo bastante para que el vigilante vea su salida.

## Archivos

- modificar packages/core/src/cards/server.ts — la respuesta de «Verificar» dice cuándo se incorpora main antes
- modificar packages/core/test/cards/server.test.ts — test de esa respuesta en los dos idiomas
- modificar packages/cli/src/server/runs.ts — «Verificar» incorpora main cuando avanzó, en la cola, y sigue la ejecución de la incorporación
- crear packages/cli/src/server/merged-run.ts — la incorporación de «Verificar»: el paso de `accept` con el bloqueo del cambio
- crear packages/cli/src/server/watched-runs.ts — el vigilante de las ejecuciones del almacén, fuera de `runs.ts`
- modificar packages/cli/src/server/http.ts — pasa su cola de acciones a las ejecuciones
- crear packages/cli/test/server/verify-merge.test.ts — tests de «Verificar» con main que avanzó y sin él
- modificar docs/ui.md — «Verificar» incorpora main si avanzó
- modificar docs/ARCHITECTURE.md — «Verificación completa desde la UI» incorpora main y entonces va en la cola
- modificar docs/formats.md — `integration.started` también lo deja «Verificar» de la UI

## Tareas

- [x] T1: La respuesta de «Verificar» dice cuándo se incorpora main antes
  - files: packages/core/src/cards/server.ts, packages/core/test/cards/server.test.ts
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/server.test.ts && pnpm lint
  - type: feat
- [x] T2: El vigilante de las ejecuciones del almacén pasa a su propio archivo
  - files: packages/cli/src/server/runs.ts, packages/cli/src/server/watched-runs.ts
  - ac: —
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server/runs.test.ts test/server/runs-turn.test.ts test/server/live.test.ts && pnpm lint
  - type: refactor
- [x] T3: «Verificar» incorpora main cuando avanzó y verifica una vez el código incorporado
  - files: packages/cli/src/server/runs.ts, packages/cli/src/server/merged-run.ts, packages/cli/src/server/http.ts, packages/cli/test/server/verify-merge.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server/verify-merge.test.ts test/server/runs.test.ts test/server/runs-turn.test.ts test/server/verify.test.ts && pnpm typecheck && pnpm lint
  - type: feat
- [ ] T4: La documentación cuenta que «Verificar» incorpora main
  - files: docs/ui.md, docs/ARCHITECTURE.md, docs/formats.md
  - ac: AC1
  - verify: grep -q 'incorpora main antes' docs/ui.md && grep -q 'va en la cola de las acciones' docs/ARCHITECTURE.md && grep -q 'al verificar desde la UI' docs/formats.md
  - type: docs

## Riesgos

- R1: Que «Verificar» haga un merge sorprende a quien esperaba una acción sin efectos. Mitigación: la respuesta lo dice, es lo mismo que hacen «Aceptar» y `accept` en la terminal antes de verificar, y `docs/ui.md` lo cuenta.
- R2: Mientras la incorporación verifica, ocupa la cola de acciones del servidor y las demás acciones de la UI esperan. Mitigación: ya pasa con «Aceptar», que verifica en la misma cola, y solo ocurre cuando main avanzó; sin merge, «Verificar» sigue fuera de la cola.
