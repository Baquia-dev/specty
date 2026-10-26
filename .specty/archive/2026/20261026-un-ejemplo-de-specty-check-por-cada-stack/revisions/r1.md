---
kind: standard
follows:
  - 20261026-los-tests-de-maven-gradle-y-swiftpm-cuentan-junt
---

# Un ejemplo de specty check por cada stack

## Objetivo

Cada stack que Specty soporta tiene un repositorio de ejemplo, como ya lo tienen Angular, NestJS y Flutter: Python, Ruby, PHP, Java, Kotlin, C#, Go, Rust y Swift. Cada uno ejecuta `specty check --changed --spec` con un cambio que respeta el plan y con otro que rompe cada verificación a la vez, así que demuestra qué comprueba Specty en ese stack y evita que deje de hacerlo.

## Fuera de alcance

- Ampliar el catálogo de marcas de tests: un stack sin marca declarativa de foco o de test apagado queda así en su ejemplo.
- Ejecutar las herramientas reales de cada stack: necesitan su SDK y sus dependencias.
- Cambiar los ejemplos de Angular, NestJS y Flutter.

## Supuestos

- A1: Los comandos de cada ejemplo imitan, con `checks.commands`, los que Specty detecta en ese stack con sus herramientas habituales configuradas: Python, ruff, mypy y pytest; Ruby, RuboCop, Sorbet y RSpec; PHP, Pint, PHP_CodeSniffer, PHPStan y PHPUnit; Java y Kotlin, Spotless, Checkstyle o detekt y los tests de Maven o Gradle; C#, `dotnet format`, `dotnet build` y `dotnet test`; Go, golangci-lint y `go test`; Rust, `cargo fmt`, Clippy y `cargo test`; Swift, swift-format, SwiftLint y `swift test`. Un comando que Specty no detecta en ese stack, como `format` en Ruby y Go, no aparece en su ejemplo.
  - impacto: alto
- A2: Un stack sin marca declarativa en el catálogo pasa `focused-tests` o `skipped-tests` también en el caso que falla: no hay foco en Python, PHP, Java, Kotlin, C#, Rust ni Swift, ni test apagado en PHP, Go ni Swift.
  - impacto: alto
- A3: Los tests de Go usan Ginkgo, cuyo `FIt` es la marca de foco del catálogo. Sus `It` no cuentan como casos, así que `tests-removed` avisa por el archivo de test borrado.
- A4: Un constructor común arma cada ejemplo a partir de los datos de su stack (rutas, manifiesto, sintaxis y herramientas), con la misma spec, las mismas tareas y los mismos casos que el de Flutter.

## Criterios de aceptación

- AC1: CUANDO el cambio de un ejemplo de Python, Ruby, PHP, Java, Kotlin, C#, Go, Rust o Swift respeta el plan ENTONCES pasan todas sus verificaciones, salvo `secrets` sin escáner en el PATH, que sale sin ejecutar.
- AC2: CUANDO el cambio rompe cada verificación a la vez ENTONCES fallan todas las de ese stack, `tests-removed` avisa, y `focused-tests` y `skipped-tests` solo pasan en los stacks sin su marca.
- AC3: CUANDO un stack no tiene un comando o una verificación (`format` en Ruby y Go, `typecheck` fuera de Python, Ruby, PHP y C#, `layers` en Ruby y Swift) ENTONCES no aparece en el informe de su ejemplo.
- AC4: CUANDO alguien lee «Ejemplos por stack» de la guía ENTONCES encuentra cada ejemplo y lo que no comprueba en cada stack.

## Archivos

- crear packages/cli/test/stack-dialect.ts — el constructor común: la spec, la configuración y los dos casos de un stack
- crear packages/cli/test/check-examples-scripting.test.ts — los ejemplos de Python, Ruby y PHP
- crear packages/cli/test/check-examples-jvm.test.ts — los ejemplos de Java, Kotlin y C#
- crear packages/cli/test/check-examples-native.test.ts — los ejemplos de Go, Rust y Swift
- modificar docs/checks.md — los ejemplos por stack
- modificar docs/checks.en.md — lo mismo en inglés

## Tareas

- [ ] T1: El constructor y los ejemplos de Python, Ruby y PHP
  - files: packages/cli/test/stack-dialect.ts, packages/cli/test/check-examples-scripting.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-examples-scripting.test.ts
  - type: test
- [ ] T2: Los ejemplos de Java, Kotlin y C#
  - files: packages/cli/test/stack-dialect.ts, packages/cli/test/check-examples-jvm.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-examples-jvm.test.ts
  - type: test
- [ ] T3: Los ejemplos de Go, Rust y Swift
  - files: packages/cli/test/stack-dialect.ts, packages/cli/test/check-examples-native.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-examples-native.test.ts
  - type: test
- [ ] T4: Los ejemplos en la guía
  - files: docs/checks.md, docs/checks.en.md
  - ac: AC4
  - verify: pnpm check
  - type: docs
