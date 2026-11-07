---
kind: standard
epic: 20261107-flujo-configurable-en-la-ui
slice: C15
---

# Los límites de lo que muestran los comandos y los checks pasan a ser ajustes internos

## Objetivo

Hoy cinco límites de lo que Specty muestra están fijos en el código: los hallazgos que `specty check` toma de la salida de un comando de `checks.commands` (100), las últimas líneas que da cuando esa salida no señala ninguna ubicación (5) y los caracteres de cada mensaje (200), en `checks/output.ts` del core; las últimas líneas de un fallo que muestra `specty verify --fresh` (20, `SHOWN` de `commands/verify.ts`); y los cambios que lista `specty why <archivo>` (10, `MAX_ENTRIES` de `commands/why.ts`). Con este cambio son claves opcionales de `.specty/config.yaml` bajo `internal` (`internal.findings.perCommand`, `internal.findings.lastLines`, `internal.findings.messageChars`, `internal.commands.verifyLines` e `internal.commands.whyEntries`), con mínimos y máximos en el schema y los valores de hoy por defecto, y la página «Configuración» las muestra en «Interno» con la marca «Nuevo». Es el corte C15 de la épica: cubre sus AC23, AC25 y AC26 para estos parámetros.

## Fuera de alcance

- `checks.maxFindings` (10), que ya es una clave: cuántos hallazgos de cada verificación muestra `specty check` sin `--verbose`. Sigue igual y rige después de `internal.findings.perCommand`.
- Los límites de lo que muestran las tarjetas (`SHOWN` de `cards/impact.ts`, `MAX_LINES` de `cards/review.ts`, `NOTE_MAX` de `cards/work.ts` y el slug de `ids.ts`), que son de C14, y los del servidor de la UI, que son de C13.
- Los diez tests que fallaron que nombra `specty verify --fresh` y la nota de la verificación completa (los cinco más lentos de `checks.testTime`): no están en la lista del corte.
- Los hallazgos de las herramientas de `specty check` (tsc, Opengrep, gitleaks, OSV…), que leen su propio formato y no pasan por `checks/output.ts`.
- La línea de `specty why <archivo>:<línea>`, que da siempre un solo commit.
- El código de la página «Configuración»: la sección «Interno», su pliegue, su aviso y la marca «Nuevo» ya muestran cualquier ajuste del catálogo, y sus tests sacan sus listas del catálogo.

## Supuestos

- A1: Las claves van en dos bloques nuevos de `internal`, en su propio módulo `schema/internal-shown.ts`, que `config.ts` reúne en el único `z.strictObject` de `internal`, como `internal-run.ts` (C9, C12) e `internal-waits.ts` (C8, C11, C17). `internal.findings` agrupa lo que `specty check` toma de la salida de un comando y se pasa tal cual a `findingsInOutput`; `internal.commands`, lo que muestran `specty verify --fresh` y `specty why`. El nombre `findings` evita confundir la nueva clave con `checks.maxFindings`.
  - impacto: medio
- A2: Son enteros con estos valores y límites: `findings.perCommand` 100 (de 10 a 1000), `findings.lastLines` 5 (de 1 a 50), `findings.messageChars` 200 (de 50 a 2000), `commands.verifyLines` 20 (de 5 a 200) y `commands.whyEntries` 10 (de 1 a 100). Los mínimos son R2 de la épica: con 10 hallazgos aún se llena la página de `checks.maxFindings` por defecto, una línea y 50 caracteres aún dicen qué falló, 5 líneas aún dejan ver el final de un fallo y una entrada de `why` aún da el último cambio. Los máximos acotan lo que la tarjeta le da al agente y lo que guarda el informe de `specty check --json`.
  - impacto: medio
- A3: `findingsInOutput` recibe los tres límites como un tercer parámetro, con los valores de hoy por defecto (Diseño de la épica). Sus valores por defecto se exportan desde `checks/output.ts` y el schema los toma de ahí, como C14 con sus constantes: una sola fuente para cada valor, y `checks/output.ts` sigue sin importar zod. Los de `verify` y `why` viven en el schema, porque solo los lee la CLI.
  - impacto: bajo
