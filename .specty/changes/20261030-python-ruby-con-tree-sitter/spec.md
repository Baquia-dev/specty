---
kind: standard
epic: 20261030-tree-sitter-mide-las-funciones
follows:
  - 20261030-kotlin-con-tree-sitter
---

# Las funciones de Python y Ruby se miden con tree-sitter

## Objetivo

`function-lines` y `complexity` miden también con el árbol de tree-sitter las funciones de Python y de Ruby, que hoy tienen cada uno su estimación. Así no se equivocan donde la estimación se equivoca: en Ruby, una llamada `range.end` cierra la función antes de tiempo; en Python, una variable llamada `case` o `match` (palabras clave blandas) cuenta como rama. Es el cambio previo del corte C3 de la épica: el corte, con Elixir y su dependencia nueva, va después.

## Fuera de alcance

- Elixir: va en el corte C3.
- Cambiar qué es una función en Ruby: los bloques (`do … end`, `{ }`) y las lambdas siguen dentro del método, como en la estimación. En Python, las `lambda` también.
- Las estimaciones de Python y Ruby siguen, como respaldo.

## Supuestos

- A1: Las gramáticas de Python y Ruby salen de `@repomix/tree-sitter-wasms` 0.1.17, que ya es devDependency, y sus licencias MIT van en `grammar-licenses.txt`. La gramática sale de la extensión: `.py` y `.pyi`, y `.rb` y `.rake`.
- A2: La medida sigue la de cada estimación, para que los límites signifiquen lo mismo. En Python, una función es un `def` (también anidado, y sin sus decoradores); las ramas son `if`, `elif`, `for`, `while`, `except` y `case`, también los `for` y los `if` de una comprensión y el `if` de una expresión condicional, y los operadores `and` y `or`. En Ruby, una función es un `def` o un `def self.`, también el de una línea (`def x = expr`); las ramas son `if`, `elsif`, `unless`, `while`, `until`, `for`, `when` y `rescue`, también como modificadores, el ternario, y `&&`, `||`, `and` y `or`.
  - impacto: alto
- A3: Un docstring de Python, una sentencia que solo es una cadena, no es código. De una cadena de varias líneas solo cuenta la fila donde empieza, como en la estimación. El core lo lee con dos campos nuevos de la tabla: `docstrings` (la sentencia cuyo único hijo es una cadena) y `strings` (los nodos que cuentan solo su primera fila).
  - impacto: alto
- A4: Probado el 2026-10-30 con un prototipo: en una función de Python y otra de Ruby con todas esas formas, el árbol da los mismos números que la estimación.

## Criterios de aceptación

- AC1: CUANDO `treeFunctions` mide una función de Python con decorador, docstring, comentario, cadena de varias líneas, función anidada, comprensión, expresión condicional, `elif`, `except`, `while`, `and` y `or` ENTONCES da el mismo inicio, el mismo final, las mismas líneas de código y la misma complejidad que la estimación.
- AC2: CUANDO `treeFunctions` mide una función de Ruby con un bloque, modificadores, `&&`, `||`, `when`, un ternario y `rescue`, y un `def` de una línea ENTONCES da los mismos números que la estimación.
- AC3: CUANDO un cambio agranda por encima de `checks.functions.maxLines` un método de Ruby que llama a `range.end` ENTONCES `function-lines` lo señala con todas sus líneas de código.
- AC4: CUANDO una función de Python usa `case` como nombre de una variable ENTONCES `complexity` no la cuenta como rama.
- AC5: CUANDO se construye el CLI ENTONCES `grammars/` lleva comprimidas las gramáticas de Python y Ruby, y `LICENSES` nombra la licencia de cada una.

## Diseño

- Core, `checks/tree-languages.ts`: `TreeGrammar` añade `docstrings` y `strings`, opcionales. `TreeLanguage` suma `python` y `ruby`.
- Core, `checks/tree-languages-scripting.ts`: las tablas de Python y Ruby; el corte C3 suma la de Elixir.
- Core, `checks/functions-tree.ts`: salta un docstring como un comentario, y de un nodo de `strings` cuenta solo su primera fila.
- CLI, `check/syntax.ts`: las extensiones de A1.
- `build.mjs`: las dos gramáticas en `grammars/`; `grammar-licenses.txt`, sus licencias.
- Documentos: `formats.md`, `checks.md`, `checks.en.md` y `ARCHITECTURE.md`.

## Archivos

- modificar packages/core/src/checks/functions-tree.ts — los docstrings y las cadenas de varias líneas
- modificar packages/core/src/checks/tree-languages.ts — los campos nuevos y los dos lenguajes
- crear packages/core/src/checks/tree-languages-scripting.ts — las tablas de Python y Ruby
- crear packages/core/test/checks/functions-tree-scripting.test.ts — AC1 y AC2
- modificar packages/cli/src/check/syntax.ts — las extensiones de Python y Ruby
- crear packages/cli/test/check-functions-scripting.test.ts — AC3 y AC4
- modificar packages/cli/build.mjs — las dos gramáticas
- modificar packages/cli/grammar-licenses.txt — sus licencias
- crear packages/cli/test/bundle-grammars-scripting.test.ts — AC5
- modificar docs/formats.md — la medida de Python y Ruby
- modificar docs/checks.md — la medida de Python y Ruby
- modificar docs/checks.en.md — la medida de Python y Ruby
- modificar docs/ARCHITECTURE.md — la medida de Python y Ruby

## Tareas

- [x] T1: El core mide Python y Ruby sobre el árbol
  - files: packages/core/src/checks/functions-tree.ts, packages/core/src/checks/tree-languages.ts, packages/core/src/checks/tree-languages-scripting.ts, packages/core/test/checks/functions-tree-scripting.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/checks/functions-tree-scripting.test.ts test/checks/functions-tree-modern.test.ts test/checks/functions-tree-c.test.ts test/checks/functions-tree.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint
- [x] T2: specty check mide Python y Ruby con tree-sitter
  - files: packages/cli/src/check/syntax.ts, packages/cli/test/check-functions-scripting.test.ts
  - ac: AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-functions-scripting.test.ts test/check-functions.test.ts && pnpm --filter @baquia-dev/specty typecheck && pnpm lint && pnpm knip
- [x] T3: El bundle lleva las gramáticas de Python y Ruby y sus licencias
  - files: packages/cli/build.mjs, packages/cli/grammar-licenses.txt, packages/cli/test/bundle-grammars-scripting.test.ts
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/bundle-grammars-scripting.test.ts test/bundle-grammars.test.ts && pnpm lint
- [ ] T4: La documentación de la medida de Python y Ruby
  - files: docs/formats.md, docs/checks.md, docs/checks.en.md, docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-docs.test.ts
  - type: docs

## Riesgos

- R1: El test de `check-functions.test.ts` que mide Python por su indentación y Ruby por `def … end` (S4 AC1) pasa ahora por el árbol. Mitigación: sus funciones se leen igual con los dos métodos (A4); si cambia algún número, se ajusta con su motivo.
- R2: Una cadena de varias líneas con código de verdad en las filas siguientes (una f-string con expresiones) pierde esas filas y sus ramas. Mitigación: es lo mismo que hacía la estimación, que vaciaba las cadenas.
