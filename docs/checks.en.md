# `specty check` checks

[Español](checks.md)

A rule that a tool can verify should not depend on the agent reading it and following it ([ADR 0012](decisions/0012-lo-verificable-lo-verifica-specty.md), in Spanish). `specty check` runs those checks on the repository. It is deterministic: it calls no model and needs no agent, so it gives the same result in the terminal, in CI or at the end of each task. This guide explains each check, how to configure it and how to turn it off. The format's details are in [formats.md §6](formats.md#6-configyaml), in Spanish.

## Usage

```text
specty check [--changed | --staged | --all] [--spec [id]] [--verbose] [--json]
```

- `--changed` (default): what changed against the merge-base with the target branch, plus new files. This is the mode meant for agents.
- `--staged`: what is staged for the commit, read from the index. This is the pre-commit mode.
- `--all`: everything git tracks. This is the CI mode.
- `--spec [id]`: adds the checks of the approved plan of change `id` or, without it, of the folder's active change. It does not combine with `--all`.
- `--verbose`: also what passed, and why a check did not run.
- `--json`: the full result, for CI.

The output shows only failures and warnings, grouped by check, with `path:line` and a one-line message, and ends with a summary:

```text
FAIL layers
  src/domain/user.ts:3 domain may not import the package @angular/core
FAIL max-lines
  src/app/cart.service.ts 512 lines of code (max 500)
FAIL todo
  src/app/cart.ts:40 TODO without an issue reference
OK 14/17 · FAIL: layers, max-lines, todo
```

It exits with 1 when an `error`-level check fails; warnings never fail the run. A check that cannot run, because its tool is missing, shows as `NOT RUN`, and `--verbose` says why.

## Common configuration

Everything goes under `checks` in `.specty/config.yaml`:

```yaml
checks:
  levels: { todo: warn, secrets: off }  # error | warn | off per check; without the key, error
  maxFindings: 10                       # failures shown per check before "… and N more"
  exclude: ["**/node_modules/**", "**/build/**"]  # what no check looks at
```

- **Turning a check off:** `checks.levels: { <id>: off }`. With `warn`, its failures only warn. It works the same for every check; each section below also says whether there is another way.
- **What is never looked at:** `checks.exclude` (by default `node_modules`, `build`, `dist`, `.dart_tool`, `out`, `target`, `coverage`, `vendor`, `.next`, `.angular` and `.gradle`), the `ignored` paths and the generated code of `scope.generated`.
- **Messages:** in the `language` of the configuration (`es` or `en`).

## The checks

They show in this order: the project's commands, each stack's, those for any language and, with `--spec`, the plan's.

### `format`

Checks the format with the project's command, only in its checking form, never the one that rewrites files. Specty detects it when the project already configures the tool:

- TypeScript or JavaScript: the `format:check`, `fmt:check` or `check:format` script.
- Dart: `dart format --output=none --set-exit-if-changed .`.
- Rust: `cargo fmt --check`.
- Python: `ruff format --check` with ruff or, otherwise, `black --check .` with `[tool.black]` or black in the manifests. Like everything in Python, with the manager's prefix (`uv run`, `poetry run`…).
- PHP: the `cs:check`, `format:check`, `check:format` or `fmt:check` script of `composer.json`; otherwise, `vendor/bin/pint --test` with `pint.json` or `laravel/pint`, or `vendor/bin/php-cs-fixer check` with `.php-cs-fixer.php` or `.php-cs-fixer.dist.php`.
- Java and Kotlin: Gradle's `spotlessCheck` task (with `./gradlew` when it exists) or `mvn spotless:check`, with Spotless configured.
- Swift: `swift format lint --strict --recursive .` with `.swift-format`; without `--strict`, a format violation does not fail.
- .NET: `dotnet format --verify-no-changes`.

In Go, `golangci-lint run` checks the format with the formatters of its configuration (see `lint`).

**Configuration:** `checks.commands.format` sets or replaces it. Without a command, the check does not show.

