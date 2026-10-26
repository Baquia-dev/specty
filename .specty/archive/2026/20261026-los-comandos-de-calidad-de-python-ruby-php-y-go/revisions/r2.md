---
kind: standard
follows:
  - 20261026-supresiones-en-cualquier-lenguaje
---

# Los comandos de calidad de Python, Ruby, PHP y Go

## Objetivo

`specty check` ejecuta el formato, el lint y la comprobación de tipos que un proyecto de Python, Ruby, PHP o Go ya tiene configurados, igual que hace con los scripts de un proyecto de JavaScript. `specty init` también los detecta para `verify.full` y AGENTS.md. Specty nunca impone una herramienta: si el proyecto no la tiene configurada, esa verificación no aparece. Es la primera parte del segundo corte del plan para los stacks más populares.

## Fuera de alcance

- Java, Kotlin, C# y Swift: van en la segunda parte de este corte.
- El formato de Go: `golangci-lint run` ya ejecuta los formateadores que tenga configurados, y `gofmt -l` no falla por sí solo.
- Instalar o configurar herramientas en el proyecto.
- Cambiar los comandos de Rust, que ya tienen formato y lint.

## Supuestos

- A1: Una herramienta está configurada cuando están su archivo de configuración o su sección, o cuando el manifiesto la declara. Así lo documenta cada una.
  - impacto: alto
- A2: En Python, con el prefijo del gestor (`uv run`, `poetry run`…), el formato es `ruff format --check` con ruff o, si no, `black --check .` con `[tool.black]` o black en los manifiestos; el lint, `ruff check` o, si no, `flake8` con `.flake8` o `[flake8]` en `setup.cfg` o `tox.ini`; los tipos, `mypy .` con `mypy.ini`, `.mypy.ini`, `[tool.mypy]` o `[mypy]` en `setup.cfg` y, si no, `pyright` con `pyrightconfig.json` o `[tool.pyright]`.
  - impacto: alto
- A3: En Ruby, el lint es `bundle exec standardrb` con `.standard.yml` o la gema `standard` y, si no, `bundle exec rubocop` con `.rubocop.yml` o la gema `rubocop`; los tipos, `bundle exec srb tc` con `sorbet/config` y, si no, `bundle exec steep check` con `Steepfile`.
  - impacto: alto
- A4: En PHP mandan los scripts de `composer.json`: `lint`, `phpcs` o `cs` para el lint; `analyse`, `analyze`, `phpstan`, `psalm` o `stan` para los tipos; `cs:check`, `format:check`, `check:format` o `fmt:check` para el formato. Sin script, los tipos son `vendor/bin/phpstan analyse --no-progress` con `phpstan.neon`, `phpstan.neon.dist` o `phpstan.dist.neon` y, si no, `vendor/bin/psalm --no-progress` con `psalm.xml` o `psalm.xml.dist`; el lint, `vendor/bin/phpcs` con `.phpcs.xml`, `phpcs.xml` o sus `.dist`; el formato, `vendor/bin/pint --test` con `pint.json` o `laravel/pint` y, si no, `vendor/bin/php-cs-fixer check` con `.php-cs-fixer.php` o `.php-cs-fixer.dist.php`.
  - impacto: alto
- A5: En Go, `golangci-lint run` sustituye a `go vet ./...` como lint cuando hay `.golangci.yml`, `.golangci.yaml`, `.golangci.toml` o `.golangci.json`.
- A6: Las herramientas detectadas se guardan en un campo nuevo y opcional de cada stack, `tools`, que solo aparece cuando hay alguna. Los comandos salen de `commandsFor`, como los demás, y el formato, de `formatCommand`.

## Criterios de aceptación

