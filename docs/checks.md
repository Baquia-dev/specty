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

Comprueba el formato con el comando del proyecto, solo en su forma de comprobación, nunca la que reescribe archivos. Specty lo detecta en estos casos:

- TypeScript o JavaScript: el script `format:check`, `fmt:check` o `check:format`.
- Dart: `dart format --output=none --set-exit-if-changed .`.
- Rust: `cargo fmt --check`.
- Python con ruff: `ruff format --check`.
- .NET: `dotnet format --verify-no-changes`.

**Configuración:** `checks.commands.format` lo fija o lo cambia. Sin comando, la verificación no aparece.

**Desactivar:** `levels: { format: off }`.

### `lint`

Ejecuta el lint del proyecto: el script `lint` de `package.json`, `flutter analyze` o `dart analyze`, `ruff check`, `go vet ./...` o `cargo clippy -- -D warnings`. Pasa si sale con 0. Si no, convierte su salida en hallazgos `ruta:línea`, cualquiera que sea la herramienta.

**Configuración:** `checks.commands.lint`.

**Desactivar:** `levels: { lint: off }`.

### `typecheck`

Ejecuta la comprobación de tipos del proyecto: el script `typecheck`, `type-check` o `tsc` de `package.json`.

**Configuración:** `checks.commands.typecheck`.

**Desactivar:** `levels: { typecheck: off }`.

### `tests`

Ejecuta los tests del proyecto con el comando que Specty detecta en cada stack: `pnpm test`, `flutter test`, `pytest`, `go test ./...`, `cargo test`, `dotnet test`, `mvn test` o `gradle test`, `bundle exec rspec`, `php artisan test`…

**Configuración:** `checks.commands.tests`.

**Desactivar:** `levels: { tests: off }`.

Los cuatro comandos miran el proyecto entero, porque un cambio puede romper archivos que no tocó, y tienen el tiempo límite de `verify.timeoutSec`. `specty task done` no los ejecuta si la tarea ya tiene verificación (ver «Dónde se ejecuta»).

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

### `layers`

**Stack:** TypeScript, JavaScript, Dart y Flutter, cuando hay capas configuradas.

Falla con cada import que cruza las capas de Clean Architecture: por ejemplo, el dominio que importa el framework, la infraestructura o la UI.

- En TypeScript y JavaScript, los imports los resuelve el dependency-cruiser del proyecto, con los alias de `tsconfig.json`. Sin él, la verificación no corre, y `specty check --install` ofrece añadirlo con su versión exacta.
- En Dart, los lee un escáner propio, sin herramientas.

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

**Stack:** los lenguajes de llaves; todos los stacks salvo Python, Ruby y Elixir.

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

Un test enfocado deja sin correr a los demás: `describe.only`, `fit`, `fdescribe`, `solo: true` de Dart, `focus: true` de RSpec, `FIt` de Ginkgo. Con `--changed` y `--staged`, solo en las líneas añadidas.

**Configuración:** no tiene.

**Desactivar:** `levels: { focused-tests: off }`.

### `skipped-tests`

**Stack:** cualquiera; solo mira los archivos de test.

Un test apagado con una marca: `it.skip`, `xit`, `xdescribe`, `skip:` de Dart, `@pytest.mark.skip`, `#[ignore]`, `@Disabled`, `@Ignore`, `[Ignore]`… No cuentan los saltos condicionales que decide el propio test (`test.skipIf`, `@pytest.mark.skipif`, `t.Skip()`).

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

Cada dependencia que el diff añade a un `package.json` o a un `pubspec.yaml` está en `allowedDependencies` del frontmatter de la spec, por nombre o por glob. Un cambio de versión no cuenta.

**Configuración:** en la spec, `allowedDependencies: [zod, "@angular/*"]`.

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

Hay un repositorio de ejemplo de Angular y otro de NestJS en `packages/cli/test/check-examples-ts.test.ts`, y uno de Flutter en `packages/cli/test/check-examples-flutter.test.ts`. Cada uno tiene un cambio aprobado y ejecuta `specty check --changed --spec` dos veces:

- con un cambio que respeta el plan, y todas las verificaciones pasan;
- con otro que rompe cada verificación a la vez, y todas fallan.

Los comandos del proyecto son imitaciones de sus herramientas, porque las reales necesitan instalar dependencias. Salen «sin ejecutar» `layers` en TypeScript, porque los ejemplos no tienen dependency-cruiser, y `secrets` si no hay un escáner en el PATH.

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

- `tests` con su comando: `mvn test` o `gradle test`, `composer test` o `php artisan test`, `bundle exec rspec` o `bin/rails test`, `dotnet test`;
- `function-lines` y `complexity`, salvo en Ruby;
- `max-lines`, `focused-tests` y `skipped-tests`, que ya conocen `@Disabled`, `@Ignore`, `[Ignore]`, `Skip =` de xUnit y `focus: true` de RSpec;
- `todo` y `secrets`;
- las del plan;
- `generated`, con `checks.generators`.

Un proveedor añadiría:

- su lint, formato y tipos, si Specty no los detecta; mientras, sirve `checks.commands`;
- su tipado estricto;
- `layers`, con un escáner de imports;
- un lector de su manifiesto para `dependencies`: `pom.xml`, `build.gradle`, `composer.json`, `Gemfile` o `*.csproj`, en `packages/core/src/checks/dependencies.ts`.

### Pasos

1. Crea `packages/cli/src/check/<stack>.ts` con el proveedor. `applies` mira `stack.language` (`java`, `kotlin`, `php`, `ruby`, `csharp`).
2. Usa la herramienta del propio proyecto si está (`./gradlew`, `vendor/bin/…`, `bin/…`). Si no, devuelve `{ skipped: "<qué instalar>" }`, o usa una detección propia en el core, que no puede usar APIs de Node. Specty no gana dependencias.
3. Los mensajes, en español y en inglés, con `translator(context.session.lang)`. Con `--changed` y `--staged`, mira solo las líneas de `added(path)` cuando la regla es sobre lo que añade el cambio.
4. Regístralo en `providersOf` de `packages/cli/src/commands/check.ts`, en el orden del informe.
5. Escribe sus tests con salidas grabadas de la herramienta y, si está instalada, con la real.
6. Documenta cada verificación nueva aquí y en [checks.en.md](checks.en.md), con su id como título: un test compara estos títulos con las verificaciones que existen.

Un ejemplo para Java y Kotlin, que prohíbe los `@SuppressWarnings` que añade el cambio:

```ts
// SPDX-License-Identifier: Apache-2.0
import { type Finding, translator } from "@baquia-dev/specty-core";
import type { CheckDefinition, Provider } from "./provider";

const suppressions: CheckDefinition = {
  id: "jvm-suppressions",
  async run(context) {
    const t = translator(context.session.lang);
    const findings: Finding[] = [];
    for (const path of context.files.filter((file) => /\.(java|kt)$/.test(file))) {
      const added = context.added(path);
      const lines = ((await context.read(path)) ?? "").split("\n");
      lines.forEach((text, index) => {
        if (added !== undefined && !added.has(index + 1)) return;
        if (!text.includes("@SuppressWarnings")) return;
        const message = t("apaga avisos del compilador", "switches compiler warnings off");
        findings.push({ path, line: index + 1, message });
      });
    }
    return { findings };
  },
};

export const jvmProvider: Provider = {
  id: "jvm",
  applies: (stacks) => stacks.some((stack) => ["java", "kotlin"].includes(stack.language)),
  checks: [suppressions],
};
```
