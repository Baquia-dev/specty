---
kind: standard
follows:
  - 20261024-dependencias-permitidas-en-la-spec
---

# Los comandos del proyecto en specty check

## Objetivo

`specty check` ejecuta el formato, el lint, el typecheck y los tests del proyecto con sus propios comandos (los scripts que Specty ya detecta en cualquier stack, o los de `checks.commands`) y convierte lo que imprimen en hallazgos `ruta:línea mensaje`, recortados a `checks.maxFindings`. Así el agente ve en pocas líneas qué falla, sea cual sea la herramienta.

## Fuera de alcance

- Las reglas de lint que Specty añade por su cuenta (sin `any`, sin `@ts-ignore`, tamaño de funciones, complejidad, tests enfocados por lint), las capas con dependency-cruiser y la regeneración de código: son los cortes siguientes del proveedor de TypeScript.
- Ejecutar los comandos solo sobre los archivos del diff: cada herramienta mira el proyecto entero, porque un cambio puede romper archivos que no tocó.
- Un comando de formato que reescribe archivos: solo se usan los que comprueban (`format:check`, `--set-exit-if-changed`, `--check`).

## Supuestos

- A1: Los comandos salen de `commandsFor` del stack principal, el mismo que usa `init` para `verify` y AGENTS.md, y `checks.commands` los sustituye uno a uno; una verificación sin comando no aparece en la ejecución.
  - impacto: alto
- A2: El comando de formato solo se detecta en su forma de comprobación: los scripts `format:check`, `fmt:check` o `check:format` en JavaScript y TypeScript, `dart format --output=none --set-exit-if-changed .` en Dart, `cargo fmt --check` en Rust, `ruff format --check` en Python con ruff y `dotnet format --verify-no-changes` en .NET.
- A3: Casi todas las herramientas señalan sus fallos con `ruta:línea` o `ruta(línea,columna)` en algún punto de la línea (tsc, Biome, Go, Rust, pytest, Vitest, el analizador de Dart), y ESLint en su formato por defecto pone la ruta en una línea propia y `línea:columna` en las siguientes; con eso basta un analizador genérico, sin uno por herramienta.
  - impacto: alto
- A4: Una verificación de comando pasa si el comando sale con 0. Si no, el primer hallazgo dice con qué código salió, o que superó `verify.timeoutSec`; los demás son las líneas con ubicación, primero las de archivos de la ejecución, o las últimas líneas de la salida si ninguna la tiene.

## Criterios de aceptación

- AC1: CUANDO el proyecto tiene scripts `lint`, `typecheck` y `test` ENTONCES `specty check` ejecuta `lint`, `typecheck` y `tests` con ellos y, si pasan, cuentan como OK; un comando que falla da `FALLA <id>` con `` `<comando>` salió con <código> `` y sus líneas con `ruta:línea mensaje`.
- AC2: CUANDO `checks.commands` define un comando para `format`, `lint`, `typecheck` o `tests` ENTONCES usa ese y no el detectado; sin comando ni detectado ni configurado, la verificación no aparece.
- AC3: CUANDO un comando supera `verify.timeoutSec` ENTONCES su verificación falla con un mensaje que lo dice.
- AC4: CUANDO la salida trae ubicaciones en las formas de tsc, ESLint, Biome, Go, Rust, pytest o el analizador de Dart ENTONCES cada una da un hallazgo con su ruta relativa al repositorio, su línea y un mensaje de una línea, sin códigos de color; sin ninguna, el hallazgo son las últimas líneas de la salida.
- AC5: CUANDO hay más hallazgos que `checks.maxFindings` ENTONCES la salida muestra los primeros, con los de archivos de la ejecución delante, y `… y N más`.
- AC6: CUANDO el idioma es inglés ENTONCES los mensajes propios de Specty están en inglés.

## Diseño

- `core/src/checks/output.ts`, puro: `findingsInOutput(salida, raíz)` quita los códigos ANSI, reconoce las ubicaciones y devuelve hallazgos sin repetir, como mucho 100.
- `core/src/schema/checks.ts`: `checks.commands` con `format`, `lint`, `typecheck` y `tests`, cada uno opcional.
- `cli/src/check/commands.ts`: `projectProvider(stacks, config)` arma una verificación por comando conocido; cada una lo ejecuta con la shell en la raíz, con el entorno de la sesión y el tiempo límite de `verify`, y ordena sus hallazgos.
- `commands/check.ts` añade el proveedor del proyecto, delante del común.

## Archivos

- crear packages/core/src/checks/output.ts — los hallazgos de la salida de una herramienta
- modificar packages/core/src/index.ts — exportar `findingsInOutput` y la configuración de `commands`
- crear packages/core/test/checks/output.test.ts — las formas de cada herramienta
- modificar packages/core/src/schema/checks.ts — `checks.commands`
- crear packages/cli/src/check/commands.ts — el proveedor de los comandos del proyecto
- modificar packages/cli/src/commands/check.ts — añadir el proveedor del proyecto
- crear packages/cli/test/check-commands.test.ts — los comandos de punta a punta
- modificar docs/formats.md — `checks.commands` y las verificaciones de comandos
- modificar docs/ARCHITECTURE.md — lo que trae hoy `specty check`

## Tareas

- [x] T1: Los hallazgos de la salida de una herramienta
  - files: packages/core/src/checks/output.ts, packages/core/src/index.ts, packages/core/test/checks/output.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/checks/output.test.ts
- [x] T2: Las verificaciones de los comandos del proyecto
  - files: packages/core/src/schema/checks.ts, packages/core/src/index.ts, packages/cli/src/check/commands.ts, packages/cli/src/commands/check.ts, packages/cli/test/check-commands.test.ts
  - ac: AC1, AC2, AC3, AC5, AC6
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-commands.test.ts test/check.test.ts
- [ ] T3: La documentación
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC2
  - verify: pnpm check

## Riesgos

- R1: Los tests del proyecto tardan y `specty check` los repite cada vez — `checks.levels.tests: off` los apaga, y el corte 8 decidirá cómo convive con la verificación de `task done`.
- R2: El analizador toma por ubicación algo que no lo es (una URL con puerto) — solo cuenta una ruta con extensión seguida de un número de línea, y una URL no tiene esa forma.