- A4: La página ya muestra cada ajuste del catálogo en su sección con sus marcas (C1, C8, C9 y C12 lo prueban en la UI), así que basta con añadir las claves al catálogo, sin unidad (las del catálogo son de tiempo), y sus textos a `cards/settings-internal.ts`, sin tocar la UI.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO `.specty/config.yaml` tiene `internal.findings.perCommand` y un comando de `checks.commands` falla con más líneas que señalan una ubicación ENTONCES `specty check --verbose` da, tras la línea de su código de salida, solo ese número de hallazgos. Sin la clave, hasta 100, como hoy.
- AC2: CUANDO tiene `internal.findings.lastLines` y la salida del comando que falla no señala ninguna ubicación ENTONCES sus hallazgos son solo sus últimas esas líneas no vacías. Sin la clave, las 5 últimas, como hoy.
- AC3: CUANDO tiene `internal.findings.messageChars` ENTONCES el mensaje de cada hallazgo de esa salida se corta en esos caracteres. Sin la clave, en 200, como hoy.
- AC4: CUANDO tiene `internal.commands.verifyLines` y una unidad falla en `specty verify --fresh` ENTONCES la salida de su fallo muestra solo sus últimas esas líneas. Sin la clave, las 20 últimas, como hoy.
- AC5: CUANDO tiene `internal.commands.whyEntries` y `specty why <archivo>` corre sobre un archivo que tocaron más cambios o commits ENTONCES lista solo esos, los más recientes. Sin la clave, 10, como hoy.
- AC6: CUANDO una de esas claves queda fuera de sus límites o no es un entero, o hay una clave que no existe en esos bloques ENTONCES el validador del core da un error con su clave, y Specty no usa el archivo, como con cualquier error de `config.yaml`. Sin las claves, la configuración resuelta tiene los valores de hoy.
- AC7: CUANDO la persona abre «Configuración» y despliega «Interno», busca o filtra los nuevos ENTONCES ve los cinco ajustes en «Interno» con la marca «Nuevo», su clave y su valor.
- AC8: CUANDO la UI está en español o en inglés ENTONCES los nombres y las descripciones de los cinco ajustes salen en ese idioma.
- AC9: CUANDO se lee `docs/formats.md` §6 ENTONCES documenta las cinco claves con sus valores por defecto, sus límites y dónde rigen, y `docs/ARCHITECTURE.md` remite a ellas donde habla de `specty verify --fresh` y de `specty why`.
  - test: manual

## Diseño

- Core, `checks/output.ts` (T1): `FindingLimits` (`perCommand`, `lastLines`, `messageChars`) y `DEFAULT_FINDING_LIMITS`, exportados, en lugar de `MAX_FINDINGS`, `LAST_LINES` y `MAX_MESSAGE`. `findingsInOutput(output, root, limits = DEFAULT_FINDING_LIMITS)` los usa al recortar los hallazgos, las últimas líneas y cada mensaje.
- Core, `schema/internal-shown.ts` (T1), con la forma de `internal-run.ts`: `InternalShownConfig`, `DEFAULT_INTERNAL_SHOWN` (`findings` sale de `DEFAULT_FINDING_LIMITS`; `commands`, `{ verifyLines: 20, whyEntries: 10 }`), `INTERNAL_SHOWN_SHAPE` (dos `z.strictObject` de enteros con sus límites, opcionales) y `resolveInternalShown`. `config.ts` lo suma al tipo de `internal`, a `DEFAULT_CONFIG`, al único `z.strictObject` de `internal` y a `resolveConfig`.
- Core, `settings/catalog.ts` (T2): un bloque `INTERNAL_SHOWN` tras `INTERNAL_RUN`, cinco números con `new: true` y sin unidad. `cards/settings-internal.ts`: `INTERNAL_SHOWN_TEXTS`, en los dos idiomas, que se suma a `INTERNAL_SETTING_TEXTS`.
- CLI (T3, T4): `check/commands.ts` pasa `session.config.internal.findings` a `findingsInOutput`; `commands/verify.ts` corta la salida de cada intento con `session.config.internal.commands.verifyLines`, sin `SHOWN`; `commands/why.ts` lista hasta `whyEntries`, sin `MAX_ENTRIES`.
- Tests: `core/test/checks/output.test.ts` (los límites como parámetro); `core/test/schema/internal-shown.test.ts`, nuevo, con el schema (AC6), y `core/test/settings/internal-shown.test.ts`, nuevo, con el catálogo y los textos (AC7, AC8), para no alargar `catalog.test.ts`, que ya pasa de 400 líneas; son dos archivos para que la verificación de cada tarea solo ejecute sus tests. De `catalog.test.ts` solo se suman las cinco claves a sus dos listas exactas de ajustes «Nuevo» y de «Interno», y su cuenta fija de ajustes de «Interno» pasa a comprobar que están las claves con `arrayContaining`, sin otro número fijo, para no chocar con los cortes que trabajan en paralelo. `cli/test/check-commands.test.ts` (AC1 a AC3), `cli/test/verify-fresh.test.ts` (AC4) y `cli/test/why.test.ts` (AC5), cada uno con la clave y sin ella. Los tests leen la configuración resuelta con `toMatchObject`, sin tipos, para que compilen en cada tarea.

