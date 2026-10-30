---
kind: standard
epic: 20261030-tree-sitter-mide-las-funciones
follows:
  - 20261030-llaves-con-tree-sitter
---

# Las funciones de Go, Rust, Swift y Dart se miden con tree-sitter

## Objetivo

`function-lines` y `complexity` miden también con el árbol de tree-sitter las funciones de Go, Rust, Swift y Dart. Así ven las que la estimación no ve, como los getters de Dart o cualquier función con un parámetro llamado `record`. Es el segundo cambio previo del corte C2 de la épica, que no cabía en uno: el corte, con Kotlin y su dependencia nueva, va después.

## Fuera de alcance

- Kotlin: va en el corte C2, con su paquete de gramática.
- Python, Ruby y Elixir: van en C3.
- Contar como ramas los brazos de `match` de Rust: la estimación nunca los contó, y la épica mantiene su definición.
- Dar nombre a un literal `func` de Go: su padre es la lista de la derecha de `:=`, no la declaración, y la estimación tampoco lo nombraba.
- Saldar la deuda que la medida nueva destape.

## Supuestos

- A1: Las gramáticas de Go, Rust, Swift y Dart salen de `@repomix/tree-sitter-wasms` 0.1.17, que ya es devDependency, y sus licencias MIT van en `grammar-licenses.txt`.
- A2: La gramática sale de la extensión: `.go`, `.rs`, `.swift` y `.dart`.
- A3: Las funciones son: en Go, las funciones, los métodos y los literales `func`; en Rust, `fn` y las closures; en Swift, las funciones, `init`, `deinit`, `subscript`, los getters y setters calculados y las closures; en Dart, los métodos, las funciones, los getters, los setters, los constructores, las funciones locales y las closures.
  - impacto: alto
- A4: Las ramas siguen la definición de la épica: `if` (y `guard` en Swift), los bucles, el `case` de un `switch` sin su `default`, `catch`, el ternario y los operadores `&&`, `||` y `??`. En Dart y en Swift los operadores van en nodos propios (`logical_and_operator`, `conjunction_expression`, `if_null_expression`…), que la tabla nombra como padres lógicos.
- A5: En Dart, una función de clase o de nivel superior son dos nodos hermanos: la firma (`method_signature`, `function_signature`, `getter_signature`…) y su `function_body`. Va del primer token de la firma al final del cuerpo, y su nombre sale de la firma. Las funciones locales y las closures sí son un solo nodo. El core lo lee con dos campos nuevos de la tabla, `bodies` y `signatures`, y `SyntaxNode` añade `previousNamedSibling`, que el nodo de web-tree-sitter ya tiene.
  - impacto: alto
- A6: El nombre sale del campo `name`; en Swift, el de una propiedad, por su `bound_identifier`. Si la función no tiene nombre, sale de quien la recibe: la variable de `let` en Rust, la de `let` o `var` en Swift y la variable en Dart. Los `init` y los getters de Swift no tienen nombre.
- A7: Probado el 2026-10-30 con un prototipo sobre las cuatro gramáticas: los números de los tests salen a mano. Los comentarios de documentación de Rust (`///`, `//!`) y los atributos (`#[inline]`, `@discardableResult`) no cuentan como líneas de la función.

## Criterios de aceptación

- AC1: CUANDO un cambio agranda por encima de `checks.functions.maxLines` un getter de Dart (`get total {` o `get items => [` de varias líneas) ENTONCES `function-lines` lo señala con su nombre.
- AC2: CUANDO un cambio agranda por encima del límite una función con un parámetro llamado `record` en Go, Rust, Swift o Dart ENTONCES `function-lines` la señala con su nombre y la línea de su cabecera.
- AC3: CUANDO `treeFunctions` mide en Go, Rust, Swift y Dart una función con atributos o anotaciones, comentarios (también de documentación en Rust), ramas propias del lenguaje y una closure dentro ENTONCES da su nombre, su inicio, su final, sus líneas de código y su complejidad; en Dart, de la firma al final del cuerpo.
- AC4: CUANDO se construye el CLI ENTONCES `grammars/` lleva comprimidas las gramáticas de Go, Rust, Swift y Dart, y `LICENSES` nombra la licencia de cada una.

## Diseño

- Core, `checks/tree-languages.ts`: `TreeGrammar` añade `bodies` y `signatures` (vacíos salvo en Dart). `TreeLanguage` suma `go`, `rust`, `swift` y `dart`.
- Core, `checks/tree-languages-modern.ts`: las tablas de Go, Rust, Swift y Dart; el corte C2 suma la de Kotlin.
- Core, `checks/functions-tree.ts`: un nodo de `bodies` cuyo hermano anterior con nombre (sin comentarios) es una de `signatures` es una función, salvo si su padre ya lo es.
- CLI, `check/syntax.ts`: las extensiones de A2.
- `build.mjs`: las cuatro gramáticas en `grammars/`; `grammar-licenses.txt`, sus licencias.
- Documentos: `formats.md`, `checks.md`, `checks.en.md` y `ARCHITECTURE.md`.

