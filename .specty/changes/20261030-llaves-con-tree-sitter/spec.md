---
kind: standard
epic: 20261030-tree-sitter-mide-las-funciones
---

# Las funciones de C, C++, Java, C# y PHP se miden con tree-sitter

## Objetivo

`function-lines` y `complexity` miden también con el árbol de tree-sitter las funciones de C, C++, Java, C# y PHP. Así ven las que la estimación no ve, como cualquier función con un parámetro llamado `record`. Es el primer cambio del corte C2 de la épica, que no cabía en uno: el core generaliza la medida de C1 para los lenguajes de llaves, y el siguiente cambio suma Go, Rust, Kotlin, Swift y Dart.

## Fuera de alcance

- Go, Rust, Kotlin, Swift y Dart: van en el siguiente cambio, el corte C2.
- Python, Ruby y Elixir: van en C3.
- Saldar la deuda que la medida nueva destape.

## Supuestos

- A1: Las gramáticas de C, C++, Java, C# y PHP salen de `@repomix/tree-sitter-wasms` 0.1.17, que ya es devDependency. Sus licencias son MIT y van en `grammar-licenses.txt`.
- A2: La gramática sale de la extensión: `.java`, `.cs`, `.php`, `.c` y `.h` (C), y `.cc`, `.cpp`, `.cxx`, `.hpp` y `.hh` (C++). Un `.h` con C++ que no parsea como C se mide con la estimación.
- A3: La medida se define como en C1. Las ramas son `if` (más `elseif` en PHP, que la estimación no veía), los bucles `for`, `foreach`, `while` y `do`, el `case` de un `switch` pero no su `default`, `catch`, el ternario, y los operadores `&&`, `||` y `??` dentro de una expresión lógica, más `and` y `or` en PHP y en C++.
  - impacto: alto
- A4: Las funciones son: en C y C++, las definiciones y, en C++, las lambdas; en Java, los métodos, los constructores y las lambdas; en C#, los métodos, constructores, destructores, operadores, accesores, funciones locales, lambdas y métodos anónimos; en PHP, las funciones, los métodos, las funciones anónimas y `fn`.
  - impacto: alto
- A5: Una función empieza en su primer token que no está dentro de una anotación, un atributo, un decorador o un comentario. Un comentario con hijos no cuenta entero, con todos ellos.
- A6: El nombre sale del campo `name` o, en C y C++, siguiendo el declarador; de un nombre calificado (`A::run`) se toma la última parte. Si la función no tiene nombre, sale de la variable que la recibe. Los accesores de C# no tienen nombre.
- A7: Las funciones sin nombre se emparejan con las de la versión de partida por orden entre las que no tienen nombre, como ya se hace con las de un mismo nombre. Con C1 y con la épica hay muchas más funciones sin nombre (callbacks, accesores), y sin pareja una que ya pasaba del límite fallaría al tocarla, aunque no creciera.
- A8: El core generaliza lo que C1 hizo para TypeScript, que sigue midiendo igual (sus tests no cambian). Salta un comentario con sus hijos, busca el primer token de la cabecera, sigue los campos del nombre, cuenta un `case` por su primer token y cada operador lógico por su token dentro de un nodo lógico: así sirve también para los lenguajes cuyos operadores van en nodos propios, como Dart y Swift, que vienen después.

## Criterios de aceptación

- AC1: CUANDO un cambio agranda por encima de `checks.functions.maxLines` una función con un parámetro llamado `record` en Java, C#, PHP, C o C++ ENTONCES `function-lines` la señala con su nombre y la línea de su cabecera.
- AC2: CUANDO `treeFunctions` mide en C, C++, Java, C# y PHP una función con anotaciones o atributos, comentarios, un `switch` con `case` y `default`, operadores lógicos y una lambda dentro ENTONCES da su nombre (también el de un declarador de C y el de un nombre calificado de C++), su inicio en la primera línea que no es una anotación, su final, sus líneas de código y su complejidad, sin contar el `default`.
- AC3: CUANDO un cambio toca, sin agrandarla, una función sin nombre que ya pasaba del límite ENTONCES `function-lines` no la señala.
- AC4: CUANDO se construye el CLI ENTONCES `grammars/` lleva comprimidas las gramáticas de Java, C#, PHP, C y C++, y `LICENSES` nombra la licencia de cada una.

## Diseño

