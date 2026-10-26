---
kind: standard
follows:
  - 20261026-los-comandos-de-calidad-de-java-kotlin-c-y-swift
---

# Las dependencias permitidas en cada ecosistema

## Objetivo

La verificación `dependencies` de `specty check --spec` lee los manifiestos de Python, Go, Rust, Ruby, PHP, Java, Kotlin, .NET y Swift, además de `package.json` y `pubspec.yaml`. Así, `allowedDependencies` limita las dependencias nuevas en los nueve stacks del plan. Es el tercer corte del plan para los stacks más populares.

## Fuera de alcance

- Añadir a Specty un parser de TOML o XML: los lectores leen solo lo que necesitan de esos formatos.
- Los archivos de bloqueo (`*.lock`, `go.sum`): solo cuentan los manifiestos que la persona edita.
- Las dependencias indirectas de `go.mod` (`// indirect`), que la herramienta de Go añade sola.
- `*.gemspec`, `setup.py` y `mix.exs`.

## Supuestos

- A1: Cada lector da el nombre y la línea de cada dependencia declarada: `requirements.txt` y `requirements*.txt` (una por línea, sin comentarios, opciones ni URLs sueltas); `pyproject.toml` (`[project] dependencies`, `[project.optional-dependencies]`, `[dependency-groups]` sin los `include-group`, y las tablas de dependencias de Poetry, salvo `python`); `go.mod` (`require` de una línea y en bloque); `Cargo.toml` (las tablas de dependencias, de desarrollo, de build, de `target` y de `workspace`, y sus encabezados `[dependencies.<nombre>]`); `Gemfile` (`gem "<nombre>"`); `composer.json` (`require` y `require-dev`, sin `php`, `ext-*`, `lib-*` ni las API de Composer).
  - impacto: alto
- A2: En Java y Kotlin, el nombre es `grupo:artefacto`: en `pom.xml`, cada `<dependency>` fuera de `<dependencyManagement>`, `<build>` y `<reporting>`; en `build.gradle(.kts)`, cada coordenada `"grupo:artefacto[:versión]"` de una llamada y la forma `group: …, name: …`; en `gradle/libs.versions.toml`, cada librería de `[libraries]`, por `module`, por `group` y `name` o por su cadena. En .NET, cada `PackageReference` de un `.csproj`, `.fsproj` o `.vbproj` y cada `PackageVersion` o `GlobalPackageReference` de `Directory.Packages.props`. En Swift, cada `.package(…)` de `Package.swift`, con el último tramo de su `url` (sin `.git`), su `path` o su `id`.
  - impacto: alto
- A3: Los globs de `allowedDependencies` se aplican igual a todos: `com.squareup.okhttp3:*` permite cualquier artefacto de ese grupo.

## Criterios de aceptación

- AC1: CUANDO el diff añade una dependencia a cualquiera de esos manifiestos y no está en `allowedDependencies` ENTONCES `dependencies` falla con su ruta y su línea.
- AC2: CUANDO solo cambia una versión, se añade una dependencia indirecta de Go, un `include-group` o algo dentro de un comentario ENTONCES no falla.
- AC3: CUANDO se leen las guías ENTONCES `dependencies` lista los manifiestos que lee y el formato de los nombres de cada ecosistema.

## Diseño

- `core/src/checks/dependencies.ts`: el catálogo de lectores por nombre de archivo, más las formas de nombre variable (`requirements*.txt`, `*.csproj`). Cada lector devuelve los nombres con su línea.
- `core/src/checks/manifests-text.ts`: los lectores por línea: requirements, `go.mod`, Gemfile, `Package.swift` y los scripts de Gradle.
- `core/src/checks/manifests-toml.ts`: un lector mínimo de TOML (pares `clave = valor` con su tabla y su línea, y las cadenas de un array) y los lectores de `pyproject.toml`, `Cargo.toml` y el catálogo de versiones de Gradle.
- `core/src/checks/manifests-xml.ts`: los lectores de `pom.xml` y de los archivos de MSBuild, por sus elementos y sin comentarios.

## Archivos

- modificar packages/core/src/checks/dependencies.ts — el catálogo, con líneas dadas por cada lector
- crear packages/core/src/checks/manifests-text.ts — los lectores por línea
- crear packages/core/src/checks/manifests-toml.ts — los lectores de TOML
- crear packages/core/src/checks/manifests-xml.ts — los lectores de XML
- crear packages/core/test/checks/manifests.test.ts — un caso que cuenta y otro que no por manifiesto
- modificar docs/checks.md — los manifiestos de `dependencies`
- modificar docs/checks.en.md — lo mismo, en inglés
- modificar docs/formats.md — los manifiestos de `dependencies`

## Tareas

- [x] T1: El catálogo con líneas y los lectores por línea
  - files: packages/core/src/checks/dependencies.ts, packages/core/src/checks/manifests-text.ts, packages/core/test/checks/manifests.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/checks/manifests.test.ts test/checks/dependencies.test.ts
- [ ] T2: Los lectores de TOML
  - files: packages/core/src/checks/manifests-toml.ts, packages/core/src/checks/dependencies.ts, packages/core/test/checks/manifests.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/checks/manifests.test.ts test/checks/dependencies.test.ts
- [ ] T3: Los lectores de XML
  - files: packages/core/src/checks/manifests-xml.ts, packages/core/src/checks/dependencies.ts, packages/core/test/checks/manifests.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/checks/manifests.test.ts test/checks/dependencies.test.ts
- [ ] T4: Los manifiestos en las guías y en formats
  - files: docs/checks.md, docs/checks.en.md, docs/formats.md
  - ac: AC3
  - verify: pnpm check
  - type: docs