## Archivos

- modificar packages/core/src/checks/output.ts — los tres límites de los hallazgos, como parámetro con los valores de hoy
- modificar packages/core/test/checks/output.test.ts — los límites que se le pasan a `findingsInOutput`
- crear packages/core/src/schema/internal-shown.ts — las claves `internal.findings` e `internal.commands`, con sus límites y los valores de hoy
- modificar packages/core/src/schema/config.ts — reúne el módulo nuevo en el único bloque `internal`
- modificar packages/core/src/settings/catalog.ts — los cinco ajustes nuevos en «Interno»
- modificar packages/core/src/cards/settings-internal.ts — sus nombres y descripciones en español y en inglés
- crear packages/core/test/schema/internal-shown.test.ts — los valores por defecto y los límites de las claves
- crear packages/core/test/settings/internal-shown.test.ts — los ajustes y sus textos
- modificar packages/core/test/settings/catalog.test.ts — las listas exactas de «Nuevo» y de «Interno», y la cuenta de «Interno» sin número fijo
- modificar packages/cli/src/check/commands.ts — `specty check` pasa los límites de la configuración
- modificar packages/cli/test/check-commands.test.ts — los tres límites, con las claves y sin ellas
- modificar packages/cli/src/commands/verify.ts — las líneas del fallo salen de la configuración
- modificar packages/cli/test/verify-fresh.test.ts — las líneas del fallo, con la clave y sin ella
- modificar packages/cli/src/commands/why.ts — las entradas salen de la configuración
- modificar packages/cli/test/why.test.ts — las entradas, con la clave y sin ella
- modificar docs/formats.md — §6: las claves nuevas y `specty check`
- modificar docs/ARCHITECTURE.md — `specty verify --fresh` y `specty why` remiten a sus claves

## Tareas

- [x] T1: `findingsInOutput` recibe los límites de los hallazgos, y las claves de `internal.findings` e `internal.commands` en el schema
  - files: packages/core/src/checks/output.ts, packages/core/test/checks/output.test.ts, packages/core/src/schema/internal-shown.ts, packages/core/src/schema/config.ts, packages/core/test/schema/internal-shown.test.ts
  - ac: AC1, AC2, AC3, AC6
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/checks/output.test.ts test/schema/internal-shown.test.ts
- [x] T2: Los cinco ajustes en «Interno», con sus textos
  - files: packages/core/src/settings/catalog.ts, packages/core/src/cards/settings-internal.ts, packages/core/test/settings/internal-shown.test.ts, packages/core/test/settings/catalog.test.ts
  - ac: AC7, AC8
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/settings/internal-shown.test.ts test/settings/catalog.test.ts
- [x] T3: `specty check` toma de la configuración los límites de los hallazgos de sus comandos
  - files: packages/cli/src/check/commands.ts, packages/cli/test/check-commands.test.ts, docs/formats.md
  - ac: AC1, AC2, AC3, AC9
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-commands.test.ts
- [x] T4: `specty verify --fresh` y `specty why` muestran según la configuración
  - files: packages/cli/src/commands/verify.ts, packages/cli/src/commands/why.ts, packages/cli/test/verify-fresh.test.ts, packages/cli/test/why.test.ts, docs/ARCHITECTURE.md
  - ac: AC4, AC5, AC9
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/verify-fresh.test.ts test/why.test.ts && pnpm typecheck

## Riesgos

- R1: C13, C14 y C16 trabajan en paralelo y también tocan `config.ts`, el catálogo, `settings-internal.ts`, `catalog.test.ts` y `docs/formats.md` §6. Mitigación: las claves van en un módulo y un bloque del catálogo propios, la cuenta de «Interno» deja de tener un número fijo, y al incorporar main se conservan las partes de todos.
- R2: Un `perCommand` bajo deja fuera hallazgos de los archivos de la ejecución si el comando los escribe tarde. Mitigación: el mínimo es 10, lo que ya muestra `checks.maxFindings` por defecto, y la descripción del ajuste dice que es lo que se toma de cada comando.
