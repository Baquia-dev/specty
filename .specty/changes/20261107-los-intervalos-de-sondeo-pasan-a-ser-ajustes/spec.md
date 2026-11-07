---
kind: standard
epic: 20261107-flujo-configurable-en-la-ui
slice: C17
---

# Los intervalos de sondeo pasan a ser ajustes internos

## Objetivo

Hoy cada cuánto mira de nuevo una verificación que espera su turno o sus plazas (2 s) y cada cuánto mira `specty wait` si la persona ya decidió (500 ms, salvo `--interval`) están fijos en el código de la CLI. Con este cambio son claves opcionales de `.specty/config.yaml` bajo `internal` (`internal.waits.verifyIntervalMs` e `internal.waits.waitIntervalMs`), con mínimos y máximos en el schema y los valores de hoy por defecto, y la página «Configuración» las muestra en «Interno» con la marca «Nuevo». Es el corte C17 de la épica: cubre sus AC22, AC25 y AC26 para estos parámetros.

## Fuera de alcance

- La caducidad de los archivos de la cola y de la marca de `wait` (`STALE_MS` de `store/turn-queue.ts` y de `store/waits.ts`) y la vida de los índices temporales (`INDEX_LIFE` de `store/leftovers.ts`), que son de C18.
- Las cuatro vidas del cumplimiento (A10 de la épica), que siguen fijas en 24 h y con candado.
- Otros sondeos que no esperan un turno ni a la persona: el del servidor de `specty ui` sobre las ejecuciones en vivo (medio segundo), el reescrito de `flow/live-run.ts` (250 ms) y el de la persona simulada de las evals.
- El código de la página «Configuración»: la sección «Interno», su pliegue y la marca «Nuevo» ya muestran cualquier ajuste del catálogo, y sus tests sacan sus listas del catálogo.
- Cambiar `--interval`: si se pasa, sigue mandando sobre la clave, sin sus límites.

## Supuestos

- A1: Las claves son `internal.waits.verifyIntervalMs` (2000 por defecto) e `internal.waits.waitIntervalMs` (500), en milisegundos, como `--interval`, enteros entre 100 y 10000. Por debajo de 100 ms el sondeo da vueltas sin necesidad. Por encima de 10 s, una verificación que espera renovaría su archivo de la cola menos de tres veces en los 30 s que tarda en caducar, y la decisión de la persona tardaría en notarse.
  - impacto: medio
- A2: Una sola clave rige las dos esperas de la verificación, la del turno de la completa (`flow/full-verification.ts`) y la de las plazas (`store/verify-slots.ts`), porque las dos son la misma espera de una verificación y `oneAtATime` ya les pasa el mismo intervalo.
  - impacto: medio
- A3: Ninguna de las dos forma parte del cumplimiento: solo cambian cada cuánto se mira de nuevo, no quién tiene el turno ni cuándo decide la persona.
  - impacto: alto
- A4: Las claves van en el bloque `waits` del módulo de C8, `schema/internal-waits.ts`, que `config.ts` ya reúne bajo el único `internal`, así que `ResolvedConfig.internal` las tiene sin tocar `config.ts`.
  - impacto: medio
- A5: `--interval` de `specty wait` pierde su valor por defecto en commander ("500"); sin la opción, `wait` toma el de la clave. La opción `pollMs` de `inSlots` y `oneAtATime` se queda para los tests, como `beatMs` de `wait`, y sin ella manda la clave.
  - impacto: medio
- A6: Los milisegundos llevan una unidad nueva del catálogo, `ms`, y la página la muestra tal cual («2000 ms»), como hace con `s`, `min`, `h` y `d`.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO `.specty/config.yaml` tiene `internal.waits.verifyIntervalMs` y la verificación completa de una sesión espera el turno que tiene otra ENTONCES mira de nuevo cada esos milisegundos. Sin la clave, cada 2000 ms, como hoy.
- AC2: CUANDO `.specty/config.yaml` tiene `internal.waits.verifyIntervalMs` y la verificación de una tarea espera a que se libere una plaza del clon ENTONCES mira de nuevo cada esos milisegundos. Sin la clave, cada 2000 ms, como hoy.
- AC3: CUANDO `.specty/config.yaml` tiene `internal.waits.waitIntervalMs` y `specty wait` corre sin `--interval` ENTONCES mira cada esos milisegundos si la persona decidió, y su marca lo dice en `intervalMs`. Con `--interval`, manda la opción. Sin las dos, cada 500 ms, como hoy.
- AC4: CUANDO una de esas claves queda fuera de 100 a 10000 o no es un entero ENTONCES el validador del core da un error con su clave, y Specty no usa el archivo, como con cualquier error de `config.yaml`.
- AC5: CUANDO la persona abre «Configuración» y despliega «Interno», busca o filtra los nuevos ENTONCES ve los dos ajustes en «Interno» con la marca «Nuevo», su clave y su valor en `ms`.
- AC6: CUANDO la UI está en inglés ENTONCES los nombres y las descripciones de los dos ajustes salen en inglés, y cada uno los tiene en español y en inglés.
- AC7: CUANDO se lee `docs/formats.md` §6 ENTONCES documenta las dos claves con sus valores por defecto y sus límites, y `docs/ARCHITECTURE.md` remite a ellas en lugar de a los valores fijos.
  - test: manual

## Diseño