- Core, `checks/tree-languages.ts`: `TreeGrammar` añade `cases` (el nodo cuenta si su primer token es `case`), `nameFields` y `carriers` (por dónde se baja hasta el nombre) y `receivers` por campo o por tipo de hijo. `logical` pasa a ser el conjunto de nodos padre de un operador, y `prefixes`, el de los nodos que no empiezan la cabecera. `TreeLanguage` suma `java`, `csharp`, `php`, `c` y `cpp`.
- Core, `checks/tree-languages-c.ts`: las tablas de C, C++, Java, C# y PHP, la sintaxis de la familia C.
- Core, `checks/functions-tree.ts`: la cabecera por su primer token fuera de un prefijo, el nombre por `nameFields` y `carriers`, los comentarios fuera con sus hijos, `cases` y los operadores por token.
- CLI, `check/syntax.ts`: las extensiones de A2.
- CLI, `check/functions.ts`: `pairOf` empareja también las funciones sin nombre (A7).
- `build.mjs`: las cinco gramáticas en `grammars/`; `grammar-licenses.txt`, sus licencias.
- Documentos: `formats.md`, `checks.md`, `checks.en.md` y `ARCHITECTURE.md`.

## Archivos

- modificar packages/core/src/checks/functions-tree.ts — la medida general para los lenguajes de llaves
- modificar packages/core/src/checks/tree-languages.ts — los campos nuevos de la tabla y los cinco lenguajes
- crear packages/core/src/checks/tree-languages-c.ts — las tablas de C, C++, Java, C# y PHP
- crear packages/core/test/checks/functions-tree-c.test.ts — AC2
- modificar packages/cli/src/check/syntax.ts — las extensiones de las gramáticas nuevas
- modificar packages/cli/src/check/functions.ts — el emparejamiento de las funciones sin nombre
- crear packages/cli/test/check-functions-c.test.ts — AC1 y AC3
- modificar packages/cli/build.mjs — las cinco gramáticas
- modificar packages/cli/grammar-licenses.txt — sus licencias
- crear packages/cli/test/bundle-grammars-c.test.ts — AC4
- modificar docs/formats.md — la medida de C, C++, Java, C# y PHP
- modificar docs/checks.md — la medida de C, C++, Java, C# y PHP
- modificar docs/checks.en.md — la medida de C, C++, Java, C# y PHP
- modificar docs/ARCHITECTURE.md — la medida de C, C++, Java, C# y PHP

## Tareas

- [x] T1: El core mide C, C++, Java, C# y PHP sobre el árbol
  - files: packages/core/src/checks/functions-tree.ts, packages/core/src/checks/tree-languages.ts, packages/core/src/checks/tree-languages-c.ts, packages/core/test/checks/functions-tree-c.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/checks/functions-tree-c.test.ts test/checks/functions-tree.test.ts test/checks/functions-tree-names.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint
- [x] T2: specty check mide C, C++, Java, C# y PHP con tree-sitter y empareja las funciones sin nombre
  - files: packages/cli/src/check/syntax.ts, packages/cli/src/check/functions.ts, packages/cli/test/check-functions-c.test.ts
  - ac: AC1, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-functions-c.test.ts test/check-functions-tree.test.ts test/check-functions.test.ts && pnpm --filter @baquia-dev/specty typecheck && pnpm lint && pnpm knip
- [x] T3: El bundle lleva las cinco gramáticas y sus licencias
  - files: packages/cli/build.mjs, packages/cli/grammar-licenses.txt, packages/cli/test/bundle-grammars-c.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/bundle-grammars-c.test.ts test/bundle-grammars.test.ts && pnpm lint
- [ ] T4: La documentación de la medida de C, C++, Java, C# y PHP
  - files: docs/formats.md, docs/checks.md, docs/checks.en.md, docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-docs.test.ts
  - type: docs

## Riesgos

- R1: Una gramática da nombres de nodo distintos de los que se probaron, o los cambia en otra versión. Mitigación: versiones exactas y un test por lenguaje en el core (AC2).
- R2: Los tests de ejemplos por stack (`check-examples-*`) fijan resultados de la estimación. Mitigación: se ejecutan en la aceptación; si alguno cambia por la medida nueva, se ajusta con su motivo.
- R3: Emparejar por orden las funciones sin nombre puede emparejar mal si el cambio añade una delante de otra. Mitigación: es el mismo criterio que ya siguen las de un mismo nombre; el cierre lo anota.
