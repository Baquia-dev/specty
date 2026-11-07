---
kind: standard
epic: 20261107-flujo-configurable-en-la-ui
slice: C12
---

# La salida máxima de un comando pasa a ser un ajuste interno

## Objetivo

Hoy Specty lee como mucho 512 KiB de la salida de cada comando que ejecuta, y la UI no sirve un diff, una traza o el código de un test más grandes: el límite está fijo en el código (`MAX_OUTPUT` de `io/exec.ts`). Con este cambio es la clave opcional `internal.exec.maxOutputKiB`, con un mínimo y un máximo en el schema y 512 por defecto. La usan `specty check` con los comandos de `checks.commands`, la revisión independiente y el servidor de la UI. La página «Configuración» la muestra en la sección «Interno» con la marca «Nuevo». Es el corte C12 de la épica, estrechado (R4 de la épica): cubre AC23, AC25 y AC26 para este parámetro.

## Fuera de alcance

- La salida de las verificaciones (la de cada tarea, la de `specty verify`, la completa de `accept` y la que lanza la UI): de ellas Specty solo muestra las últimas líneas y la salida en vivo, así que guarda los últimos 512 KiB, fijos.
- La salida de las herramientas de `specty check` (tsc, Opengrep, gitleaks, OSV…) y de los demás comandos que lanza Specty (`git.setup`, `git.afterLanding`, ccusage), que siguen con 512 KiB. Git se lee entero, como hoy.
- El tiempo del hook de Antigravity (`hookOf` de `agents/antigravity.ts`, 30 s), que `init` escribe en `.agents/hooks.json`.
- Los límites de la salida de los comandos de `checks/output.ts` (`MAX_FINDINGS`, `LAST_LINES`, `MAX_MESSAGE`).
- Los límites de lo que se muestra: `SHOWN` de `cards/impact.ts`, `SHOWN` de `commands/verify.ts`, `MAX_ENTRIES` de `commands/why.ts`, `MAX_LINES` de `cards/review.ts`, `NOTE_MAX` de `cards/work.ts` y los 48 caracteres de `slugify` (`ids.ts`).
- Los límites del servidor de la UI: la espera de 1000 ms de sus eventos (`server/http.ts`), `PAGE` de `server/finished.ts`, `KEPT` y `EVERY` de `server/run-output.ts` (y sus gemelos de `flow/live-run.ts`), `TASKS_EVERY` de `server/watched-runs.ts` y el cuerpo de 64 KiB de `server/api.ts`.
- Las comprobaciones de origen, cookie y CSRF del servidor: son una garantía y no se configuran.
- Plegar la sección «Interno» y su aviso, que ya pone C8.

## Supuestos

- A1: El corte completo (unos 17 parámetros en unos 35 archivos de core y de la CLI, cada uno con su test) sale XL, y también la salida junto con el servidor (unos 26 archivos). Por eso este cambio se queda con la salida máxima de un comando. Los demás parámetros de la lista de fuera de alcance van a cortes nuevos de la épica, que la sesión principal ajusta antes de aprobarlo.
  - impacto: alto
- A2: La clave es `internal.exec.maxOutputKiB`: 512 por defecto, un entero entre 64 y 16384. Va en el bloque `exec` de `schema/internal-run.ts`, el de C9, con la prioridad: es cómo ejecuta Specty un comando. Así `config.ts` no cambia y no hay un segundo bloque `internal`. El mínimo, 64 KiB, deja ver el diff y la revisión de un cambio normal (R2 de la épica). El máximo, 16 MiB, acota la memoria, porque Specty guarda dos flujos por comando. Se mide en caracteres, como hoy (1 KiB son 1024).
  - impacto: medio
