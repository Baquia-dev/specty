---
kind: standard
follows:
  - 20261026-los-comandos-de-calidad-de-python-ruby-php-y-go
---

# Los comandos de calidad de Java, Kotlin, C# y Swift

## Objetivo

`specty check` ejecuta el formato y el lint que un proyecto de Java, Kotlin o Swift ya tiene configurados, y la compilación de un proyecto de C# como comprobación de tipos; `specty init` los detecta también para `verify.full` y AGENTS.md. Specty nunca impone una herramienta. Es la segunda parte del segundo corte del plan para los stacks más populares.

## Fuera de alcance

- SpotBugs, que necesita las clases compiladas antes de analizar.
- Los plugins aplicados solo en subproyectos o en plugins de convención (`buildSrc`): se mira el archivo de build de la raíz.
- La compilación de Java, Kotlin y Swift como comprobación de tipos: los tests ya compilan.

## Supuestos

- A1: En Gradle, con `./gradlew` si existe y `gradle` si no, el formato es la tarea `spotlessCheck` con el plugin `com.diffplug.spotless`, y el lint, una sola llamada con las tareas de lo configurado: `checkstyleMain` (plugin `checkstyle`), `pmdMain` (plugin `pmd`), `detekt` (`io.gitlab.arturbosch.detekt` o `dev.detekt`) y `ktlintCheck` (`org.jlleitschuh.gradle.ktlint`). Un plugin cuenta por su id, por su alias del catálogo de versiones (`libs.plugins.<nombre>`) o, en los del núcleo, por `checkstyle` o `pmd` solos en el bloque `plugins`.
  - impacto: alto
- A2: En Maven, el formato es `mvn spotless:check` con `spotless-maven-plugin` en `pom.xml`, y el lint, `mvn` con `checkstyle:check` (`maven-checkstyle-plugin`) y `pmd:check` (`maven-pmd-plugin`), que hacen el análisis y fallan con infracciones.
  - impacto: alto
- A3: En Swift, el lint es `swiftlint lint` con `.swiftlint.yml`, con la severidad que fije su configuración (`strict: true` convierte los avisos en errores), y el formato, `swift format lint --strict --recursive .` con `.swift-format`, porque sin `--strict` una infracción de formato no falla.
  - impacto: alto
- A4: En C#, la comprobación de tipos es `dotnet build`, el comando que Specty ya detectaba como build; el formato sigue siendo `dotnet format --verify-no-changes`.

## Criterios de aceptación

- AC1: CUANDO un proyecto de Java o Kotlin con Gradle o Maven configura Spotless, Checkstyle, PMD, detekt o ktlint ENTONCES `specty check` ejecuta en `format` o `lint` el comando de A1 o A2, con el wrapper si existe.
- AC2: CUANDO un proyecto de Swift tiene `.swiftlint.yml` o `.swift-format` ENTONCES `specty check` ejecuta su lint o su formato.
- AC3: CUANDO el proyecto es de C# ENTONCES `typecheck` ejecuta `dotnet build`.
- AC4: CUANDO no hay nada configurado, o la palabra solo aparece en otro contexto (un paso `ktlint()` de Spotless) ENTONCES no aparece esa verificación.
- AC5: CUANDO se leen las guías ENTONCES `format`, `lint` y `typecheck` dicen qué detectan en Java, Kotlin, C# y Swift.

## Archivos

- modificar packages/cli/src/detect/quality.ts — las herramientas de Gradle, Maven y Swift y sus comandos
- modificar packages/cli/src/detect/project.ts — el lint de Java, Kotlin y Swift y los tipos de C#
- modificar packages/cli/src/check/commands.ts — el formato de Java, Kotlin y Swift
- modificar packages/cli/test/detect-quality.test.ts — sus casos
- modificar docs/checks.md — lo que se detecta en estos stacks
- modificar docs/checks.en.md — lo mismo, en inglés
- modificar docs/formats.md — los comandos de formato detectados

## Tareas

- [x] T1: Las herramientas de Gradle, Maven, Swift y C#
  - files: packages/cli/src/detect/quality.ts, packages/cli/src/detect/project.ts, packages/cli/src/check/commands.ts, packages/cli/test/detect-quality.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run
- [x] T2: Lo que se detecta, en las guías y en formats
  - files: docs/checks.md, docs/checks.en.md, docs/formats.md
  - ac: AC5
  - verify: pnpm check
  - type: docs

## Cierre

### Resumen

`specty check` y `specty init` detectan, en Java y Kotlin, Spotless, Checkstyle, PMD, detekt y ktlint, con Gradle (con su wrapper) o con Maven. En Swift detectan SwiftLint y swift-format. En C#, `typecheck` ejecuta `dotnet build`. Las guías y `formats.md` lo documentan. Con S2a, el formato, el lint y los tipos quedan cubiertos en los nueve stacks del plan.

### Desviaciones

- `specty check` sobre el propio cambio volvió a encontrar `commandsFor` por encima de los límites (51 líneas, complejidad 19) y `formatCommand` con complejidad 12. Las dos pasaron de un `switch` por lenguaje a una tabla por lenguaje (`BASE`, `TOOLCHAIN_FORMAT`). Ahora `commandsFor` aplica las herramientas de calidad a cualquier stack que no sea JavaScript.
- Ruby pasó a su propia función en `quality.ts`, con el ayudante `tool`, para que `qualityCommands` no creciera en complejidad.

### Decisiones

- En Gradle se llama a cada tarea por su nombre, no a `check -x test`. La documentación de ktlint-gradle no confirma que `ktlintCheck` se cuelgue de `check`.
- `swiftlint lint` respeta la severidad que fije el proyecto. `swift format lint` lleva `--strict`, porque sin él una infracción de formato no falla.
- Quedan fuera SpotBugs, que necesita compilar antes, y los plugins aplicados solo en subproyectos o en `buildSrc`.

### Pendientes

- S3: los lectores de dependencias de cada ecosistema, para `allowedDependencies`.
