---
kind: standard
epic: 20261107-flujo-configurable-en-la-ui
slice: C18
---

# La caducidad de los bloqueos y del índice de restos pasa a ser un ajuste interno

## Objetivo

Hoy cuánto conserva su puesto en la cola de las verificaciones un proceso que deja de renovarlo (30 s) y cuánto deja `specty prune` un índice temporal de git (1 h) están fijos en el código de la CLI. Con este cambio son claves opcionales de `.specty/config.yaml` bajo `internal` (`internal.waits.queueStaleSec` e `internal.retention.indexHours`), con mínimos y máximos en el schema y los valores de hoy por defecto, y la página «Configuración» las muestra en «Interno» con la marca «Nuevo». La vida de la marca de `specty wait` (30 s) protege el fin de turno del agente, así que queda fija, sin clave, y «Interno» la muestra como garantía con candado (A10 de la épica). Es el corte C18 de la épica: cubre sus AC22, AC25 y AC26 para estos parámetros.

## Fuera de alcance

- Los intervalos de sondeo (`POLL_MS` de `flow/full-verification.ts` y de `store/verify-slots.ts`, y el `--interval` de `specty wait`), que son de C17.
- Cambiar la vida de la marca de `specty wait` o las cuatro vidas del cumplimiento de C8: siguen fijas y con candado.
- El turno de la verificación completa (`locks/full-verification.json`), las plazas de verificación y el bloqueo de cada cambio, que se liberan cuando su proceso termina y no caducan por tiempo.
- El código de la página «Configuración»: «Interno», su pliegue, la marca «Nuevo» y las garantías ya muestran cualquier ajuste del catálogo.

## Supuestos

- A1: Las claves son `internal.waits.queueStaleSec` (30 por defecto, un entero entre 10 y 600) e `internal.retention.indexHours` (1, un entero entre 1 y 168). El mínimo de la cola son cinco vueltas del sondeo de hoy (2 s), para que un proceso vivo no pierda su puesto entre dos vueltas. El de los índices es el valor de hoy, porque `treeWith` usa el suyo unos segundos y uno más joven puede ser de un proceso vivo. Los máximos acotan cuánto frena la cola un proceso colgado y cuánto se acumulan los restos.
  - impacto: medio
- A2: Ninguna de las dos forma parte del cumplimiento. La cola solo ordena quién intenta el turno de la verificación completa o una plaza de verificación; cuántas corren a la vez lo deciden el turno y las plazas, que no caducan por tiempo. Los índices temporales solo los lee `treeWith` mientras dura una lectura, y con el mínimo de 1 h `prune` no borra ninguno antes que hoy.
  - impacto: alto
- A3: La vida de la marca de `specty wait` (30 s, o tres vueltas de su intervalo si son más) sí forma parte del cumplimiento. El fin de turno del agente lo deja terminar mientras un `wait` del cambio sigue vivo, y una marca que viviera más dejaría terminar el turno con un `wait` colgado, o con su número de proceso ya en otro programa, sin que nadie espere a la persona. Es el caso de los pendientes del guard de C8: queda fija, sin clave, y el catálogo la muestra en «Interno» como garantía con candado (`guarantee.waitMarks`, 30 s). Así las vidas de A10 de la épica pasan de cuatro a cinco.
  - impacto: alto
- A4: Las claves van en el módulo de C8 y C11, `schema/internal-waits.ts`: `queueStaleSec` en su bloque `waits` e `indexHours` en `retention`. Así `ResolvedConfig.internal` las tiene sin tocar `config.ts`. C17 añade en paralelo los intervalos de sondeo, quizá en el mismo módulo y en el catálogo; al incorporar main se conservan las dos partes.
  - impacto: medio
- A5: La tarjeta de `prune` dice las horas que usó: «de más de una hora» con 1, como hoy, y «de más de N horas» con más, en los dos idiomas. Así sus tests de hoy siguen igual.
  - impacto: bajo
