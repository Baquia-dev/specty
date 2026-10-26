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

Checks the format with the project's command, only in its checking form, never the one that rewrites files. Specty detects it in these cases:

- TypeScript or JavaScript: the `format:check`, `fmt:check` or `check:format` script.
- Dart: `dart format --output=none --set-exit-if-changed .`.
- Rust: `cargo fmt --check`.
- Python with ruff: `ruff format --check`.
- .NET: `dotnet format --verify-no-changes`.

**Configuration:** `checks.commands.format` sets or replaces it. Without a command, the check does not show.

**Disable:** `levels: { format: off }`.

### `lint`

Runs the project's lint: the `lint` script of `package.json`, `flutter analyze` or `dart analyze`, `ruff check`, `go vet ./...` or `cargo clippy -- -D warnings`. It passes when it exits with 0. Otherwise it turns the output into `path:line` findings, whatever the tool.

**Configuration:** `checks.commands.lint`.

**Disable:** `levels: { lint: off }`.

### `typecheck`

Runs the project's type check: the `typecheck`, `type-check` or `tsc` script of `package.json`.

**Configuration:** `checks.commands.typecheck`.

**Disable:** `levels: { typecheck: off }`.

### `tests`

Runs the project's tests with the command Specty detects for each stack: `pnpm test`, `flutter test`, `pytest`, `go test ./...`, `cargo test`, `dotnet test`, `mvn test` or `gradle test`, `bundle exec rspec`, `php artisan test`…

**Configuration:** `checks.commands.tests`.

**Disable:** `levels: { tests: off }`.

The four commands look at the whole project, because a change can break files it did not touch, and they have the time limit of `verify.timeoutSec`. `specty task done` does not run them when the task already has a verification (see "Where it runs").

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

**Stack:** TypeScript, JavaScript, Dart and Flutter, when layers are configured.

Fails on each import that crosses the Clean Architecture layers: for example, the domain importing the framework, the infrastructure or the UI.

- In TypeScript and JavaScript, the project's dependency-cruiser resolves the imports, with the aliases of `tsconfig.json`. Without it, the check does not run, and `specty check --install` offers to add it with its exact version.
- In Dart, a scanner of Specty's own reads them, with no tools.

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

**Stack:** the languages with braces; every stack except Python, Ruby and Elixir.

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

A focused test leaves the others out: `describe.only`, `fit`, `fdescribe`, Dart's `solo: true`, RSpec's `focus: true`, Ginkgo's `FIt`. With `--changed` and `--staged`, only in the added lines.

**Configuration:** none.

**Disable:** `levels: { focused-tests: off }`.

### `skipped-tests`

**Stack:** any; it only looks at test files.

A test switched off by a marker: `it.skip`, `xit`, `xdescribe`, Dart's `skip:`, `@pytest.mark.skip`, `#[ignore]`, `@Disabled`, `@Ignore`, `[Ignore]`… Conditional skips that the test itself decides do not count (`test.skipIf`, `@pytest.mark.skipif`, `t.Skip()`).

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

Each dependency the diff adds to a `package.json` or a `pubspec.yaml` is in `allowedDependencies` of the spec's frontmatter, by name or by glob. A version change does not count.

**Configuration:** in the spec, `allowedDependencies: [zod, "@angular/*"]`.

**Disable:** `levels: { dependencies: off }`.

### `fix-tests`

**With:** `--spec`.

Each `type: fix` task, active or done, brings a test of its own in the diff: from its `files`, from its extensions or next to them.

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

There is an example repository for Angular and another for NestJS in `packages/cli/test/check-examples-ts.test.ts`, and one for Flutter in `packages/cli/test/check-examples-flutter.test.ts`. Each one has an approved change and runs `specty check --changed --spec` twice:

- with a change that keeps to the plan, and every check passes;
- with another that breaks every check at once, and they all fail.

The project's commands are stand-ins for its tools, because the real ones need their dependencies installed. These show as `NOT RUN`: `layers` in TypeScript, because the examples have no dependency-cruiser, and `secrets` when there is no scanner on PATH.

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

- `tests` with its command: `mvn test` or `gradle test`, `composer test` or `php artisan test`, `bundle exec rspec` or `bin/rails test`, `dotnet test`;
- `function-lines` and `complexity`, except in Ruby;
- `max-lines`, `focused-tests` and `skipped-tests`, which already know `@Disabled`, `@Ignore`, `[Ignore]`, xUnit's `Skip =` and RSpec's `focus: true`;
- `todo`, `secrets` and `suppressions`, with each language's suppressions;
- the plan's checks;
- `generated`, with `checks.generators`.

A provider would add:

- its lint, format and types, when Specty does not detect them; meanwhile, `checks.commands` works;
- its strict typing beyond suppressions: Kotlin's `!!`, for example;
- `layers`, with an import scanner;
- a reader of its manifest for `dependencies`: `pom.xml`, `build.gradle`, `composer.json`, `Gemfile` or `*.csproj`, in `packages/core/src/checks/dependencies.ts`.

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