- A3: La clave rige donde Specty lee entero el texto de un comando: los de `checks.commands`, donde `specty check` busca los hallazgos en toda la salida, y el de `review.command`, cuya respuesta guarda. También rige lo más que el servidor de la UI sirve de un diff, una traza o el código de un test. Estos tres se leen enteros de git y, por encima del límite, el servidor dice que son demasiado grandes. Las verificaciones y las herramientas siguen con el valor fijo (fuera de alcance).
  - impacto: medio
- A4: La página ya muestra cada ajuste del catálogo en su sección con sus marcas (C1, C8 y C9 lo prueban en la UI), así que basta con añadir la clave al catálogo y sus textos a `cards/settings.ts`, sin tocar la UI.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO `.specty/config.yaml` tiene `internal.exec.maxOutputKiB` y un comando de `checks.commands` falla con una salida más larga ENTONCES `specty check` busca sus hallazgos solo en los últimos KiB de cada flujo: un hallazgo que el comando escribió antes no sale. Sin la clave lee los últimos 512 KiB, como hoy.
- AC2: CUANDO la clave está y la respuesta del revisor independiente (`review.command`) es más larga ENTONCES Specty guarda en `reviews/` solo sus últimos KiB, como hoy guarda los últimos 512.
- AC3: CUANDO la clave está y el diff de un cambio, el blame de un archivo de su trazabilidad o el código de un test del cambio pasan de esos KiB ENTONCES el servidor de la UI no los sirve: responde 413 al diff y a la traza y 404 al código del test, como hoy a partir de 512 KiB. Los mismos, sin la clave, los sirve.
- AC4: CUANDO `internal.exec.maxOutputKiB` no es un entero entre 64 y 16384 ENTONCES el validador del core da un error con su clave, y Specty no usa el archivo, como con cualquier error de `config.yaml`. Sin la clave, la configuración resuelta tiene 512.
- AC5: CUANDO la persona abre «Configuración» ENTONCES ve la salida máxima de un comando en la sección «Interno», la última, con la marca «Nuevo», su clave y su valor.
- AC6: CUANDO la UI está en español o en inglés ENTONCES el nombre y la descripción del ajuste salen en ese idioma.
- AC7: CUANDO se lee `docs/formats.md` §6 ENTONCES documenta `internal.exec.maxOutputKiB`, con su valor por defecto, sus límites y dónde rige. `docs/ARCHITECTURE.md` dice lo mismo donde habla de `specty check`, de la revisión independiente, del diff, de la traza y del código de un test.
  - test: manual

## Diseño

- Core, `schema/internal-run.ts`: `InternalRunConfig.exec` gana `maxOutputKiB`, `DEFAULT_INTERNAL_RUN` su 512, `INTERNAL_RUN_SHAPE.exec` su `z.number().int().min(64).max(16384).optional()` y `resolveInternalRun` su valor. `config.ts` ya reúne este módulo bajo `internal` y no cambia.
- Core, `settings/catalog.ts`: en el bloque `INTERNAL_RUN`, tras la prioridad, `{ key: "internal.exec.maxOutputKiB", section: "internal", kind: "number", new: true }`, sin unidad, porque las del catálogo son de tiempo y el nombre ya dice KiB. `cards/settings.ts`: su nombre y su descripción en `INTERNAL_RUN_TEXTS`, en los dos idiomas.
- CLI, `io/exec.ts`: `ExecOptions.maxOutput`, lo que `execute` guarda de cada flujo si no lee entero (`whole`), por defecto `MAX_OUTPUT`, que pasa a salir de `DEFAULT_CONFIG.internal.exec.maxOutputKiB`. `maxOutputOf(config)` da ese límite en caracteres, para no repetir el `* 1024`.
- CLI: `check/commands.ts` (`commandCheck`) y `commands/review.ts` (`runReview`) pasan `maxOutput: maxOutputOf(session.config)`. `server/diff.ts`, `server/trace.ts` y `server/test-code.ts` comparan con `maxOutputOf(session.config)` en vez de `MAX_OUTPUT`. Su comentario dice ya que git se lee entero y que el límite es lo que se sirve.
- Tests: `core/test/settings/catalog.test.ts` (AC4, AC5, AC6), que también suma la clave a las listas de «Interno» de C8; `cli/test/check-commands.test.ts` (AC1); `cli/test/review.test.ts` (AC2); y `cli/test/server/output-limit.test.ts` (AC3), nuevo, que prueba los tres límites del servidor con `maxOutputKiB: 64` y un archivo de unos 70 KiB.

