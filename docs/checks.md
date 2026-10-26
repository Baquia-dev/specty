# Verificaciones de `specty check`

[English](checks.en.md)

Una regla que una herramienta puede verificar no debe depender de que el agente la lea y la cumpla ([ADR 0012](decisions/0012-lo-verificable-lo-verifica-specty.md)). `specty check` ejecuta esas verificaciones sobre el repositorio. Es determinista: no llama a modelos ni necesita un agente, así que da lo mismo en la terminal, en la CI o al final de cada tarea. Esta guía explica cada verificación, cómo se configura y cómo se desactiva. El detalle del formato está en [formats.md §6](formats.md#6-configyaml).

## Uso

```text
specty check [--changed | --staged | --all] [--spec [id]] [--verbose] [--json]
```

- `--changed` (por defecto): lo que cambió respecto al merge-base con la rama destino, más los archivos nuevos. Es el modo pensado para agentes.
- `--staged`: lo preparado para el commit, leído del índice. Es el modo del pre-commit.
- `--all`: todo lo que git sigue. Es el modo de la CI.
- `--spec [id]`: añade las verificaciones del plan aprobado del cambio `id` o, sin él, del cambio activo de la carpeta. No se combina con `--all`.
- `--verbose`: además, lo que pasó y por qué una verificación no corrió.
- `--json`: el resultado completo, para la CI.

La salida muestra solo los fallos y los avisos, agrupados por verificación, con `ruta:línea` y un mensaje de una línea, y termina en un resumen:

```text
FALLA layers
  src/domain/user.ts:3 domain no puede importar el paquete @angular/core
FALLA max-lines
  src/app/cart.service.ts 512 líneas de código (máximo 500)
FALLA todo
  src/app/cart.ts:40 TODO sin referencia a un issue
OK 14/17 · FALLA: layers, max-lines, todo
```

Sale con 1 si falla una verificación de nivel `error`; los avisos nunca hacen fallar. Una verificación que no puede ejecutarse, porque falta su herramienta, aparece como `SIN EJECUTAR`, y `--verbose` dice por qué.

## Configuración común

Todo va bajo `checks` en `.specty/config.yaml`:

```yaml
checks:
  levels: { todo: warn, secrets: off }  # error | warn | off por verificación; sin la clave, error
  maxFindings: 10                       # fallos que se muestran por verificación antes de «… y N más»
  exclude: ["**/node_modules/**", "**/build/**"]  # lo que ninguna verificación mira
```

- **Desactivar una verificación:** `checks.levels: { <id>: off }`. Con `warn`, sus fallos solo avisan. Es lo mismo para todas; cada sección de abajo dice además si hay otra forma.
- **Lo que nunca se mira:** `checks.exclude` (por defecto `node_modules`, `build`, `dist`, `.dart_tool`, `out`, `target`, `coverage`, `vendor`, `.next`, `.angular` y `.gradle`), las rutas de `ignored` y el código generado de `scope.generated`.
- **Mensajes:** en el idioma de `language` (`es` o `en`).

## Las verificaciones

Aparecen en este orden: las de los comandos del proyecto, las de cada stack, las de cualquier lenguaje y, con `--spec`, las del plan.

### `format`

Comprueba el formato con el comando del proyecto, solo en su forma de comprobación, nunca la que reescribe archivos. Specty lo detecta cuando el proyecto ya tiene la herramienta configurada:

- TypeScript o JavaScript: el script `format:check`, `fmt:check` o `check:format`.
- Dart: `dart format --output=none --set-exit-if-changed .`.
- Rust: `cargo fmt --check`.
- Python: `ruff format --check` con ruff o, si no, `black --check .` con `[tool.black]` o black en los manifiestos. Como todo en Python, con el prefijo del gestor (`uv run`, `poetry run`…).
- PHP: el script `cs:check`, `format:check`, `check:format` o `fmt:check` de `composer.json`; si no, `vendor/bin/pint --test` con `pint.json` o `laravel/pint`, o `vendor/bin/php-cs-fixer check` con `.php-cs-fixer.php` o `.php-cs-fixer.dist.php`.
- Java y Kotlin: la tarea `spotlessCheck` de Gradle (con `./gradlew` si existe) o `mvn spotless:check`, con Spotless configurado.
- Swift: `swift format lint --strict --recursive .` con `.swift-format`; sin `--strict`, una infracción de formato no falla.
- .NET: `dotnet format --verify-no-changes`.

En Go, el formato lo comprueba `golangci-lint run` con los formateadores de su configuración (ver `lint`).

**Configuración:** `checks.commands.format` lo fija o lo cambia. Sin comando, la verificación no aparece.

**Desactivar:** `levels: { format: off }`.

### `lint`

Ejecuta el lint que el proyecto tiene:

- TypeScript o JavaScript: el script `lint` de `package.json`.
- Dart: `flutter analyze` o `dart analyze`.
- Python: `ruff check` con ruff o, si no, `flake8` con `.flake8` o `[flake8]` en `setup.cfg` o `tox.ini`.
- Go: `golangci-lint run` con `.golangci.yml`, `.yaml`, `.toml` o `.json`; si no, `go vet ./...`.
- Rust: `cargo clippy -- -D warnings`.
- Ruby: `bundle exec standardrb` con `.standard.yml` o la gema `standard`; si no, `bundle exec rubocop` con `.rubocop.yml` o la gema `rubocop`.
- PHP: el script `lint`, `phpcs` o `cs` de `composer.json`; si no, `vendor/bin/phpcs` con `.phpcs.xml`, `phpcs.xml` o sus `.dist`.
- Java y Kotlin: con Gradle, una sola llamada con las tareas configuradas: `checkstyleMain`, `pmdMain`, `detekt` y `ktlintCheck`. Con Maven, `mvn checkstyle:check pmd:check`, según lo que esté en `pom.xml`. Los plugins se buscan en el archivo de build de la raíz, por su id o su alias del catálogo de versiones.
- Swift: `swiftlint lint` con `.swiftlint.yml`, con la severidad que fije su configuración (`strict: true` convierte los avisos en errores).

Pasa si sale con 0. Si no, convierte su salida en hallazgos `ruta:línea`, cualquiera que sea la herramienta.

**Configuración:** `checks.commands.lint`.

**Desactivar:** `levels: { lint: off }`.

### `typecheck`

Ejecuta la comprobación de tipos que el proyecto tiene:

- TypeScript: el script `typecheck`, `type-check` o `tsc` de `package.json`.
- Python: `mypy .` con `mypy.ini`, `.mypy.ini`, `[tool.mypy]` o `[mypy]` en `setup.cfg`; si no, `pyright` con `pyrightconfig.json` o `[tool.pyright]`.
- Ruby: `bundle exec srb tc` con `sorbet/config`; si no, `bundle exec steep check` con `Steepfile`.
- PHP: el script `analyse`, `analyze`, `phpstan`, `psalm` o `stan` de `composer.json`; si no, `vendor/bin/phpstan analyse --no-progress` con `phpstan.neon`, `phpstan.neon.dist` o `phpstan.dist.neon`, o `vendor/bin/psalm --no-progress` con `psalm.xml` o `psalm.xml.dist`.
- C#: `dotnet build`.

**Configuración:** `checks.commands.typecheck`.

**Desactivar:** `levels: { typecheck: off }`.

### `tests`

Ejecuta los tests del proyecto con el comando que Specty detecta en cada stack: `pnpm test`, `flutter test`, `pytest`, `go test ./...`, `cargo test`, `dotnet test`, `mvn test` o `gradle test`, `bundle exec rspec`, `php artisan test`…

**Configuración:** `checks.commands.tests`.

**Desactivar:** `levels: { tests: off }`.

Los cuatro comandos miran el proyecto entero, porque un cambio puede romper archivos que no tocó, y tienen el tiempo límite de `verify.timeoutSec`. Specty solo ejecuta una herramienta que el proyecto configura, nunca añade ninguna; si está configurada pero no instalada, su verificación falla con el código de salida del comando, y `checks.commands` o `checks.levels` lo ajustan. `specty task done` no los ejecuta si la tarea ya tiene verificación (ver «Dónde se ejecuta»).

### `strict-types`

**Stack:** TypeScript.

Prohíbe en las líneas añadidas un `any` explícito, `@ts-ignore`, `@ts-nocheck` y la aserción no nula (`x!`). No mira los `*.d.ts`. Si el proyecto tiene ESLint con typescript-eslint, lo usa con sus reglas `no-explicit-any`, `ban-ts-comment` y `no-non-null-assertion`. Si no, usa la detección propia de Specty, así que la regla se cumple también con Biome o sin lint.

**Configuración:** no tiene.

**Desactivar:** `levels: { strict-types: off }`.

### `dart-strict`

**Stack:** Dart y Flutter.

Exige el analizador en modo estricto: `strict-casts`, `strict-inference` y `strict-raw-types` a `true` en `analyzer.language` de `analysis_options.yaml`, propio o traído por su `include`. Falla también con cada `// ignore:` o `// ignore_for_file:` que añade el cambio. `specty check --install` pone los modos que faltan.

**Configuración:** la del propio `analysis_options.yaml`.

**Desactivar:** `levels: { dart-strict: off }`.

### `suppressions`

**Stack:** cualquiera salvo Dart, cuyo `// ignore:` vigila `dart-strict`. Mira cada archivo según su extensión.

Falla con cada comentario o anotación que el cambio añade para apagar el compilador, el comprobador de tipos o el linter: un error silenciado sigue ahí. Las marcas que son comentarios solo cuentan dentro de un comentario, y las que son código, fuera de las cadenas. Con `--changed` y `--staged`, solo en las líneas añadidas. El catálogo:

- Python: `# noqa`, `# ruff: noqa`, `# ruff: ignore`, `# ruff: disable` y `# ruff: file-ignore`, `# flake8: noqa`, `# type: ignore`, `# mypy: ignore-errors` y `# mypy: disable-error-code`, `# pyright: ignore`, `# pylint: disable`, `disable-next` y `skip-file`.
- JavaScript y TypeScript: `eslint-disable`, `eslint-disable-line` y `eslint-disable-next-line`; `biome-ignore`, `biome-ignore-all` y `biome-ignore-start`. `@ts-ignore` y `@ts-nocheck` son de `strict-types`.
- Java: `@SuppressWarnings`, `@SuppressFBWarnings`, `NOSONAR`, `CHECKSTYLE:OFF`. Kotlin: `@Suppress`, `@file:Suppress`, `@SuppressWarnings`, `NOSONAR`.
- C#: `#pragma warning disable`, `#nullable disable`, `SuppressMessage` y `UnconditionalSuppressMessage`, `ReSharper disable`, `NOSONAR`.
- Go: `//nolint`, `//lint:ignore` y `//lint:file-ignore` (sin espacio tras `//`, como los leen golangci-lint y staticcheck), `#nosec`.
- Rust: `#[allow(…)]` y `#[expect(…)]`, también como `#![…]`.
- PHP: `@phpstan-ignore`, `@phpstan-ignore-line` y `@phpstan-ignore-next-line`, `phpcs:ignore`, `phpcs:disable` y `phpcs:ignoreFile`, `@psalm-suppress`, `@SuppressWarnings`, `NOSONAR`.
- Ruby: `# rubocop:disable` y `# rubocop:todo`. Elixir: `# credo:disable-for-…`. Swift: `swiftlint:disable` y `swift-format-ignore`.
- C y C++: `NOLINT`, `NOLINTNEXTLINE` y `NOLINTBEGIN`, `#pragma warning(disable…)`, `#pragma GCC diagnostic ignored` y `#pragma clang diagnostic ignored`.

**Configuración:** no tiene. Si un proyecto necesita a menudo una supresión justificada, `warn` la deja como aviso.

**Desactivar:** `levels: { suppressions: off }`.

### `layers`

**Stack:** TypeScript, JavaScript, Dart, Flutter, Python, Go, Rust, Java, Kotlin, PHP y C#, cuando hay capas configuradas.

Falla con cada import que cruza las capas de Clean Architecture: por ejemplo, el dominio que importa el framework, la infraestructura o la UI.

- En TypeScript y JavaScript, los imports los resuelve el dependency-cruiser del proyecto, con los alias de `tsconfig.json`. Sin él, la verificación no corre, y `specty check --install` ofrece añadirlo con su versión exacta.
- En Dart, Python, Go, Rust, Java, Kotlin, PHP y C#, los lee un escáner propio de Specty, sin herramientas:
  - Dart: los `import` y `export`; un `package:` con el nombre de `pubspec.yaml` es un archivo de `lib/`.
  - Python: `import a.b` y `from a.b import c`. Un módulo es del proyecto si es un archivo o una carpeta del repositorio, en la raíz o bajo `src/`; si no, es el paquete de su primer nombre (`requests`). Los relativos se resuelven desde la carpeta del archivo.
  - Go: los `import "ruta"`; una ruta bajo el `module` de `go.mod` es la carpeta `<carpeta>/*.go`, y cualquier otra es su paquete (`fmt`, `github.com/jackc/pgx`).
  - Rust: los `use` y `extern crate`; `crate::a::b` es `a/b` bajo el `src` del crate, `super::` y `self::` parten del módulo del archivo, y cualquier otro primer nombre es su crate (`std`, `sqlx`).
  - Java y Kotlin: los `import`, también `static` y con comodín. Un import es del proyecto si sus primeros nombres, dos al menos, terminan la ruta de una carpeta con archivos `.java` o `.kt`; si no, es el paquete con su nombre completo, que `org.springframework.*` cubre.
  - PHP: los `use` antes de la primera clase (dentro, `use` trae un trait), con `function`, `const` y grupos. Un nombre es del proyecto si lo cubre un prefijo PSR-4 de `composer.json`; si no, es el paquete con sus `\` como `/` (`Illuminate/Support/Facades/DB`), que `Illuminate/**` cubre.
  - C#: los `using`, también `global`, `static` y los alias, pero no `using var` ni `using (…)`. Un nombre es del proyecto si es un namespace que declara alguno de sus archivos `.cs` (o lo es sin su último tramo), y va a `<carpeta>/*.cs`; si no, es el paquete con su nombre completo, que `Microsoft.EntityFrameworkCore*` cubre.

**Configuración:**

```yaml
checks:
  layers:
    domain: { paths: ["src/domain/**"], forbiddenPackages: ["@angular/*", "@nestjs/*", "node:*"] }
    application: { paths: ["src/application/**"], may: [domain] }
    infrastructure: { paths: ["src/infrastructure/**"], may: [application, domain] }
    ui: { paths: ["src/ui/**"], may: [application, domain] }
```

Cada capa tiene sus rutas (`paths`), las capas que puede importar (`may`; ella misma y lo que no está en ninguna capa, siempre) y los paquetes que no (`forbiddenPackages`).

**Desactivar:** quitar `checks.layers` (sin capas no aparece) o `levels: { layers: off }`.

### `function-lines`

**Stack:** todos salvo Elixir. En los lenguajes de llaves, una función va de su cabecera a la llave que la cierra; en Python, de su `def` a la última línea más indentada; en Ruby, de su `def` al `end` que la cierra.

Las líneas de código de cada función, sin blancos ni comentarios. Falla con una función que el cambio toca, que pasa del límite y que es nueva o creció. Una que ya lo pasaba y no creció no cuenta, salvo con `--all`. Los tests no se miden.

**Configuración:** `checks.functions.maxLines` (50).

**Desactivar:** `levels: { function-lines: off }`.

### `complexity`

**Stack:** los mismos que `function-lines`.

La complejidad ciclomática de cada función: 1 más cada `if`, `for`, `while`, `case`, `catch`, `guard`, `&&`, `||`, `??` y ternario. Falla en los mismos casos que `function-lines`.

**Configuración:** `checks.functions.complexity` (10).

**Desactivar:** `levels: { complexity: off }`.

### `generated`

**Stack:** el que tenga un generador.

Comprueba que el código generado coincide con lo que produce su generador, como un `git diff --exit-code` tras regenerar, sin dejar nada cambiado. Regenera, compara y restaura los archivos. Se ejecuta sola, después de las demás. Con `--changed` y `--staged`, un generador solo corre si el cambio toca sus orígenes o sus salidas. Specty detecta:

- Prisma, con un `output` en su schema;
- build_runner, en Dart, para `*.g.dart`, `*.freezed.dart` y similares.

**Configuración:** `checks.generators` añade otros, con su `command`, sus `outputs` y, si quiere, sus `inputs`.

**Desactivar:** `levels: { generated: off }`.

### `max-lines`

**Stack:** cualquiera.

Las líneas de código de cada archivo, sin blancos ni comentarios. Avisa por encima de `lines.warn` y falla por encima de `lines.fail`.

**Configuración:** la regla `lines`: `warn: 300`, `fail: 500`, `tests: { warn: 400, fail: 600 }` y `exclude`.

**Desactivar:** `levels: { max-lines: off }`, o `lines.fail: false` para que solo avise.

### `focused-tests`

**Stack:** cualquiera; solo mira los archivos de test.

Un test enfocado deja sin correr a los demás: `describe.only`, `fit`, `fdescribe`, `solo: true` de Dart, `focus: true` de RSpec, `FIt` y el decorador `Focus` de Ginkgo, `->only()` de Pest. Con `--changed` y `--staged`, solo en las líneas añadidas.

**Configuración:** no tiene.

**Desactivar:** `levels: { focused-tests: off }`.

### `skipped-tests`

**Stack:** cualquiera; solo mira los archivos de test.

Un test apagado con una marca: `it.skip`, `xit`, `xdescribe`, `skip:` de Dart, `@pytest.mark.skip`, `#[ignore]`, `@Disabled`, `@Ignore`, `[Ignore]`, `PIt`, `XIt` y el decorador `Pending` de Ginkgo, `.disabled()` de Swift Testing, `->skip()` de Pest… No cuentan los saltos condicionales que decide el propio test (`test.skipIf`, `@pytest.mark.skipif`, `t.Skip()`, `->skip($condición)`, `.enabled(if:)`).

**Configuración:** no tiene.

**Desactivar:** `levels: { skipped-tests: off }`.

### `todo`

**Stack:** cualquiera.

Una marca de trabajo pendiente al principio de un comentario, sin referencia a un issue en el resto de la línea. Por defecto valen `#12`, `acme/app#12`, una clave como `ABC-12` o un enlace.

**Configuración:**

```yaml
checks:
  todo:
    markers: ["TODO", "FIXME"]
    reference: "#\\d+|\\b[A-Z][A-Z0-9]+-\\d+\\b|https?://\\S+"
```

**Desactivar:** `levels: { todo: off }`.

### `secrets`

**Stack:** cualquiera.

Busca secretos con Betterleaks o, si no está, con gitleaks, sobre una copia temporal de los archivos de la ejecución, y siempre con `--redact`. Si no hay ningún escáner instalado, no corre y dice qué instalar. Para un falso positivo valen los comentarios `betterleaks:allow` o `gitleaks:allow` y los archivos de ignorados de cada escáner.

**Configuración:** la del escáner (`.gitleaks.toml`, `.betterleaks.toml`, `.gitleaksignore`, `.betterleaksignore`).

**Desactivar:** `levels: { secrets: off }`.

### `spec-approved`

**Con:** `--spec`.

La spec del cambio está aprobada y no cambió desde entonces; el cierre, que llega después, no cuenta. La aprobación vive en `state.json`, que el agente no puede escribir. Falla también si el cambio está cancelado o no existe.

**Configuración:** no tiene.

**Desactivar:** `levels: { spec-approved: off }`.

### `scope`

**Con:** `--spec`.

Cada archivo que el diff toca o borra está en «Archivos» de la spec, en los `files` de alguna tarea o en una ampliación aprobada. Los tests junto a esos archivos y el código generado entran solos. Lista cada ruta que queda fuera.

**Configuración:** `scope.implicitTests` y `scope.generated`.

**Desactivar:** `levels: { scope: off }`.

### `dependencies`

**Con:** `--spec`.

Cada dependencia que el diff añade a un manifiesto está en `allowedDependencies` del frontmatter de la spec, por nombre o por glob. Un cambio de versión no cuenta, y un manifiesto nuevo cuenta con todas sus dependencias. Lee estos manifiestos, en cualquier carpeta:

- JavaScript y TypeScript: `package.json` (`dependencies`, `devDependencies`, `peerDependencies` y `optionalDependencies`).
- Dart y Flutter: `pubspec.yaml`, sin los paquetes del SDK.
- Python: `requirements.txt` y `requirements*.txt`; `pyproject.toml` (`[project] dependencies`, `[project.optional-dependencies]`, `[dependency-groups]` y las tablas de Poetry, salvo `python`).
- Go: `go.mod`, sin las dependencias que marca `// indirect`.
- Rust: `Cargo.toml`, todas sus tablas de dependencias.
- Ruby: `Gemfile`. PHP: `composer.json`, sin `php`, `ext-*` ni `lib-*`.
- Java y Kotlin, como `grupo:artefacto`: `pom.xml` (sin `<dependencyManagement>` ni los plugins), `build.gradle` y `build.gradle.kts`, y el catálogo `gradle/libs.versions.toml`.
- .NET: los `PackageReference` de cada `.csproj`, `.fsproj` o `.vbproj`, y `Directory.Packages.props`.
- Swift: `Package.swift`, por el último tramo de la `url` de cada paquete.

**Configuración:** en la spec, `allowedDependencies: [zod, "@angular/*", "com.squareup.okhttp3:*"]`.

**Desactivar:** `levels: { dependencies: off }`.

### `fix-tests`

**Con:** `--spec`.

Cada tarea `type: fix`, activa o hecha, trae en el diff un test suyo: de sus `files`, de sus ampliaciones o junto a ellos.

**Configuración:** no tiene.

**Desactivar:** `levels: { fix-tests: off }`, o `warn` para que una tarea `fix` sin test solo avise.

### `tests-removed`

**Con:** `--spec`.

Avisa, sin hacer fallar nunca, de cada test que el diff borra y de cada archivo de test que queda con menos casos que al empezar.

**Configuración:** no tiene.

**Desactivar:** `levels: { tests-removed: off }`.

## Dónde se ejecuta

- **`specty task done`** ejecuta `specty check --changed --spec` antes de la verificación de la tarea, y no la completa con fallos. Deja fuera `scope` y `max-lines`, que ya comprueba por tarea. Si la tarea tiene verificación, deja fuera también los cuatro comandos del proyecto, para que los tests no corran dos veces.
- **El pre-commit** ejecuta `specty check --staged` sobre los cambios manuales con `checks.preCommit: true`.
- **La CI** ejecuta `specty check --all --json` con la plantilla de GitHub Actions.
- **El fin de turno del agente** ejecuta `specty check --changed`, con `--spec` si hay un cambio aprobado. Si falla, el agente recibe el informe y sigue en vez de dar la tarea por terminada. Funciona en Claude Code, Cursor y Codex, que tienen un hook de fin de turno documentado. En los demás agentes, la regla escrita del bloque de AGENTS.md es el respaldo.

## Preparar el proyecto

`specty check --install` prepara el proyecto para sus verificaciones. Muestra el diff de cada archivo y pregunta antes de escribirlo; con `--dry-run` solo enseña el plan. Puede hacer esto:

- activar `checks.preCommit`;
- escribir la plantilla de CI;
- poner el analizador de Dart en modo estricto;
- instalar el hook de fin de turno de cada agente;
- añadir las exclusiones de ruido de cada agente: dependencias, build y código generado;
- con tu confirmación, añadir dependency-cruiser como devDependency con versión exacta.

Nunca pisa lo que ya decidiste distinto: lo informa como conflicto. Ejecutarlo dos veces no duplica nada.

## Ejemplos por stack

Cada stack tiene un repositorio de ejemplo en `packages/cli/test/`, con un cambio aprobado, que ejecuta `specty check --changed --spec` dos veces:

- con un cambio que respeta el plan, y todas las verificaciones pasan;
- con otro que rompe cada verificación a la vez, y todas fallan.

| Stack | Archivo | Comandos que imita |
| --- | --- | --- |
| Angular y NestJS | `check-examples-ts.test.ts` | Prettier, ESLint, tsc y sus tests |
| Flutter | `check-examples-flutter.test.ts` | `dart format`, `flutter analyze` y `flutter test` |
| Python | `check-examples-scripting.test.ts` | ruff (formato y lint), mypy y pytest |
| Ruby | `check-examples-scripting.test.ts` | RuboCop, Sorbet y RSpec |
| PHP | `check-examples-scripting.test.ts` | PHP CS Fixer, PHP_CodeSniffer, PHPStan y Pest |
| Java (Maven) | `check-examples-jvm.test.ts` | Spotless, Checkstyle y `mvn test` |
| Kotlin (Gradle) | `check-examples-jvm.test.ts` | ktlint, detekt y `gradle test` |
| C# (.NET) | `check-examples-jvm.test.ts` | `dotnet format`, `dotnet build` y `dotnet test` |
| Go | `check-examples-native.test.ts` | golangci-lint y `go test` con Ginkgo |
| Rust | `check-examples-native.test.ts` | `cargo fmt --check`, Clippy y `cargo test` |
| Swift | `check-examples-native.test.ts` | swift-format, SwiftLint y `swift test` con Swift Testing |

Los nueve últimos los arma `stack-dialect.ts` a partir de los datos de cada stack: sus rutas, su manifiesto, su sintaxis y sus herramientas.

Los comandos del proyecto son imitaciones de sus herramientas, porque las reales necesitan instalar dependencias. Cada ejemplo tiene los que Specty detecta en su stack: Ruby y Go no tienen `format`, porque su formato lo comprueban RuboCop y golangci-lint, y `typecheck` solo aparece en TypeScript, Python, Ruby, PHP y C#; en los demás, los tipos los comprueba el analizador o el compilador, que corre con los tests.

Lo que un ejemplo no comprueba:

- `layers` sale «sin ejecutar» en TypeScript, porque los ejemplos no tienen dependency-cruiser, y no aparece en Ruby ni en Swift, cuyos imports Specty no lee.
- `focused-tests` pasa también con el cambio que lo rompe todo en Python, Java, Kotlin, C#, Rust y Swift: sus frameworks de test no tienen una marca de foco.
- `secrets` sale «sin ejecutar» si no hay un escáner en el PATH.

## Añadir un proveedor

Lo propio de cada stack vive en un proveedor con una interfaz común (`packages/cli/src/check/provider.ts`). Añadir un stack es añadir un proveedor, sin tocar el núcleo.

```ts
interface Provider {
  readonly id: string;
  applies(stacks: readonly Stack[]): boolean;  // ¿aplica a los stacks del repositorio?
  readonly checks: readonly CheckDefinition[];
}

interface CheckDefinition {
  readonly id: string;          // estable: su clave en checks.levels y su nombre en la salida
  readonly exclusive?: boolean; // cambia archivos mientras corre: va sola, al final
  run(context: CheckContext): Promise<{ findings: Finding[] } | { skipped: string }>;
}
```

El contexto trae los archivos de la ejecución, ya sin lo excluido (`files`, `deleted`), su texto según el modo (`read`), el de donde empieza la ejecución (`before`) y las líneas que añade el diff (`added`). Un hallazgo es `{ path?, line?, message, severity? }`.

### Lo que ya funciona en Java, Kotlin, PHP, Ruby y .NET

Specty ya detecta esos stacks. Sin un proveedor propio funcionan:

- el formato, el lint y los tipos que el proyecto configura: RuboCop, Standard, Sorbet y Steep en Ruby; PHPStan, Psalm, PHP_CodeSniffer, Pint y PHP CS Fixer en PHP; Spotless, Checkstyle, PMD, detekt y ktlint en Java y Kotlin; `dotnet build` en .NET;
- `tests` con su comando: `mvn test` o `gradle test`, `composer test` o `php artisan test`, `bundle exec rspec` o `bin/rails test`, `dotnet test`;
- `function-lines` y `complexity`;
- `max-lines`, `focused-tests` y `skipped-tests`, que ya conocen `@Disabled`, `@Ignore`, `[Ignore]`, `Skip =` de xUnit, `focus: true` de RSpec y `->only()` y `->skip()` de Pest;
- `todo`, `secrets` y `suppressions`, con las supresiones de cada lenguaje;
- las del plan, con `dependencies` en sus manifiestos;
- `generated`, con `checks.generators`.

Un proveedor añadiría:

- su lint, formato y tipos, si Specty no los detecta; mientras, sirve `checks.commands`;
- su tipado estricto, más allá de las supresiones: por ejemplo, el `!!` de Kotlin;

### Pasos

1. Crea `packages/cli/src/check/<stack>.ts` con el proveedor. `applies` mira `stack.language` (`java`, `kotlin`, `php`, `ruby`, `csharp`).
2. Usa la herramienta del propio proyecto si está (`./gradlew`, `vendor/bin/…`, `bin/…`). Si no, devuelve `{ skipped: "<qué instalar>" }`, o usa una detección propia en el core, que no puede usar APIs de Node. Specty no gana dependencias.
3. Los mensajes, en español y en inglés, con `translator(context.session.lang)`. Con `--changed` y `--staged`, mira solo las líneas de `added(path)` cuando la regla es sobre lo que añade el cambio.
4. Regístralo en `providersOf` de `packages/cli/src/commands/check.ts`, en el orden del informe.
5. Escribe sus tests con salidas grabadas de la herramienta y, si está instalada, con la real.
6. Documenta cada verificación nueva aquí y en [checks.en.md](checks.en.md), con su id como título: un test compara estos títulos con las verificaciones que existen.

Un ejemplo para Kotlin, que prohíbe las aserciones no nulas (`!!`) que añade el cambio. Para que quepa aquí, no distingue comentarios ni cadenas:

```ts
// SPDX-License-Identifier: Apache-2.0
import { type Finding, translator } from "@baquia-dev/specty-core";
import type { CheckDefinition, Provider } from "./provider";

const nonNull: CheckDefinition = {
  id: "kotlin-non-null",
  async run(context) {
    const t = translator(context.session.lang);
    const findings: Finding[] = [];
    for (const path of context.files.filter((file) => /\.kts?$/.test(file))) {
      const added = context.added(path);
      const lines = ((await context.read(path)) ?? "").split("\n");
      lines.forEach((text, index) => {
        if (added !== undefined && !added.has(index + 1)) return;
        if (!text.includes("!!")) return;
        const message = t("aserción no nula (!!)", "non-null assertion (!!)");
        findings.push({ path, line: index + 1, message });
      });
    }
    return { findings };
  },
};

export const kotlinProvider: Provider = {
  id: "kotlin",
  applies: (stacks) => stacks.some((stack) => stack.language === "kotlin"),
  checks: [nonNull],
};
```