## Archivos

- modificar packages/core/src/checks/functions-tree.ts — las funciones de Dart en dos nodos
- modificar packages/core/src/checks/tree-languages.ts — los campos de Dart y los cuatro lenguajes
- crear packages/core/src/checks/tree-languages-modern.ts — las tablas de Go, Rust, Swift y Dart
- crear packages/core/test/checks/functions-tree-modern.test.ts — AC3
- modificar packages/cli/src/check/syntax.ts — las extensiones de las gramáticas nuevas
- crear packages/cli/test/check-functions-modern.test.ts — AC1 y AC2
- modificar packages/cli/build.mjs — las cuatro gramáticas
- modificar packages/cli/grammar-licenses.txt — las licencias de Go, Rust, Swift y Dart
- crear packages/cli/test/bundle-grammars-modern.test.ts — AC4
- modificar docs/formats.md — la medida de Go, Rust, Swift y Dart
- modificar docs/checks.md — la medida de Go, Rust, Swift y Dart
- modificar docs/checks.en.md — la medida de Go, Rust, Swift y Dart
- modificar docs/ARCHITECTURE.md — la medida de Go, Rust, Swift y Dart

## Tareas

- [x] T1: El core mide Go, Rust, Swift y Dart sobre el árbol
  - files: packages/core/src/checks/functions-tree.ts, packages/core/src/checks/tree-languages.ts, packages/core/src/checks/tree-languages-modern.ts, packages/core/test/checks/functions-tree-modern.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/checks/functions-tree-modern.test.ts test/checks/functions-tree-c.test.ts test/checks/functions-tree.test.ts test/checks/functions-tree-names.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint
- [x] T2: specty check mide Go, Rust, Swift y Dart con tree-sitter
  - files: packages/cli/src/check/syntax.ts, packages/cli/test/check-functions-modern.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-functions-modern.test.ts test/check-functions-c.test.ts test/check-functions-tree.test.ts test/check-functions.test.ts && pnpm --filter @baquia-dev/specty typecheck && pnpm lint && pnpm knip
- [x] T3: El bundle lleva las cuatro gramáticas y sus licencias
  - files: packages/cli/build.mjs, packages/cli/grammar-licenses.txt, packages/cli/test/bundle-grammars-modern.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/bundle-grammars-modern.test.ts test/bundle-grammars-c.test.ts test/bundle-grammars.test.ts && pnpm lint
- [x] T4: La documentación de la medida de Go, Rust, Swift y Dart
  - files: docs/formats.md, docs/checks.md, docs/checks.en.md, docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-docs.test.ts
  - type: docs

## Riesgos

- R1: La gramática de Dart (`UserNobody14/tree-sitter-dart`, sin versión en npm) cambia los nombres de sus nodos. Mitigación: `@repomix/tree-sitter-wasms` va con versión exacta y AC3 la prueba.
- R2: Los tests de ejemplos por stack (`check-examples-flutter` y los nativos) fijan resultados de la estimación. Mitigación: se ejecutan en la aceptación; si alguno cambia por la medida nueva, se ajusta con su motivo.

## Cierre

### Resumen

`function-lines` y `complexity` miden sobre el árbol de tree-sitter también Go, Rust, Swift y Dart.
- Las tablas viven en `tree-languages-modern.ts`.
- En Dart, una función de clase o de nivel superior es la firma más su `function_body` hermano: la tabla lo dice con `bodies` y `signatures`, y `SyntaxNode` añade `previousNamedSibling`.
- Los getters de Dart (`get x {` y `get x => [`) y las funciones con un parámetro `record` ya se ven.
- `dist/grammars/` ocupa 1,3 MB con las doce gramáticas.

### Desviaciones

- El corte C2 tampoco cabía en dos cambios con Kotlin (XL otra vez): este es su segundo cambio previo, sin `slice`, y el corte C2 queda solo para Kotlin, con su dependencia nueva.
- `bodies` y `signatures` son opcionales en `TreeGrammar`, para no tocar las tablas de la familia C, que no los usan.

### Decisiones

- Rust no cuenta los brazos de `match` ni Go nombra un literal `func`: la estimación tampoco lo hacía.
- Los atributos y los comentarios de documentación de Rust van fuera de `function_item`, así que la función empieza en `fn` sin más.

### Pendientes

- El corte C2: Kotlin (`@tree-sitter-grammars/tree-sitter-kotlin` 1.1.0, con `allowBuilds: false` para su `node-gyp-build`).
- C3: Python, Ruby y Elixir.
- Reconstruir el dist de main tras incorporar.