- Core, `schema/internal-waits.ts`: el bloque `waits` de `InternalWaitsConfig` gana `verifyIntervalMs` y `waitIntervalMs`, con sus valores en `DEFAULT_INTERNAL_WAITS`, sus `int`, `min(100)` y `max(10000)` en `INTERNAL_WAITS_SHAPE` y su resolución en `resolveInternalWaits`.
- Core, `settings/catalog.ts`: `unit` admite `ms`. Entran `internal.waits.verifyIntervalMs` e `internal.waits.waitIntervalMs` (`kind: "number"`, `unit: "ms"`, `new: true`) en el bloque `INTERNAL`, tras `internal.waits.heartbeatSec`.
- Core, `cards/settings-internal.ts`: los nombres y las descripciones de los dos nuevos en los dos idiomas.
- CLI, `store/verify-slots.ts` y `flow/full-verification.ts`: sin `POLL_MS`; cada vuelta espera `options.pollMs ?? session.config.internal.waits.verifyIntervalMs`.
- CLI, `commands/wait.ts`: `parseWaitLimits` recibe el intervalo de la clave, como ya recibe `waitTimeoutSec`, y lo usa sin `--interval`; `commands/agent-commands.ts` quita el `"500"` de la opción y su ayuda dice que, sin ella, manda la configuración.
- Tests: `core/test/schema/schema.test.ts` (AC4), `core/test/settings/catalog.test.ts` (AC5, AC6, y las listas exactas de los ajustes nuevos y de «Interno», que suman los dos), `cli/src/flow/full-verification.test.ts` (AC1) y `cli/src/store/verify-slots.test.ts` (AC2), que cuentan las esperas con un espía sobre `setTimeout`, sin depender del tiempo, y `cli/test/wait.test.ts` (AC3, por el `intervalMs` de la marca).

## Archivos

- modificar packages/core/src/schema/internal-waits.ts — las claves `internal.waits.verifyIntervalMs` e `internal.waits.waitIntervalMs`, con sus límites y los valores de hoy
- modificar packages/core/src/settings/catalog.ts — la unidad `ms` y los dos ajustes nuevos en «Interno»
- modificar packages/core/src/cards/settings-internal.ts — los textos de los dos ajustes nuevos en español y en inglés
- modificar packages/core/test/schema/schema.test.ts — los valores por defecto y los límites de las claves nuevas
- modificar packages/core/test/settings/catalog.test.ts — los ajustes nuevos, su unidad, sus marcas y sus textos, y las listas exactas de nuevos y de «Interno»
- modificar packages/cli/src/flow/full-verification.ts — la espera del turno sale de la configuración
- modificar packages/cli/src/store/verify-slots.ts — la espera de las plazas sale de la configuración
- modificar packages/cli/src/flow/full-verification.test.ts — el intervalo configurado del turno
- modificar packages/cli/src/store/verify-slots.test.ts — el intervalo configurado de las plazas
- modificar packages/cli/src/commands/wait.ts — el intervalo de `wait` sin `--interval` sale de la configuración
- modificar packages/cli/src/commands/agent-commands.ts — `--interval` sin valor por defecto
- modificar packages/cli/test/wait.test.ts — el intervalo configurado de `wait` y que `--interval` manda
- modificar docs/formats.md — §6: las claves nuevas
- modificar docs/ARCHITECTURE.md — el turno, las plazas y `specty wait` remiten a sus claves

## Tareas

- [x] T1: Las claves de los intervalos en `internal.waits` y sus ajustes en «Interno»
  - files: packages/core/src/schema/internal-waits.ts, packages/core/src/settings/catalog.ts, packages/core/src/cards/settings-internal.ts, packages/core/test/schema/schema.test.ts, packages/core/test/settings/catalog.test.ts
  - ac: AC4, AC5, AC6
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/schema/schema.test.ts test/settings/catalog.test.ts
- [ ] T2: El turno y las plazas de la verificación miran de nuevo según la configuración
  - files: packages/cli/src/flow/full-verification.ts, packages/cli/src/store/verify-slots.ts, packages/cli/src/flow/full-verification.test.ts, packages/cli/src/store/verify-slots.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run src/flow/full-verification.test.ts src/store/verify-slots.test.ts
- [ ] T3: `specty wait` mira según la configuración sin `--interval`, y las claves en la documentación
  - files: packages/cli/src/commands/wait.ts, packages/cli/src/commands/agent-commands.ts, packages/cli/test/wait.test.ts, docs/ARCHITECTURE.md, docs/formats.md
  - ac: AC3, AC7
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/wait.test.ts && pnpm typecheck

## Riesgos

- R1: C18 hará configurable la caducidad de los archivos de la cola (`STALE_MS`, 30 s), que cada vuelta renueva. Si la dejara por debajo de unas tres vueltas de `verifyIntervalMs` (10 s como mucho), una verificación que espera perdería su sitio. Mitigación: el máximo de 10 s deja tres vueltas en los 30 s de hoy, y C18 debe poner su mínimo en 30 s o más, o comprobar las dos claves juntas; se anota en la memoria.
- R2: C18 trabaja en paralelo y también toca el catálogo, `internal-waits.ts`, `settings-internal.ts` y `docs/formats.md` §6. Mitigación: las claves nuevas van en el bloque `waits`, en su sitio, y al incorporar main `specty integrate` conserva lo de los dos.
- R3: Un espía sobre `setTimeout` también ve los de otras partes del proceso. Mitigación: los tests miran que aparezca el intervalo configurado (un valor que nada más usa), no que falte otro.