**Disable:** `levels: { format: off }`.

### `lint`

Runs the lint the project has:

- TypeScript or JavaScript: the `lint` script of `package.json`.
- Dart: `flutter analyze` or `dart analyze`.
- Python: `ruff check` with ruff or, otherwise, `flake8` with `.flake8` or `[flake8]` in `setup.cfg` or `tox.ini`.
- Go: `golangci-lint run` with `.golangci.yml`, `.yaml`, `.toml` or `.json`; otherwise, `go vet ./...`.
- Rust: `cargo clippy -- -D warnings`.
- Ruby: `bundle exec standardrb` with `.standard.yml` or the `standard` gem; otherwise, `bundle exec rubocop` with `.rubocop.yml` or the `rubocop` gem.
- PHP: the `lint`, `phpcs` or `cs` script of `composer.json`; otherwise, `vendor/bin/phpcs` with `.phpcs.xml`, `phpcs.xml` or their `.dist`.
- Java and Kotlin: with Gradle, one call with the configured tasks: `checkstyleMain`, `pmdMain`, `detekt` and `ktlintCheck`. With Maven, `mvn checkstyle:check pmd:check`, depending on what `pom.xml` has. Plugins are looked for in the root build file, by their id or their version-catalog alias.
- Swift: `swiftlint lint` with `.swiftlint.yml`, with the severity its configuration sets (`strict: true` turns warnings into errors).

It passes when it exits with 0. Otherwise it turns the output into `path:line` findings, whatever the tool.

**Configuration:** `checks.commands.lint`.

**Disable:** `levels: { lint: off }`.

### `typecheck`

Runs the type check the project has:

- TypeScript: the `typecheck`, `type-check` or `tsc` script of `package.json`.
- Python: `mypy .` with `mypy.ini`, `.mypy.ini`, `[tool.mypy]` or `[mypy]` in `setup.cfg`; otherwise, `pyright` with `pyrightconfig.json` or `[tool.pyright]`.
- Ruby: `bundle exec srb tc` with `sorbet/config`; otherwise, `bundle exec steep check` with `Steepfile`.
- PHP: the `analyse`, `analyze`, `phpstan`, `psalm` or `stan` script of `composer.json`; otherwise, `vendor/bin/phpstan analyse --no-progress` with `phpstan.neon`, `phpstan.neon.dist` or `phpstan.dist.neon`, or `vendor/bin/psalm --no-progress` with `psalm.xml` or `psalm.xml.dist`.
- C#: `dotnet build`.

**Configuration:** `checks.commands.typecheck`.

**Disable:** `levels: { typecheck: off }`.

### `tests`

Runs the project's tests with the command Specty detects for each stack: `pnpm test`, `flutter test`, `pytest`, `go test ./...`, `cargo test`, `dotnet test`, `mvn test` or `gradle test`, `bundle exec rspec`, `php artisan test`…

**Configuration:** `checks.commands.tests`.

**Disable:** `levels: { tests: off }`.

The four commands look at the whole project, because a change can break files it did not touch, and they have the time limit of `verify.timeoutSec`. Specty only runs a tool the project configures and never adds one; when it is configured but not installed, its check fails with the command's exit code, and `checks.commands` or `checks.levels` adjust that. `specty task done` does not run them when the task already has a verification (see "Where it runs").

### `strict-types`

**Stack:** TypeScript.

Forbids, in the added lines, an explicit `any`, `@ts-ignore`, `@ts-nocheck` and the non-null assertion (`x!`). It skips `*.d.ts` files. When the project has ESLint with typescript-eslint, it uses it with the `no-explicit-any`, `ban-ts-comment` and `no-non-null-assertion` rules. Otherwise it uses Specty's own detection, so the rule also holds with Biome or with no lint.

**Configuration:** none.

**Disable:** `levels: { strict-types: off }`.

### `dart-strict`

**Stack:** Dart and Flutter.

