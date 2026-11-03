---
kind: standard
epic: 20261030-tree-sitter-mide-las-funciones
slice: C2
follows:
  - 20261030-modernos-con-tree-sitter
allowedDependencies:
  - "@tree-sitter-grammars/tree-sitter-kotlin"
---

# Las funciones de Kotlin se miden con tree-sitter

## Objetivo

`function-lines` y `complexity` miden también con el árbol de tree-sitter las funciones de Kotlin. Así ven las que la estimación no ve, como los getters de una propiedad o cualquier función con un parámetro llamado `record`. Con los dos cambios previos (C, C++, Java, C# y PHP; Go, Rust, Swift y Dart), cierra el corte C2 de la épica: todos los lenguajes de llaves.

## Fuera de alcance

- Python, Ruby y Elixir: van en C3.
- Contar como ramas los brazos de `when`: la estimación nunca los contó, y la épica mantiene su definición.
- Los bloques `init { }`: la estimación no los medía, y no son una función que se llame.

## Supuestos

- A1: La gramática sale de `@tree-sitter-grammars/tree-sitter-kotlin` 1.1.0 (MIT, de los mantenedores de tree-sitter), con versión exacta, como devDependency del core (para sus tests) y del CLI. `@repomix/tree-sitter-wasms` no trae Kotlin. Su script de instalación (`node-gyp-build`) compila un binding nativo que no hace falta: va en `allowBuilds` con `false`, como esbuild. Su dependencia `tree-sitter` es opcional y no se instala.
  - impacto: alto
- A2: La gramática sale de la extensión: `.kt` y `.kts`. El CLI nombra el archivo en su paquete con un literal en `require.resolve`, para que knip lo vea usado. El build copia la licencia del paquete a `grammars/LICENSES`.
- A3: Las funciones son las declaraciones `fun`, los constructores secundarios, los getters, los setters, las funciones anónimas y las lambdas. Las ramas son `if` (también como expresión), `for`, `while`, `do … while`, `catch` y los operadores `&&` y `||`.
  - impacto: alto
- A4: Una función empieza en su primer token fuera de sus anotaciones (`@JvmStatic`). El nombre sale del campo `name`. Una función anónima, una lambda, un getter o un setter sin nombre lo toman de la propiedad que los recibe.
- A5: Probado el 2026-10-30 con un prototipo sobre la gramática: los números de los tests salen a mano.

## Criterios de aceptación

- AC1: CUANDO un cambio agranda por encima de `checks.functions.maxLines` una función de Kotlin con un parámetro llamado `record` ENTONCES `function-lines` la señala con su nombre y la línea de su cabecera.
- AC2: CUANDO `treeFunctions` mide en Kotlin una función con una anotación, comentarios, ramas y una lambda dentro, y el getter de una propiedad ENTONCES da su nombre, su inicio después de la anotación, su final, sus líneas de código y su complejidad, y el getter toma el nombre de la propiedad.
- AC3: CUANDO se construye el CLI ENTONCES `grammars/` lleva comprimida la gramática de Kotlin, y `LICENSES` lleva su licencia.

## Diseño

- Core, `checks/tree-languages-modern.ts`: la tabla de Kotlin; `checks/tree-languages.ts`: `kotlin` en `TreeLanguage` y en el registro.
- CLI, `check/syntax.ts`: `.kt` y `.kts`, con el archivo de Kotlin en su propio paquete.
- `build.mjs`: la gramática de Kotlin desde su paquete, con su licencia.
- Documentos: `formats.md`, `checks.md`, `checks.en.md`, `ARCHITECTURE.md` y las consecuencias del ADR 0016 (las fuentes y el tamaño con todos los lenguajes de llaves).

## Archivos

- modificar packages/core/src/checks/tree-languages-modern.ts — la tabla de Kotlin
- modificar packages/core/src/checks/tree-languages.ts — `kotlin` en el tipo y en el registro
- modificar packages/core/package.json — la gramática de Kotlin para los tests
- crear packages/core/test/checks/functions-tree-kotlin.test.ts — AC2
- modificar pnpm-workspace.yaml — Kotlin en `allowBuilds` con `false`
- modificar packages/cli/src/check/syntax.ts — `.kt` y `.kts`, y el archivo de Kotlin
- modificar packages/cli/package.json — la gramática de Kotlin
- crear packages/cli/test/check-functions-kotlin.test.ts — AC1
- modificar packages/cli/build.mjs — la gramática de Kotlin y su licencia
- crear packages/cli/test/bundle-grammars-kotlin.test.ts — AC3
- modificar pnpm-lock.yaml — la dependencia nueva
- modificar docs/formats.md — la medida de Kotlin
- modificar docs/checks.md — la medida de Kotlin
- modificar docs/checks.en.md — la medida de Kotlin
- modificar docs/ARCHITECTURE.md — la medida de Kotlin
- modificar docs/decisions/0016-tree-sitter-para-medir-las-funciones.md — las fuentes de las gramáticas y el tamaño

## Tareas

- [x] T1: El core mide Kotlin sobre el árbol
  - files: packages/core/src/checks/tree-languages-modern.ts, packages/core/src/checks/tree-languages.ts, packages/core/package.json, packages/core/test/checks/functions-tree-kotlin.test.ts, pnpm-workspace.yaml, pnpm-lock.yaml
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/checks/functions-tree-kotlin.test.ts test/checks/functions-tree-modern.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint
- [x] T2: specty check mide Kotlin con tree-sitter
  - files: packages/cli/src/check/syntax.ts, packages/cli/package.json, packages/cli/test/check-functions-kotlin.test.ts, pnpm-lock.yaml
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-functions-kotlin.test.ts test/check-functions-modern.test.ts && pnpm --filter @baquia-dev/specty typecheck && pnpm lint && pnpm knip
- [x] T3: El bundle lleva la gramática de Kotlin y su licencia
  - files: packages/cli/build.mjs, packages/cli/test/bundle-grammars-kotlin.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/bundle-grammars-kotlin.test.ts test/bundle-grammars.test.ts && pnpm lint
- [x] T4: La documentación de la medida de Kotlin
  - files: docs/formats.md, docs/checks.md, docs/checks.en.md, docs/ARCHITECTURE.md, docs/decisions/0016-tree-sitter-para-medir-las-funciones.md
  - ac: —
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-docs.test.ts
  - type: docs

## Riesgos

- R1: pnpm se niega a instalar un paquete con un script que no está en `allowBuilds`. Mitigación: se declara con `false`, como los demás que traen binarios que Specty no usa.
- R2: Los tests de ejemplos de Kotlin (`check-examples-jvm`) fijan resultados de la estimación. Mitigación: se ejecutan en la aceptación; si alguno cambia por la medida nueva, se ajusta con su motivo.

## Cierre

### Resumen

`function-lines` y `complexity` miden sobre el árbol de tree-sitter también Kotlin (`.kt` y `.kts`), y con ello cierra el corte C2: todos los lenguajes de llaves se miden con el árbol.
- La gramática sale de `@tree-sitter-grammars/tree-sitter-kotlin` 1.1.0, con su binding nativo apagado en `allowBuilds`.
- El build la comprime desde su paquete y copia su licencia a `grammars/LICENSES`.
- Un getter, una lambda o una función anónima toman el nombre de la propiedad que los recibe.
- `dist/grammars/` ocupa 1,5 MB con las catorce gramáticas y el runtime.

### Desviaciones

- El corte C2 se repartió en tres cambios porque no cabía en uno: C, C++, Java, C# y PHP (8f6f314); Go, Rust, Swift y Dart (e0a25fe); y este, Kotlin, con la dependencia nueva.

### Decisiones

- `grammarFile` resuelve Kotlin desde su paquete con un literal, para que knip vea la dependencia usada; las demás gramáticas siguen saliendo de `@repomix/tree-sitter-wasms`.

### Pendientes

- C3: Python y Ruby (sin dependencias nuevas), y después Elixir, que hoy no se mide (`tree-sitter-elixir`, Apache-2.0, con un `tree-sitter` nativo como peer obligatorio que pnpm instalará y habrá que apagar en `allowBuilds`).
- Reconstruir el dist de main tras incorporar.
