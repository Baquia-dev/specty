---
kind: standard
follows:
  - 20261024-el-nucleo-de-specty-check
---

# Tests enfocados u omitidos y TODO sin referencia

## Objetivo

`specty check` detecta, en cualquier lenguaje, tres cosas que hoy dependen de que el agente las recuerde: un test enfocado (`describe.only`, `fit`, `solo: true`…) que deja sin correr a los demás, un test omitido (`it.skip`, `@Disabled`, `#[ignore]`…) y un TODO o FIXME sin referencia a un issue. Con `--changed` y `--staged` solo mira las líneas que el cambio añade, para no culpar al cambio de lo que ya estaba.

## Fuera de alcance

- Los secretos con Betterleaks o gitleaks: van en el cambio siguiente, que solo añade su adaptador a `check/common.ts`; este ya pasa de 15 archivos con ellos.
- Las reglas de lint de cada stack que detectan lo mismo (`jest/no-focused-tests` y similares): llegan con los proveedores de TypeScript y de Flutter (cortes 4 y 5).
- Los saltos en tiempo de ejecución, casi siempre condicionales (`t.Skip()` de Go, `pytest.skip()`, `markTestSkipped()`, `XCTSkip`, `test.skipIf`): no son tests deshabilitados.
- Un comentario para silenciar un hallazgo concreto: el nivel de cada verificación en `checks.levels` y `checks.exclude` bastan por ahora.
- Reconocer como test los archivos que `isTestFile` no reconoce (`*.cy.ts` de Cypress).
- `--spec`, la instalación y los hooks (cortes 3, 6 y 7).

## Supuestos

- A1: Un test enfocado o deshabilitado se reconoce por un catálogo corto de marcas declarativas por familia de frameworks (Jest, Vitest, Mocha y Jasmine; package:test de Dart; RSpec; Ginkgo; JUnit y TestNG; NUnit, MSTest y xUnit; Rust; pytest y unittest), y basta con buscarlas línea a línea en los archivos que `isTestFile` reconoce; fuera de los tests, `skip: true` o `solo: true` son parámetros normales.
  - impacto: alto
- A2: Un TODO cuenta solo cuando la marca (`TODO` o `FIXME`, en mayúsculas, configurables) es la primera palabra tras un comienzo de comentario (`//`, `/*`, `*` a principio de línea, `#`, `--`, el de HTML, `;` o `%`); así no cuentan un `TODO` de un enum ni un `"TODO"` de una app de tareas.
  - impacto: alto
- A3: La referencia a un issue es lo que case con una expresión regular configurable; por defecto, `#123`, una clave como `JIRA-42` o `GH-7`, o una URL, en el resto de la línea tras la marca.
- A4: Las líneas añadidas salen de `git diff -U0` contra el mismo punto que usa la selección de archivos (el merge-base con `--changed`, el índice con `--staged`); un archivo nuevo sin seguimiento, uno cuya ruta git cita entre comillas o una ejecución con `--all` cuentan todas sus líneas, lo que da más hallazgos, nunca menos.
- A5: Con `--staged`, las verificaciones leen el contenido preparado (`git show :ruta`) y no el del disco, para que el hook de pre-commit juzgue lo que se va a confirmar; `max-lines` pasa a leerlo así también.
- A6: Las tres verificaciones son de nivel `error` por defecto, como todas; quien no las quiera las baja a `warn` u `off` en `checks.levels`.

## Criterios de aceptación

- AC1: CUANDO un archivo de test añade `describe.only(`, `it.only(`, `test.only(`, `fit("`, `fdescribe("`, `solo: true` o `focus: true` ENTONCES `specty check` sale con 1 y muestra `FALLA focused-tests` con `ruta:línea test enfocado: <marca>`; la misma marca en un archivo que no es de test no cuenta.
- AC2: CUANDO un archivo de test añade `it.skip(`, `xit("`, `skip: true`, `skip: 'motivo'`, `@pytest.mark.skip`, `@unittest.skip`, `#[ignore]`, `@Disabled`, `@Ignore`, `enabled = false`, `[Ignore` o `Skip = "` ENTONCES muestra `FALLA skipped-tests` con `ruta:línea test omitido: <marca>`; `test.skipIf(`, `@pytest.mark.skipif` y `t.Skip()` no cuentan.
- AC3: CUANDO un archivo añade `// TODO: algo`, `# FIXME algo` o, dentro de un bloque de comentario, `* TODO algo`, sin referencia ENTONCES muestra `FALLA todo` con `ruta:línea TODO sin referencia a un issue`; con `#12`, `ABC-12` o una URL en la misma línea no cuenta, ni un `TODO` que no empiece un comentario.
- AC4: CUANDO `checks.todo` define `markers` o `reference` ENTONCES la verificación usa esas marcas y esa expresión; CUANDO `reference` no es una expresión regular válida ENTONCES la configuración no se acepta.
- AC5: CUANDO un archivo seguido ya tenía una marca en el merge-base y el cambio añade otras líneas ENTONCES `specty check` no la muestra con `--changed` ni con `--staged`, y sí con `--all`.
- AC6: CUANDO un archivo preparado tiene una marca o pasa de 500 líneas y en el disco ya no ENTONCES `specty check --staged` la muestra igual, con el número de línea del contenido preparado.
- AC7: CUANDO una de las tres verificaciones está en `warn` u `off` en `checks.levels` ENTONCES su resultado sigue ese nivel, como `max-lines`; todos los textos están en español y en inglés.