Requires the analyzer in strict mode: `strict-casts`, `strict-inference` and `strict-raw-types` set to `true` under `analyzer.language` of `analysis_options.yaml`, its own or brought in by its `include`. It also fails on each `// ignore:` or `// ignore_for_file:` the change adds. `specty check --install` adds the missing modes.

**Configuration:** that of `analysis_options.yaml` itself.

**Disable:** `levels: { dart-strict: off }`.

### `suppressions`

**Stack:** any except Dart, whose `// ignore:` is watched by `dart-strict`. It looks at each file by its extension.

Fails on each comment or annotation the change adds to switch the compiler, the type checker or the linter off: a silenced error is still there. Markers that are comments only count inside a comment, and those that are code, outside strings. With `--changed` and `--staged`, only on the added lines. The catalog:

- Python: `# noqa`, `# ruff: noqa`, `# ruff: ignore`, `# ruff: disable` and `# ruff: file-ignore`, `# flake8: noqa`, `# type: ignore`, `# mypy: ignore-errors` and `# mypy: disable-error-code`, `# pyright: ignore`, `# pylint: disable`, `disable-next` and `skip-file`.
- JavaScript and TypeScript: `eslint-disable`, `eslint-disable-line` and `eslint-disable-next-line`; `biome-ignore`, `biome-ignore-all` and `biome-ignore-start`. `@ts-ignore` and `@ts-nocheck` belong to `strict-types`.
- Java: `@SuppressWarnings`, `@SuppressFBWarnings`, `NOSONAR`, `CHECKSTYLE:OFF`. Kotlin: `@Suppress`, `@file:Suppress`, `@SuppressWarnings`, `NOSONAR`.
- C#: `#pragma warning disable`, `#nullable disable`, `SuppressMessage` and `UnconditionalSuppressMessage`, `ReSharper disable`, `NOSONAR`.
- Go: `//nolint`, `//lint:ignore` and `//lint:file-ignore` (with no space after `//`, as golangci-lint and staticcheck read them), `#nosec`.
- Rust: `#[allow(…)]` and `#[expect(…)]`, also as `#![…]`.
- PHP: `@phpstan-ignore`, `@phpstan-ignore-line` and `@phpstan-ignore-next-line`, `phpcs:ignore`, `phpcs:disable` and `phpcs:ignoreFile`, `@psalm-suppress`, `@SuppressWarnings`, `NOSONAR`.
- Ruby: `# rubocop:disable` and `# rubocop:todo`. Elixir: `# credo:disable-for-…`. Swift: `swiftlint:disable` and `swift-format-ignore`.
- C and C++: `NOLINT`, `NOLINTNEXTLINE` and `NOLINTBEGIN`, `#pragma warning(disable…)`, `#pragma GCC diagnostic ignored` and `#pragma clang diagnostic ignored`.

**Configuration:** none. If a project often needs a justified suppression, `warn` leaves it as a warning.

**Disable:** `levels: { suppressions: off }`.

### `layers`

**Stack:** TypeScript, JavaScript, Dart, Flutter, Python, Go, Rust, Java, Kotlin, PHP and C#, when layers are configured.

Fails on each import that crosses the Clean Architecture layers: for example, the domain importing the framework, the infrastructure or the UI.

