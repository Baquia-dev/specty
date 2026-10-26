---
kind: standard
follows:
  - 20261026-la-ci-de-specty-ejecuta-specty-check-en-los-pull
---

# Supresiones en cualquier lenguaje

## Objetivo

Una verificación nueva, `suppressions`, falla con cada comentario o anotación que el cambio añade para apagar el compilador, el comprobador de tipos o el linter. Cubre Python, Java, Kotlin, C#, Go, Rust, PHP, Ruby, Swift, Elixir, C y C++, y JavaScript y TypeScript. Así queda a la vista el agente que silencia un error en vez de arreglarlo. Es el primer corte del plan para los stacks más populares.

## Fuera de alcance

- `@ts-ignore` y `@ts-nocheck`, que ya vigila `strict-types`, ni `@ts-expect-error`, porque la política de TypeScript la fija `strict-types`.
- El `// ignore:` de Dart, que ya vigila `dart-strict`.
- Las supresiones en archivos de configuración (`per-file-ignores`, `.editorconfig`, `.rubocop.yml`…): solo el código fuente.
- Aceptar una supresión por llevar una justificación: cuenta cualquiera, y `checks.levels` la baja a `warn` u `off`.

## Supuestos

- A1: El catálogo sale de la documentación vigente de cada herramienta y se elige por la extensión del archivo. Las marcas que son comentarios solo se buscan en comentarios, y las que son código (anotaciones, atributos, directivas), solo en el código sin cadenas.
  - impacto: alto
- A2: Python: `noqa`, `ruff: noqa`, `ruff: ignore`, `ruff: disable` y `ruff: file-ignore`, `flake8: noqa`, `type: ignore`, `mypy: ignore-errors` y `mypy: disable-error-code`, `pyright: ignore`, `pylint: disable`, `disable-next` y `skip-file`. Ruby: `rubocop:disable` y `rubocop:todo`. Elixir: `credo:disable-for-…`.
  - impacto: alto
- A3: JavaScript y TypeScript: `eslint-disable`, `-line` y `-next-line`, y `biome-ignore`, `-all` y `-start`. Java: `@SuppressWarnings`, `@SuppressFBWarnings`, `NOSONAR`, `CHECKSTYLE:OFF`. Kotlin: `@Suppress`, `@file:Suppress`, `@SuppressWarnings`, `NOSONAR`. C#: `#pragma warning disable`, `#nullable disable`, `SuppressMessage` y `UnconditionalSuppressMessage`, `ReSharper disable`, `NOSONAR`.
  - impacto: alto
- A4: Go: `//nolint` (sin espacio, como lo exige golangci-lint), `//lint:ignore` y `//lint:file-ignore` de staticcheck, `#nosec`. Rust: `#[allow(…)]`, `#[expect(…)]` y sus formas internas `#![…]`. PHP: `@phpstan-ignore`, `-line` y `-next-line`, `phpcs:ignore`, `phpcs:disable` y `phpcs:ignoreFile`, `@psalm-suppress`, `@SuppressWarnings`, `NOSONAR`. Swift: `swiftlint:disable` (con `:next`, `:this` o `:previous`) y `swift-format-ignore`. C y C++: `NOLINT`, `NOLINTNEXTLINE` y `NOLINTBEGIN`, `#pragma warning(disable…)`, `#pragma GCC diagnostic ignored` y `#pragma clang diagnostic ignored`.
  - impacto: alto
- A5: La verificación aparece cuando el repositorio tiene algún stack que no es Dart. Mira por extensión todos los archivos de la ejecución, también los tests; con `--changed` y `--staged`, solo las líneas añadidas.
- A6: En Python, Ruby y Elixir, el comentario empieza en el primer `#` fuera de una cadena de una línea; las cadenas de varias líneas no se siguen. Las directivas de herramienta (`noqa`, `type: ignore`, `rubocop:disable`, `eslint-disable`, `nolint`…) deben abrir el comentario o seguir a otro `#`; `NOSONAR`, `NOLINT` y `#nosec` cuentan en cualquier punto del comentario.

## Criterios de aceptación

- AC1: CUANDO el cambio añade en cualquiera de esos lenguajes una supresión del catálogo ENTONCES `suppressions` falla con `ruta:línea supresión: <marca>`.
- AC2: CUANDO la marca está dentro de una cadena, o un comentario solo la menciona sin ser la directiva, o la supresión ya estaba antes del cambio ENTONCES no falla.
- AC3: CUANDO el repositorio solo tiene Dart, o ningún stack, ENTONCES la verificación no aparece.
- AC4: CUANDO se lee la guía en español o en inglés ENTONCES `suppressions` está documentada, con su catálogo, su configuración y cómo desactivarla.

## Diseño

- `core/src/checks/suppressions.ts`: el catálogo por familia de lenguajes y `suppressions(path, text)`, que da las marcas de cada línea con el tipo `Mark` de las marcas de tests.
- `cli/src/check/suppressions.ts`: el proveedor y su verificación, con el recorrido de las líneas añadidas que ya usan las marcas de `check/markers.ts`.

## Archivos

- crear packages/core/src/checks/suppressions.ts — el catálogo de supresiones de cada lenguaje
- modificar packages/core/src/index.ts — exportarlo
- crear packages/core/test/checks/suppressions.test.ts — un caso que cuenta y otro que no por lenguaje
- modificar packages/cli/src/check/markers.ts — compartir el recorrido de las líneas añadidas
- crear packages/cli/src/check/suppressions.ts — el proveedor y la verificación
- modificar packages/cli/src/commands/check.ts — registrar el proveedor
- crear packages/cli/test/check-suppressions.test.ts — la verificación en un repositorio
- modificar docs/checks.md — la verificación en la guía
- modificar docs/checks.en.md — la verificación en la guía en inglés
- modificar docs/formats.md — la verificación y su catálogo
- modificar docs/ARCHITECTURE.md — la verificación en la tabla de comandos

## Tareas

- [x] T1: El catálogo de supresiones
  - files: packages/core/src/checks/suppressions.ts, packages/core/src/index.ts, packages/core/test/checks/suppressions.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/checks/suppressions.test.ts
- [x] T2: La verificación suppressions
  - files: packages/cli/src/check/markers.ts, packages/cli/src/check/suppressions.ts, packages/cli/src/commands/check.ts, packages/cli/test/check-suppressions.test.ts, docs/checks.md, docs/checks.en.md
  - ac: AC1, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run
- [ ] T3: La documentación de referencia
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC4
  - verify: pnpm check
  - type: docs

## Riesgos

- R1: Los tests de `specty check` en repositorios con stack fijan el recuento del resumen (`OK n/m`) y cambiarán con una verificación más — T2 ejecuta toda la batería de la CLI y actualiza esos recuentos y los ejemplos de TypeScript, que ganan su caso de `suppressions`.
- R2: Un falso positivo en un lenguaje concreto bloquea la tarea — cada marca exige su prefijo de directiva y solo cuenta en comentarios o en código según su tipo; `checks.levels` la baja a `warn`.