- A6: La página «Configuración» y sus tests no cambian: muestra cualquier ajuste y garantía del catálogo (la garantía con su valor y su unidad, «30 s»), y sus tests de «Interno» sacan las listas del catálogo (A7 de C11). Los tests del catálogo que enumeran los ajustes nuevos, los de «Interno», las garantías y su número se amplían en la fase de tests.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO `.specty/config.yaml` tiene `internal.waits.queueStaleSec` y el puesto de un proceso vivo en la cola del turno de la verificación completa, o en la de las plazas de verificación, lleva más de esos segundos sin renovarse ENTONCES el siguiente que mira no lo cuenta, lo quita y no espera por él. Con uno que lleva menos, espera a que ese proceso termine. Sin la clave, cuenta 30 s, como hoy.
- AC2: CUANDO `.specty/config.yaml` tiene `internal.retention.indexHours` ENTONCES `specty prune` borra los índices temporales de git de más de esas horas, guarda los más jóvenes y su salida dice esas horas. Sin la clave, borra los de más de una hora y lo dice como hoy.
- AC3: CUANDO una de esas claves queda fuera de sus límites (la cola entre 10 y 600 s, los índices entre 1 y 168 h) o no es un entero ENTONCES el validador del core da un error con su clave, y Specty no usa el archivo, como con cualquier error de `config.yaml`.
- AC4: CUANDO la persona abre «Configuración» y despliega «Interno» ENTONCES ve los dos ajustes con la marca «Nuevo», su clave y su valor, en `s` y en `h`. Ve también la vida de la marca de `specty wait` como garantía, con candado, su valor fijo de 30 s, sin clave ni control y con la razón en su descripción.
- AC5: CUANDO la UI está en inglés ENTONCES los nombres y las descripciones de los dos ajustes y de la garantía salen en inglés, y cada uno los tiene en español y en inglés; la línea de los índices de la tarjeta de `prune` también.
- AC6: CUANDO se lee `docs/formats.md` ENTONCES §6 documenta las dos claves con sus valores por defecto y sus límites y la garantía de la marca de `wait`, y §1 remite a ellas en lugar de a los valores fijos.
  - test: manual

## Diseño

- Core, `schema/internal-waits.ts`: `waits.queueStaleSec` y `retention.indexHours`, con sus valores en `DEFAULT_INTERNAL_WAITS`, sus `int`, `min` y `max` en `INTERNAL_WAITS_SHAPE` y su resolución en `resolveInternalWaits`.
- Core, `settings/catalog.ts`: `internal.waits.queueStaleSec` (`unit: "s"`) tras `heartbeatSec` e `internal.retention.indexHours` (`unit: "h"`) tras `verifiedDays`, los dos con `new: true`; y `guarantee.waitMarks` (`fixed: 30`, `unit: "s"`, `guarantee: true`) tras las cuatro de C8.
- Core, `cards/settings-internal.ts`: los nombres y las descripciones de los tres, en español y en inglés.
- Core, `cards/parallel.ts`: `Leftovers` gana `hours` (opcional, 1 por defecto), que la línea de los índices dice.
- CLI, `store/turn-queue.ts`: `STALE_MS` deja paso a un parámetro `staleSec` de `joinQueue` y `joinTurnQueue`; `flow/full-verification.ts` y `store/verify-slots.ts` les pasan `session.config.internal.waits.queueStaleSec`.
- CLI, `store/leftovers.ts`: `INDEX_LIFE` deja paso a un parámetro `hours` de `removeLeftovers`, que lo devuelve con lo que borró; `commands/prune.ts` le pasa `session.config.internal.retention.indexHours`.
- Tests: `core/test/settings/internal-life.test.ts` (nuevo: AC3, AC4, AC5), las listas exactas de `core/test/settings/catalog.test.ts`, `core/test/cards/prune-leftovers.test.ts` (AC2, AC5), `cli/src/store/turn-queue.test.ts` (nuevo: AC1, por `oneAtATime` y por `inSlots`, con el puesto de un proceso vivo envejecido con `utimes`) y `cli/test/prune-leftovers.test.ts` (AC2).