- In TypeScript and JavaScript, the project's dependency-cruiser resolves the imports, with the aliases of `tsconfig.json`. Without it, the check does not run, and `specty check --install` offers to add it with its exact version.
- In Dart, Python, Go, Rust, Java, Kotlin, PHP and C#, a scanner of Specty's own reads them, with no tools:
  - Dart: the `import` and `export` directives; a `package:` with the name of `pubspec.yaml` is a file of `lib/`.
  - Python: `import a.b` and `from a.b import c`. A module is the project's when it is a file or a folder of the repository, at its root or under `src/`; otherwise it is the package of its first name (`requests`). Relative ones resolve from the file's folder.
  - Go: the `import "path"` specs; a path under the `module` of `go.mod` is the folder `<folder>/*.go`, and any other is its package (`fmt`, `github.com/jackc/pgx`).
  - Rust: the `use` and `extern crate` items; `crate::a::b` is `a/b` under the crate's `src`, `super::` and `self::` start at the file's module, and any other first name is its crate (`std`, `sqlx`).
  - Java and Kotlin: the `import` declarations, `static` and wildcard ones too. An import is the project's when its first names, two at least, end the path of a folder with `.java` or `.kt` files; otherwise it is the package by its full name, which `org.springframework.*` covers.
  - PHP: the `use` statements before the first class (inside one, `use` brings a trait), with `function`, `const` and groups. A name is the project's when a PSR-4 prefix of `composer.json` covers it; otherwise it is the package with its `\` as `/` (`Illuminate/Support/Facades/DB`), which `Illuminate/**` covers.
  - C#: the `using` directives, `global`, `static` and aliases too, but not `using var` or `using (…)`. A name is the project's when it is a namespace one of its `.cs` files declares (or is one without its last part), and goes to `<folder>/*.cs`; otherwise it is the package by its full name, which `Microsoft.EntityFrameworkCore*` covers.

**Configuration:**

```yaml
checks:
  layers:
    domain: { paths: ["src/domain/**"], forbiddenPackages: ["@angular/*", "@nestjs/*", "node:*"] }
    application: { paths: ["src/application/**"], may: [domain] }
    infrastructure: { paths: ["src/infrastructure/**"], may: [application, domain] }
    ui: { paths: ["src/ui/**"], may: [application, domain] }
```

Each layer has its paths (`paths`), the layers it may import (`may`; itself and whatever is in no layer, always) and the packages it may not (`forbiddenPackages`).

**Disable:** remove `checks.layers` (without layers it does not show) or `levels: { layers: off }`.

### `function-lines`

**Stack:** every stack except Elixir. In the languages with braces, a function goes from its header to the brace that closes it; in Python, from its `def` to its last line indented deeper; in Ruby, from its `def` to the `end` that closes it.

The lines of code of each function, without blank lines or comments. It fails on a function the change touches that is over the limit and is new or grew. One that was already over and did not grow does not count, except with `--all`. Tests are not measured.

**Configuration:** `checks.functions.maxLines` (50).

**Disable:** `levels: { function-lines: off }`.

### `complexity`

**Stack:** the same as `function-lines`.

The cyclomatic complexity of each function: 1 plus each `if`, `for`, `while`, `case`, `catch`, `guard`, `&&`, `||`, `??` and ternary. It fails in the same cases as `function-lines`.

**Configuration:** `checks.functions.complexity` (10).

**Disable:** `levels: { complexity: off }`.

### `generated`

**Stack:** whichever has a generator.

Checks that the generated code matches what its generator produces, like a `git diff --exit-code` after regenerating, without leaving anything changed. It regenerates, compares and restores the files. It runs alone, after the others. With `--changed` and `--staged`, a generator only runs when the change touches its inputs or outputs. Specty detects:

- Prisma, with an `output` in its schema;
- build_runner, in Dart, for `*.g.dart`, `*.freezed.dart` and the like.

**Configuration:** `checks.generators` adds others, with their `command`, their `outputs` and, optionally, their `inputs`.

**Disable:** `levels: { generated: off }`.

### `max-lines`

**Stack:** any.

The lines of code of each file, without blank lines or comments. It warns above `lines.warn` and fails above `lines.fail`.

**Configuration:** the `lines` rule: `warn: 300`, `fail: 500`, `tests: { warn: 400, fail: 600 }` and `exclude`.

**Disable:** `levels: { max-lines: off }`, or `lines.fail: false` so that it only warns.

### `focused-tests`

**Stack:** any; it only looks at test files.