- AC1: CUANDO un proyecto de Python, Ruby, PHP o Go tiene configurada una herramienta de formato, de lint o de tipos ENTONCES `specty check` la ejecuta en `format`, `lint` o `typecheck`, con el comando de A2 a A5.
- AC2: CUANDO no la tiene configurada ENTONCES esa verificación no aparece, salvo los comandos que ya existían (`go vet`, `ruff`).
- AC3: CUANDO `specty init` detecta esas herramientas ENTONCES `verify.full` y el bloque de AGENTS.md las incluyen.
- AC4: CUANDO se leen las guías ENTONCES `format`, `lint` y `typecheck` dicen qué detectan en cada stack.

## Diseño

- `cli/src/detect/quality.ts`: `qualityTools(dir, stack)`, que detecta las herramientas configuradas, y `qualityCommands(stack)`, que da el formato, el lint y los tipos con sus prioridades.
- `cli/src/detect/stack.ts`: `detectStacks` añade `tools` a cada stack que tenga alguna.
- `cli/src/detect/project.ts`: `commandsFor` toma el lint y los tipos de `qualityCommands` en Python, Ruby, PHP y Go.
- `cli/src/check/commands.ts`: `formatCommand` toma el formato de Python y PHP de `qualityCommands`.

## Archivos

- crear packages/cli/src/detect/quality.ts — las herramientas configuradas y sus comandos
- modificar packages/cli/src/detect/stack.ts — `tools` en cada stack
- modificar packages/cli/src/detect/project.ts — el lint y los tipos detectados
- modificar packages/cli/src/check/commands.ts — el formato detectado
- crear packages/cli/test/detect-quality.test.ts — la detección y los comandos de cada stack
- modificar docs/checks.md — lo que se detecta en cada stack
- modificar docs/checks.en.md — lo que se detecta en cada stack, en inglés
- modificar docs/formats.md — los comandos detectados

## Tareas

- [x] T1: Las herramientas configuradas y sus comandos
  - files: packages/cli/src/detect/quality.ts, packages/cli/src/detect/stack.ts, packages/cli/src/detect/project.ts, packages/cli/src/check/commands.ts, packages/cli/test/detect-quality.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run
- [x] T2: Lo que se detecta, en las guías y en formats
  - files: docs/checks.md, docs/checks.en.md, docs/formats.md
  - ac: AC4
  - verify: pnpm check
  - type: docs

## Riesgos

- R1: Una herramienta configurada pero no instalada hace fallar su verificación en cada ejecución. Es lo mismo que pasa con los scripts de JavaScript sin `node_modules`, y el informe muestra el código de salida del comando; `checks.commands` o `checks.levels` lo ajustan.

## Cierre

### Resumen

`specty check` y `specty init` detectan el formato, el lint y los tipos que un proyecto de Python, Ruby, PHP o Go ya tiene configurados:
- Python: black, flake8, mypy y pyright, además de ruff.
- Ruby: Standard, RuboCop, Sorbet y Steep.
- PHP: los scripts de composer, PHPStan, Psalm, PHP_CodeSniffer, Pint y PHP CS Fixer.
- Go: golangci-lint, en lugar de `go vet`.

Las herramientas se detectan por su archivo de configuración, su sección o su manifiesto, y se guardan en `tools` de cada stack. Las guías y `formats.md` lo documentan.

### Desviaciones

- `specty check` sobre el propio cambio encontró que `commandsFor` crecía por encima de 50 líneas y que la función `php` llegaba a complejidad 11. Los scripts de JavaScript pasaron a `scriptCommands`, y `php` usa un ayudante para las herramientas de reserva.
- `pythonPrefix` se movió de `detect/project.ts` a `detect/quality.ts`, para que este no dependa de aquel.

### Decisiones

- El formato de Go se deja a `golangci-lint run`, que ejecuta los formateadores de su configuración. `gofmt -l` no falla por sí solo y necesitaría una shell POSIX.
- `tools` solo aparece en un stack que tiene alguna herramienta, para no cambiar los stacks de los demás.
- En PHP, los scripts de `composer.json` mandan sobre las herramientas detectadas, como los de `package.json` en JavaScript.

### Pendientes

- S2b: Java, Kotlin, C# y Swift (Spotless, Checkstyle, ktlint, detekt, `dotnet build`, SwiftLint, swift-format).