## Archivos

- modificar packages/core/src/schema/internal-run.ts — la clave `internal.exec.maxOutputKiB`, con sus límites y el valor de hoy
- modificar packages/core/src/settings/catalog.ts — el ajuste nuevo en la sección «Interno», con la marca «Nuevo»
- modificar packages/core/src/cards/settings.ts — su nombre y su descripción en español y en inglés
- modificar packages/core/test/settings/catalog.test.ts — los límites del schema, el valor por defecto, el ajuste en «Interno» y sus textos
- modificar packages/cli/src/io/exec.ts — lo que `execute` guarda de cada flujo, configurable, y `maxOutputOf`
- modificar packages/cli/src/check/commands.ts — la salida de los comandos de `checks.commands`, con el límite de la configuración
- modificar packages/cli/src/commands/review.ts — la respuesta del revisor, con el límite de la configuración
- modificar packages/cli/test/check-commands.test.ts — un hallazgo perdido con el límite configurado y visto sin él
- modificar packages/cli/test/review.test.ts — la respuesta guardada con el límite configurado
- modificar packages/cli/src/server/diff.ts — el diff más grande que sirve, de la configuración
- modificar packages/cli/src/server/trace.ts — el blame más grande que sirve, de la configuración
- modificar packages/cli/src/server/test-code.ts — el código de test más grande que sirve, de la configuración
- crear packages/cli/test/server/output-limit.test.ts — el diff, la traza y el código de un test con el límite configurado y sin él
- modificar docs/formats.md — §6: `internal.exec.maxOutputKiB`
- modificar docs/ARCHITECTURE.md — el límite del diff, de la traza, del código de un test, de `specty check` y de la revisión

## Tareas

- [ ] T1: La clave `internal.exec.maxOutputKiB` en el schema y su ajuste en el catálogo, con sus textos
  - files: packages/core/src/schema/internal-run.ts, packages/core/src/settings/catalog.ts, packages/core/src/cards/settings.ts, packages/core/test/settings/catalog.test.ts, docs/formats.md
  - ac: AC4, AC5, AC6, AC7
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/settings/catalog.test.ts
- [ ] T2: `specty check` y la revisión independiente leen la salida que dice la configuración
  - files: packages/cli/src/io/exec.ts, packages/cli/src/check/commands.ts, packages/cli/src/commands/review.ts, packages/cli/test/check-commands.test.ts, packages/cli/test/review.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-commands.test.ts test/review.test.ts
- [ ] T3: El servidor de la UI sirve el diff, la traza y el código de un test hasta el límite de la configuración
  - files: packages/cli/src/server/diff.ts, packages/cli/src/server/trace.ts, packages/cli/src/server/test-code.ts, packages/cli/test/server/output-limit.test.ts, docs/ARCHITECTURE.md
  - ac: AC3, AC7
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server/output-limit.test.ts && pnpm typecheck

## Riesgos

- R1: Un límite bajo pierde los hallazgos del principio de una salida larga de `specty check`, o el principio de una revisión larga. Mitigación: el schema no baja de 64 KiB, la sección «Interno» va plegada con su aviso (C8) y quitar la clave la devuelve a 512.
- R2: C11 trabaja en paralelo y también toca las listas de «Interno» de `catalog.test.ts` y `cards/settings.ts`. Mitigación: cada corte añade sus entradas a su bloque, y el conflicto al incorporar main se resuelve con `specty integrate`, conservando lo de los dos.