A focused test leaves the others out: `describe.only`, `fit`, `fdescribe`, Dart's `solo: true`, RSpec's `focus: true`, Ginkgo's `FIt` and `Focus` decorator, Pest's `->only()`. With `--changed` and `--staged`, only in the added lines.

**Configuration:** none.

**Disable:** `levels: { focused-tests: off }`.

### `skipped-tests`

**Stack:** any; it only looks at test files.

A test switched off by a marker: `it.skip`, `xit`, `xdescribe`, Dart's `skip:`, `@pytest.mark.skip`, `#[ignore]`, `@Disabled`, `@Ignore`, `[Ignore]`, Ginkgo's `PIt`, `XIt` and `Pending` decorator, Swift Testing's `.disabled()`, Pest's `->skip()`… Conditional skips that the test itself decides do not count (`test.skipIf`, `@pytest.mark.skipif`, `t.Skip()`, `->skip($condition)`, `.enabled(if:)`).

**Configuration:** none.

**Disable:** `levels: { skipped-tests: off }`.

### `todo`

**Stack:** any.

A marker of pending work at the start of a comment, with no reference to an issue in the rest of the line. By default `#12`, `acme/app#12`, a key such as `ABC-12` or a link count as references.

**Configuration:**

```yaml
checks:
  todo:
    markers: ["TODO", "FIXME"]
    reference: "#\\d+|\\b[A-Z][A-Z0-9]+-\\d+\\b|https?://\\S+"
```

**Disable:** `levels: { todo: off }`.

### `secrets`

**Stack:** any.

Looks for secrets with Betterleaks or, when it is missing, with gitleaks, on a temporary copy of the run's files, and always with `--redact`. With no scanner installed, it does not run and says what to install. For a false positive, the `betterleaks:allow` or `gitleaks:allow` comments and each scanner's ignore files work.

**Configuration:** the scanner's (`.gitleaks.toml`, `.betterleaks.toml`, `.gitleaksignore`, `.betterleaksignore`).

**Disable:** `levels: { secrets: off }`.

### `spec-approved`

**With:** `--spec`.

The change's spec is approved and has not changed since; the closing, which comes later, does not count. The approval lives in `state.json`, which the agent cannot write. It also fails when the change is cancelled or does not exist.

**Configuration:** none.

**Disable:** `levels: { spec-approved: off }`.

### `scope`

**With:** `--spec`.

Each file the diff touches or deletes is in the spec's "Files" section, in some task's `files` or in an approved extension. Tests next to those files and generated code are in on their own. It lists each path left outside.

**Configuration:** `scope.implicitTests` and `scope.generated`.

**Disable:** `levels: { scope: off }`.

### `dependencies`

**With:** `--spec`.

Each dependency the diff adds to a manifest is in `allowedDependencies` of the spec's frontmatter, by name or by glob. A version change does not count, and a new manifest counts with all its dependencies. It reads these manifests, in any folder:

