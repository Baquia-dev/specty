---
kind: standard
follows:
  - 20261026-las-dependencias-permitidas-en-cada-ecosistema
---

# Las funciones de Python y Ruby

## Objetivo

`function-lines` y `complexity` miden también las funciones de Python, por su indentación, y las de Ruby, por `def … end`, con el mismo criterio que en los lenguajes de llaves. Python, el lenguaje más usado, deja de quedar fuera de los límites de cada función. Es el cuarto corte del plan para los stacks más populares.

## Fuera de alcance

- Elixir: no está entre los nueve stacks del plan, y sus bloques `do … end` y `fn … end` necesitan un estimador propio.
- Las lambdas de Python y los bloques de Ruby (`do … end`, `{ … }`, `->`): no son funciones con nombre que mida la verificación.

## Supuestos

- A1: En Python, una función empieza en `def` o `async def` y su cuerpo son las líneas de código más indentadas que su cabecera, que puede ocupar varias líneas. Cuentan las líneas de código, sin blancos, comentarios ni las líneas de un docstring. La complejidad es 1 más cada `if`, `elif`, `for`, `while`, `except`, `case`, `and` y `or` de su código, sin cadenas, comentarios ni los de las funciones anidadas.
  - impacto: alto
- A2: En Ruby, una función empieza en `def` y acaba en el `end` que la cierra. Abren un bloque `def`, `class`, `module`, `begin`, `do` y un `if`, `unless`, `while`, `until`, `case` o `for` al principio de la sentencia o tras un `=`, nunca como modificador. Un `def x = expr` ocupa una línea. La complejidad es 1 más cada `if`, `elsif`, `unless`, `while`, `until`, `for`, `when`, `rescue`, `&&`, `||`, `and`, `or` y ternario, también los modificadores.
  - impacto: alto
- A3: La verificación aparece con cualquier stack salvo Elixir, y una función se empareja con la de antes por su nombre y su orden, como en los demás lenguajes.

## Criterios de aceptación

- AC1: CUANDO el cambio crea o agranda una función de Python o de Ruby por encima de `checks.functions` ENTONCES `function-lines` o `complexity` fallan con su línea.
- AC2: CUANDO la función está dentro de los límites, o solo crecen sus docstrings, sus comentarios o una función anidada ENTONCES no falla.
- AC3: CUANDO el repositorio es de Elixir ENTONCES las dos verificaciones no aparecen.
- AC4: CUANDO se leen las guías ENTONCES dicen cómo se miden las funciones de Python y Ruby.

## Archivos

- modificar packages/core/src/checks/functions.ts — elegir el estimador por la extensión
- crear packages/core/src/checks/functions-python.ts — el estimador de Python
- crear packages/core/src/checks/functions-ruby.ts — el estimador de Ruby
- crear packages/core/test/checks/functions-scripts.test.ts — sus casos
- modificar packages/cli/src/check/functions.ts — el proveedor solo deja fuera Elixir
- modificar docs/checks.md — cómo se miden en Python y Ruby
- modificar docs/checks.en.md — lo mismo, en inglés
- modificar docs/formats.md — cómo se miden

## Tareas

- [x] T1: El estimador de Python
  - files: packages/core/src/checks/functions-python.ts, packages/core/src/checks/functions.ts, packages/core/test/checks/functions-scripts.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/checks/functions-scripts.test.ts test/checks/functions.test.ts
- [ ] T2: El estimador de Ruby
  - files: packages/core/src/checks/functions-ruby.ts, packages/core/src/checks/functions.ts, packages/core/test/checks/functions-scripts.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/checks/functions-scripts.test.ts test/checks/functions.test.ts
- [ ] T3: Las verificaciones en los repositorios de Python y Ruby
  - files: packages/cli/src/check/functions.ts, docs/checks.md, docs/checks.en.md, docs/formats.md
  - ac: AC1, AC3, AC4
  - verify: pnpm check