## Archivos

- modificar packages/core/src/schema/internal-waits.ts — las claves `internal.waits.queueStaleSec` e `internal.retention.indexHours`, con sus límites y los valores de hoy
- modificar packages/core/src/settings/catalog.ts — los dos ajustes nuevos y la garantía de la marca de `wait` en «Interno»
- modificar packages/core/src/cards/settings-internal.ts — sus nombres y descripciones en español y en inglés
- modificar packages/core/src/cards/parallel.ts — la línea de los índices de `prune` dice sus horas
- crear packages/core/test/settings/internal-life.test.ts — los límites, el catálogo y los textos de los nuevos
- modificar packages/core/test/settings/catalog.test.ts — las listas de los ajustes nuevos, de «Interno» y de las garantías
- modificar packages/core/test/cards/prune-leftovers.test.ts — la línea de los índices con horas
- modificar packages/cli/src/store/turn-queue.ts — la caducidad de los puestos como parámetro
- modificar packages/cli/src/flow/full-verification.ts — pasa a la cola del turno la caducidad de la configuración
- modificar packages/cli/src/store/verify-slots.ts — pasa a la cola de las plazas la caducidad de la configuración
- crear packages/cli/src/store/turn-queue.test.ts — la caducidad configurada de las dos colas
- modificar packages/cli/src/store/leftovers.ts — la vida de los índices como parámetro
- modificar packages/cli/src/commands/prune.ts — pasa las horas de la configuración
- modificar packages/cli/test/prune-leftovers.test.ts — las horas configuradas de los índices
- modificar docs/formats.md — §1 y §6: las claves nuevas y la garantía
- modificar docs/ARCHITECTURE.md — la cola del turno remite a su clave
- modificar docs/ui.md — «Interno» muestra cinco garantías

## Tareas

- [x] T1: Las claves de la cola y de los índices, y sus ajustes y la garantía de la marca de `wait` en «Interno»
  - files: packages/core/src/schema/internal-waits.ts, packages/core/src/settings/catalog.ts, packages/core/src/cards/settings-internal.ts, packages/core/test/settings/internal-life.test.ts, packages/core/test/settings/catalog.test.ts
  - ac: AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/settings/internal-life.test.ts test/settings/catalog.test.ts
- [x] T2: La tarjeta de `prune` dice las horas de los índices, y los documentos, las claves y la garantía
  - files: packages/core/src/cards/parallel.ts, packages/core/test/cards/prune-leftovers.test.ts, docs/formats.md, docs/ui.md
  - ac: AC2, AC5, AC6
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/prune-leftovers.test.ts
- [x] T3: Las colas de las verificaciones caducan los puestos según la configuración
  - files: packages/cli/src/store/turn-queue.ts, packages/cli/src/flow/full-verification.ts, packages/cli/src/store/verify-slots.ts, packages/cli/src/store/turn-queue.test.ts, docs/ARCHITECTURE.md
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run src/store/turn-queue.test.ts
- [x] T4: `specty prune` borra los índices temporales según la configuración
  - files: packages/cli/src/store/leftovers.ts, packages/cli/src/commands/prune.ts, packages/cli/test/prune-leftovers.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/prune-leftovers.test.ts && pnpm typecheck

## Riesgos

- R1: C17 hace configurable el sondeo de esas mismas colas, y un sondeo más largo que la caducidad haría que los que esperan se quitaran el puesto unos a otros. Mitigación: el mínimo de la caducidad (10 s) son cinco vueltas del sondeo de hoy, y la memoria avisa a C17 de que su máximo quede por debajo de un tercio de ese mínimo, o de que la cola compare con max(caducidad, 3 × sondeo), como la marca de `wait`.
- R2: C17 toca en paralelo `flow/full-verification.ts`, `store/verify-slots.ts`, el catálogo, `schema/internal-waits.ts` y `docs/formats.md`. Mitigación: aquí solo cambia la llamada a la cola en los dos primeros y se añaden líneas sueltas en los demás; al incorporar main se conservan las dos partes.