- JavaScript and TypeScript: `package.json` (`dependencies`, `devDependencies`, `peerDependencies` and `optionalDependencies`).
- Dart and Flutter: `pubspec.yaml`, without the SDK's packages.
- Python: `requirements.txt` and `requirements*.txt`; `pyproject.toml` (`[project] dependencies`, `[project.optional-dependencies]`, `[dependency-groups]` and Poetry's tables, except `python`).
- Go: `go.mod`, without the requirements marked `// indirect`.
- Rust: `Cargo.toml`, all its dependency tables.
- Ruby: `Gemfile`. PHP: `composer.json`, without `php`, `ext-*` or `lib-*`.
- Java and Kotlin, as `group:artifact`: `pom.xml` (without `<dependencyManagement>` or the plugins'), `build.gradle` and `build.gradle.kts`, and the `gradle/libs.versions.toml` catalog.
- .NET: the `PackageReference` of each `.csproj`, `.fsproj` or `.vbproj`, and `Directory.Packages.props`.
- Swift: `Package.swift`, by the last part of each package's `url`.

**Configuration:** in the spec, `allowedDependencies: [zod, "@angular/*", "com.squareup.okhttp3:*"]`.

**Disable:** `levels: { dependencies: off }`.

### `fix-tests`

**With:** `--spec`.

Each `type: fix` task, active or done, brings a test of its own in the diff: from its `files`, from its extensions or next to them. A test right under the root of its test folder (`tests/cart.rs`, `test/cart_test.dart`, `Tests/ShopTests/CartTests.swift`) mirrors the whole source root, so it only counts for the file of its name, without the test marks (`test_`, `_test`, `.test`, `Test`…); in a subfolder, or when the task has a glob, any test of the folder counts. `scope` still lets the task touch any of them.

**Configuration:** none.

**Disable:** `levels: { fix-tests: off }`, or `warn` so that a `fix` task without a test only warns.

### `tests-removed`

**With:** `--spec`.

Warns, without ever failing, about each test the diff deletes and each test file left with fewer cases than at the start.

**Configuration:** none.

**Disable:** `levels: { tests-removed: off }`.

## Where it runs

- **`specty task done`** runs `specty check --changed --spec` before the task's verification, and does not complete the task with failures. It leaves out `scope` and `max-lines`, which it already checks per task. When the task has a verification, it also leaves out the project's four commands, so that the tests do not run twice.
- **The pre-commit hook** runs `specty check --staged` on manual changes with `checks.preCommit: true`.
- **CI** runs `specty check --all --json` with the GitHub Actions template.
- **The agent's end of turn** runs `specty check --changed`, with `--spec` when there is an approved change. If it fails, the agent gets the report and keeps going instead of reporting the task as done. It works in Claude Code, Cursor and Codex, which have a documented end-of-turn hook. In other agents, the written rule in the AGENTS.md block is the fallback.

## Preparing the project

`specty check --install` prepares the project for its checks. It shows the diff of each file and asks before writing it; with `--dry-run` it only shows the plan. It can do this:

- turn on `checks.preCommit`;
- write the CI template;
- put the Dart analyzer in strict mode;
- install each agent's end-of-turn hook;
- add each agent's noise exclusions: dependencies, build output and generated code;
- with your confirmation, add dependency-cruiser as a devDependency with an exact version.

It never overwrites what you already decided differently: it reports it as a conflict. Running it twice duplicates nothing.

## Examples per stack

Each stack has an example repository in `packages/cli/test/`, with an approved change, that runs `specty check --changed --spec` twice:

- with a change that keeps to the plan, and every check passes;
- with another that breaks every check at once, and they all fail.

| Stack | File | Commands it stands in for |
| --- | --- | --- |
| Angular and NestJS | `check-examples-ts.test.ts` | Prettier, ESLint, tsc and their tests |
| Flutter | `check-examples-flutter.test.ts` | `dart format`, `flutter analyze` and `flutter test` |
| Python | `check-examples-scripting.test.ts` | ruff (format and lint), mypy and pytest |
| Ruby | `check-examples-scripting.test.ts` | RuboCop, Sorbet and RSpec |
| PHP | `check-examples-scripting.test.ts` | PHP CS Fixer, PHP_CodeSniffer, PHPStan and Pest |
| Java (Maven) | `check-examples-jvm.test.ts` | Spotless, Checkstyle and `mvn test` |
| Kotlin (Gradle) | `check-examples-jvm.test.ts` | ktlint, detekt and `gradle test` |
| C# (.NET) | `check-examples-jvm.test.ts` | `dotnet format`, `dotnet build` and `dotnet test` |
| Go | `check-examples-native.test.ts` | golangci-lint and `go test` with Ginkgo |
| Rust | `check-examples-native.test.ts` | `cargo fmt --check`, Clippy and `cargo test` |
| Swift | `check-examples-native.test.ts` | swift-format, SwiftLint and `swift test` with Swift Testing |

`stack-dialect.ts` builds the last nine from the data of each stack: its paths, its manifest, its syntax and its tools.

The project's commands are stand-ins for its tools, because the real ones need their dependencies installed. Each example has the ones Specty detects in its stack: Ruby and Go have no `format`, because RuboCop and golangci-lint check their format, and `typecheck` only appears in TypeScript, Python, Ruby, PHP and C#; in the others, the analyzer or the compiler, which runs with the tests, checks the types.

What an example does not check:

- `layers` shows as `NOT RUN` in TypeScript, because the examples have no dependency-cruiser, and does not appear in Ruby or Swift, whose imports Specty does not read.
- `focused-tests` passes with the change that breaks everything too in Python, Java, Kotlin, C#, Rust and Swift: their test frameworks have no focus marker.
- `secrets` shows as `NOT RUN` when there is no scanner on PATH.

## Adding a provider

What belongs to each stack lives in a provider with a common interface (`packages/cli/src/check/provider.ts`). Adding a stack means adding a provider, without touching the core.

```ts
interface Provider {
  readonly id: string;
  applies(stacks: readonly Stack[]): boolean;  // does it apply to the repository's stacks?
  readonly checks: readonly CheckDefinition[];
}

interface CheckDefinition {
  readonly id: string;          // stable: its key in checks.levels and its name in the output
  readonly exclusive?: boolean; // changes files while it runs: it goes alone, at the end
  run(context: CheckContext): Promise<{ findings: Finding[] } | { skipped: string }>;
}
```

The context brings the run's files, already without what is excluded (`files`, `deleted`), their text as the mode sees it (`read`), their text where the run starts (`before`) and the lines the diff adds (`added`). A finding is `{ path?, line?, message, severity? }`.

### What already works in Java, Kotlin, PHP, Ruby and .NET

Specty already detects those stacks. Without a provider of their own, these work:

- the format, lint and types the project configures: RuboCop, Standard, Sorbet and Steep in Ruby; PHPStan, Psalm, PHP_CodeSniffer, Pint and PHP CS Fixer in PHP; Spotless, Checkstyle, PMD, detekt and ktlint in Java and Kotlin; `dotnet build` in .NET;
- `tests` with its command: `mvn test` or `gradle test`, `composer test` or `php artisan test`, `bundle exec rspec` or `bin/rails test`, `dotnet test`;
- `function-lines` and `complexity`;
- `max-lines`, `focused-tests` and `skipped-tests`, which already know `@Disabled`, `@Ignore`, `[Ignore]`, xUnit's `Skip =`, RSpec's `focus: true` and Pest's `->only()` and `->skip()`;
- `todo`, `secrets` and `suppressions`, with each language's suppressions;
- the plan's checks, with `dependencies` in their manifests;
- `generated`, with `checks.generators`.

A provider would add:

- its lint, format and types, when Specty does not detect them; meanwhile, `checks.commands` works;
- its strict typing beyond suppressions: Kotlin's `!!`, for example;

### Steps

1. Create `packages/cli/src/check/<stack>.ts` with the provider. `applies` looks at `stack.language` (`java`, `kotlin`, `php`, `ruby`, `csharp`).
2. Use the project's own tool when it is there (`./gradlew`, `vendor/bin/…`, `bin/…`). Otherwise return `{ skipped: "<what to install>" }`, or use a detection of your own in the core, which cannot use Node APIs. Specty gains no dependencies.
3. Write the messages in Spanish and in English, with `translator(context.session.lang)`. With `--changed` and `--staged`, look only at the lines of `added(path)` when the rule is about what the change adds.
4. Register it in `providersOf` of `packages/cli/src/commands/check.ts`, in the report's order.
5. Write its tests with recorded outputs of the tool and, when it is installed, with the real one.
6. Document each new check here and in [checks.md](checks.md), with its id as the heading: a test compares these headings with the checks that exist.

An example for Kotlin that forbids the non-null assertions (`!!`) the change adds. To keep it short, it does not tell comments and strings apart:

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
