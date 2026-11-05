---
kind: standard
epic: 20261105-pendientes-de-las-unidades
slice: C8
---

# La verificación fresca nombra los tests que fallaron

## Objetivo

Cuando una unidad falla en `specty verify --fresh`, la tarjeta solo muestra las últimas líneas de la salida del intento que falló, y de ahí hay que deducir qué test falló. Con este cambio, si el proyecto tiene `checks.testTime`, la tarjeta nombra, con su archivo, los tests que fallaron según los informes JUnit que escribió ese intento; si la unidad es inestable, son los del intento que falló, que son los tests inestables. Es el corte C8 de la épica `20261105-pendientes-de-las-unidades` (AC10 y AC13 de la épica).

## Fuera de alcance

- Ver la verificación fresca en vivo en la UI o en la MCP App, y la herramienta `specty_verify` del servidor MCP: es el corte C9.
- Nombrar los tests en la memoria: la lección y el pendiente que deja la verificación fresca no cambian.
- Leer los tests que fallaron en otras verificaciones: la de `accept`, la de la incorporación de main, `specty integrate`, la UI o `specty check`.
- Una clave nueva de la configuración para los informes, y activar `checks.testTime` en este repositorio, que es cosa de la persona.

## Supuestos

- A1: Los informes son los de `checks.testTime.reports`, como dice la épica (A9). Sin `checks.testTime` no se lee ningún informe y la tarjeta queda como hoy.
- A2: Tras cada intento que falla, y antes del siguiente, que puede sobrescribir los mismos archivos, la CLI lee los informes de esos patrones modificados desde que empezó ese intento, como `test-time` lee los de su ejecución (`freshReports`). Una ruta relativa se ancla como en `test-time`, a la carpeta más profunda del informe donde existe el archivo. Un intento que pasa no lee nada.
  - impacto: alto
- A3: Un test falló si su `<testcase>` lleva dentro un `<failure>` o un `<error>`; `<skipped>` no cuenta, y lo que va en comentarios o en CDATA no se lee. Su nombre y su archivo salen con la misma regla que en `parseJunit` (`file`, el de su `<testsuite>` o `classname`, y una ruta absoluta dentro del repositorio pasa a relativa), pero no hace falta que tenga `time`.
- A4: La tarjeta nombra los tests que fallaron en una sección propia, antes de la salida del fallo, que sigue saliendo porque trae el mensaje del error. Una línea por test, `ruta «nombre»` como en la nota de `test-time`, hasta diez, y una línea con cuántos más hay. La línea `SIGUIENTE` no cambia.
  - impacto: alto
- A5: Una unidad que falló por otra cosa que sus tests (el lint, un umbral de cobertura, un comando que no existe) no deja tests que fallaron en sus informes: la tarjeta muestra solo la salida, como hoy.

## Criterios de aceptación

- AC1: CUANDO en `specty verify --fresh` una unidad falla y los informes JUnit de `checks.testTime.reports` que escribió ese intento nombran tests que fallaron ENTONCES la tarjeta nombra esos tests con su archivo, antes de la salida del fallo; si la unidad es inestable, nombra los del intento que falló.
- AC2: CUANDO no hay `checks.testTime`, el intento que falló no escribió informes, o sus informes no nombran tests que fallaron ENTONCES la tarjeta solo muestra el final de la salida, como antes.
- AC3: CUANDO la tarjeta nombra los tests que fallaron ENTONCES lo hace en español y en inglés, con diez como mucho y cuántos más hay.
- AC4: CUANDO se lee un informe JUnit ENTONCES un test falló si su `<testcase>` lleva un `<failure>` o un `<error>`, aunque no tenga `time`, y no cuentan los saltados ni lo que va en comentarios o en CDATA.

## Diseño

- Core: `checks/junit.ts` da `parseJunitFailures(text, root)`, los tests que fallaron de un informe (`FailedTest`: su archivo, si lo nombra, y su nombre). Comparte con `parseJunit` la lectura de cada `<testcase>`, que ahora también mira si lleva dentro un `<failure>` o un `<error>`. `cards/fresh.ts`: `FreshUnit` lleva, opcional, `failedTests`, los del intento cuya salida muestra, y `freshCard` los pone en `TESTS QUE FALLARON EN b` antes de `SALIDA DEL FALLO DE b` (con `b`, la unidad).
- CLI: `check/test-time.ts` da `failedTestsSince(session, started)`, que lee los informes nuevos de `checks.testTime.reports` como `slowTestsSince`, con la misma lectura de los informes y el mismo anclaje de las rutas. `commands/verify.ts` la llama tras cada intento que falla y pasa los tests del intento que muestra a la tarjeta.
- Docs: ARCHITECTURE §6 (la salida de `verify --fresh`) y formats.md §6 (`checks.testTime` también sirve a la verificación fresca).

## Archivos

- modificar packages/core/src/checks/junit.ts — los tests que fallaron de un informe JUnit
- modificar packages/core/src/index.ts — exportar `parseJunitFailures` y `FailedTest`
- modificar packages/core/src/cards/fresh.ts — la tarjeta nombra los tests que fallaron, en español y en inglés
- modificar packages/core/test/checks/junit.test.ts — los tests que fallaron de un informe
- modificar packages/core/test/cards/fresh.test.ts — la sección de los tests que fallaron
- modificar packages/cli/src/check/test-time.ts — leer los tests que fallaron de los informes nuevos
- modificar packages/cli/src/commands/verify.ts — leerlos tras cada intento que falla
- modificar packages/cli/test/verify-fresh.test.ts — `specty verify --fresh` con informes JUnit, de punta a punta
- modificar docs/ARCHITECTURE.md — la salida de la verificación fresca
- modificar docs/formats.md — `checks.testTime` en la verificación fresca

## Tareas

- [x] T1: Los tests que fallaron, en los informes JUnit y en la tarjeta
  - files: packages/core/src/checks/junit.ts, packages/core/src/index.ts, packages/core/src/cards/fresh.ts, packages/core/test/checks/junit.test.ts, packages/core/test/cards/fresh.test.ts
  - ac: AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/checks/junit.test.ts test/cards/fresh.test.ts && pnpm --filter @baquia-dev/specty-core typecheck
  - type: feat
- [x] T2: specty verify --fresh lee los tests que fallaron en cada intento
  - files: packages/cli/src/check/test-time.ts, packages/cli/src/commands/verify.ts, packages/cli/test/verify-fresh.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/verify-fresh.test.ts test/check-test-time.test.ts test/accept-test-time.test.ts && pnpm typecheck && pnpm lint && pnpm knip && pnpm sources
  - type: feat
- [x] T3: La documentación de los tests que fallaron en la verificación fresca
  - files: docs/ARCHITECTURE.md, docs/formats.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: Un informe que dejó otra ejecución durante el intento (otra sesión que corre los mismos tests a la vez) nombraría tests que no son de la unidad — la verificación fresca corre en el turno de la verificación completa y con todas las plazas, así que otra verificación del clon no corre a la vez.
- R2: Un fallo que rompe cientos de tests alargaría la tarjeta — salen diez como mucho, con cuántos más hay.