## Diseño

- `core/src/checks/markers.ts`, puro: `focusedTests(text)`, `skippedTests(text)` y `unreferencedTodos(text, todo)` devuelven `{ line, marker }` por línea, con catálogos de expresiones regulares. Las marcas de JavaScript exigen que no las preceda `.` ni una letra (`model.fit(` no cuenta) y, las de prefijo (`fit`, `xit`…), un texto entre comillas detrás (`def fit(self` no cuenta).
- `checks.todo`: `{ markers: ["TODO", "FIXME"], reference: "#\\d+|\\b[A-Z][A-Z0-9]+-\\d+\\b|https?://\\S+" }`, validado al leer la configuración.
- `CheckContext` gana `read(ruta)`, que devuelve el texto tal como lo ve el modo y lo memoriza para todas las verificaciones, y `added(ruta)`, que devuelve el conjunto de líneas añadidas o `undefined` si cuentan todas. Los construye `checkContext(session, mode)` en `check/files.ts`, que lee el diff una vez por ejecución; el análisis sigue las cabeceras `+++ b/`, `rename to` y `@@ -a,b +c,d @@` y salta el contenido de cada bloque por su cuenta de líneas.
- `check/markers.ts` define `focused-tests`, `skipped-tests` y `todo` sobre un mismo recorrido (leer, buscar y quedarse con las líneas añadidas); `check/common.ts` reúne el proveedor común (`max-lines` y estas tres), al que el corte siguiente añade los secretos.
- Los tests construyen las marcas por partes (`` `describe${".only"}(` ``) para que el propio repositorio pase `specty check`.

## Archivos

- modificar packages/core/src/schema/checks.ts — `checks.todo` con sus marcas y su referencia
- crear packages/core/src/checks/markers.ts — detección pura de tests enfocados, omitidos y TODO sin referencia
- modificar packages/core/src/index.ts — exportar la detección y la configuración de `todo`
- crear packages/core/test/checks/markers.test.ts — catálogos, falsos positivos y configuración
- modificar packages/cli/src/check/provider.ts — `read` y `added` en el contexto de cada verificación
- modificar packages/cli/src/check/files.ts — `checkContext`: contenido según el modo y líneas añadidas por el diff
- modificar packages/cli/src/check/max-lines.ts — leer por el contexto; el proveedor común se va a `common.ts`
- crear packages/cli/src/check/markers.ts — las verificaciones `focused-tests`, `skipped-tests` y `todo`
- crear packages/cli/src/check/common.ts — el proveedor común con sus cuatro verificaciones
- modificar packages/cli/src/commands/check.ts — usar `checkContext` y el proveedor de `common.ts`
- crear packages/cli/test/check-markers.test.ts — las tres verificaciones de punta a punta con git
- modificar packages/cli/test/check.test.ts — el resumen cuenta cuatro verificaciones y `--staged` lee lo preparado
- modificar docs/formats.md — `checks.todo` y los ids de las verificaciones
- modificar docs/ARCHITECTURE.md — lo que trae hoy `specty check`

## Tareas

- [x] T1: La detección pura de marcas y la configuración de `todo`
  - files: packages/core/src/schema/checks.ts, packages/core/src/checks/markers.ts, packages/core/src/index.ts, packages/core/test/checks/markers.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/checks/markers.test.ts
- [x] T2: El contexto de cada verificación lee según el modo y sabe qué líneas se añadieron
  - files: packages/cli/src/check/provider.ts, packages/cli/src/check/files.ts, packages/cli/src/check/max-lines.ts, packages/cli/src/commands/check.ts, packages/cli/test/check.test.ts
  - ac: AC6
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check.test.ts
- [ ] T3: Las verificaciones `focused-tests`, `skipped-tests` y `todo`
  - files: packages/cli/src/check/markers.ts, packages/cli/src/check/common.ts, packages/cli/src/commands/check.ts, packages/cli/test/check-markers.test.ts, packages/cli/test/check.test.ts
  - ac: AC1, AC2, AC3, AC5, AC6, AC7
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-markers.test.ts test/check.test.ts
- [ ] T4: La documentación
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC4
  - verify: pnpm check

## Riesgos

- R1: Falsos positivos de las marcas en código de test legítimo (un helper `fit` propio) — el catálogo exige el texto entre comillas tras las marcas de prefijo, y el nivel de cada verificación se baja en `checks.levels`.
- R2: Una configuración de git del usuario cambia la forma del diff (`diff.noprefix`, `diff.external`, colores) — el diff se pide con `--no-ext-diff`, `--no-color`, `--src-prefix=a/`, `--dst-prefix=b/` y `core.quotePath=false`.
