---
kind: standard
epic: 20261030-tree-sitter-mide-las-funciones
slice: C1
allowedDependencies:
  - web-tree-sitter
  - "@repomix/tree-sitter-wasms"
---

# Las funciones de TypeScript y JavaScript se miden con tree-sitter

## Objetivo

`function-lines` y `complexity` miden las funciones de TypeScript y JavaScript con el árbol de sintaxis de tree-sitter, no con la estimación línea a línea. Así ven funciones que hoy se les escapan sin avisar, como `deriveView` en Specty, que tiene un parámetro llamado `record`. Este corte trae además lo común a la épica: el runtime y las gramáticas comprimidas en el paquete del CLI, la medida sobre el árbol en el core y el respaldo de la estimación.

## Fuera de alcance

- Los demás lenguajes: Dart, Go, Rust, Java, Kotlin, C#, PHP, Swift, C y C++ van en C2; Python, Ruby y Elixir, en C3. Siguen con la estimación.
- Saldar la deuda que la medida nueva destape en Specty: el cierre la lista como pendiente.
- Emparejar por orden las funciones sin nombre, como los callbacks. Siguen como hoy: sin pareja, cuentan como nuevas.

## Supuestos

- A1: web-tree-sitter 0.27.1 y `@repomix/tree-sitter-wasms` 0.1.17, con versión exacta, son devDependencies del CLI (van en `dist`) y del core (solo para sus tests). TypeScript usa la gramática `typescript`, TSX la `tsx`, y JavaScript, con JSX, la `javascript`.
  - impacto: alto
- A2: El build escribe en `dist/grammars/` el runtime y las tres gramáticas comprimidas con brotli (`<nombre>.wasm.br`). El CLI los busca primero ahí, junto al bundle, y si no están, en `node_modules`. Así funciona también en los tests, que corren desde las fuentes. Las licencias MIT de web-tree-sitter, tree-sitter-typescript y tree-sitter-javascript van en `dist/grammars/LICENSES`. Las del runtime se copian de su paquete. Las de las gramáticas vienen de un archivo del repositorio, porque `@repomix/tree-sitter-wasms` solo trae su Unlicense.
  - impacto: alto
- A3: Probado el 2026-10-30: esbuild empaqueta web-tree-sitter, que arranca con `Parser.init({ wasmBinary })` y carga la gramática con `Language.load(bytes)`. Iniciar, cargar TypeScript y parsear tardó 11 ms. El build silencia el aviso `direct-eval` de esbuild, que viene del código de Emscripten.
- A4: El core recibe el árbol por una interfaz propia (`SyntaxNode`: `type`, `startPosition.row`, `endPosition.row`, `children`, `text`, `childForFieldName`), que el nodo de web-tree-sitter cumple sin casts. `treeFunctions(language, root)` devuelve el `FunctionMetric[]` de hoy.
  - impacto: alto
- A5: Una función de TypeScript o JavaScript es un nodo `function_declaration`, `generator_function_declaration`, `function_expression`, `function`, `generator_function`, `arrow_function` o `method_definition`. Va de la fila de su primer hijo que no es un decorador ni un comentario hasta su última fila. Sus líneas de código son las filas con algún token que no es un comentario y que no están en blanco, como las cuenta la estimación. Las ramas son `if_statement`, `for_statement`, `for_in_statement`, `while_statement`, `do_statement`, `switch_case`, `catch_clause` y `ternary_expression`, más las expresiones binarias y las asignaciones con `&&`, `||` o `??`. No cuentan las de las funciones anidadas, y tampoco los tipos condicionales.
- A6: El nombre sale del campo `name` de la función. Si no lo tiene, sale de quien la recibe: el `name` de un `variable_declarator`, el `left` de una asignación (su `property` si es un acceso a miembro), la `key` de un `pair` o el `name` de un `public_field_definition`. Si no hay nada de eso, la función no tiene nombre, como un callback.
- A7: `function-lines` y `complexity` miden un archivo con tree-sitter cuando su versión de partida (si existe) y la actual se parsean sin errores (`hasError` falso). Si una tiene errores, o el runtime o la gramática no cargan, miden las dos con la estimación.
- A8: El CLI carga el módulo de sintaxis con `import()` desde `check/functions.ts`, así que web-tree-sitter va en su propio chunk. Inicia el runtime una vez por proceso y cada gramática la primera vez que la necesita. Parsea, mide y libera el árbol (`delete`) sin un `await` entre medias, así que las mediciones en paralelo comparten el parser sin pisarse.

## Criterios de aceptación

- AC1: CUANDO un cambio agranda por encima de `checks.functions.maxLines` una función de TypeScript con un parámetro llamado `record` ENTONCES `function-lines` la señala con su nombre y la línea de su cabecera.
- AC2: CUANDO un cambio añade una arrow function cuyo cuerpo es una expresión de varias líneas y pasa de `checks.functions.complexity` ENTONCES `complexity` la señala.
- AC3: CUANDO una función tiene un tipo de parámetro de varias líneas entre llaves ENTONCES `treeFunctions` da una sola función, que empieza en la primera línea de su cabecera.
- AC4: CUANDO el CLI empaquetado no encuentra la gramática de un archivo ENTONCES `function-lines` lo mide con la estimación, sin fallar.
- AC5: CUANDO la versión de partida de un archivo tiene errores de sintaxis y el cambio toca, sin agrandarla, una función que ya pasaba del límite ENTONCES `function-lines` no la señala.
- AC6: CUANDO se construye el CLI en una carpeta sin `node_modules` ENTONCES lleva en `grammars/` el runtime, las tres gramáticas comprimidas y sus licencias, y su `specty check` señala con ellas la función de AC1.
- AC7: CUANDO `treeFunctions` mide una función que la estimación lee bien, con ramas, comentarios, blancos, un decorador y un callback dentro ENTONCES da el mismo inicio, el mismo final, las mismas líneas de código y la misma complejidad.

## Diseño

- Core, `checks/functions-tree.ts`: la interfaz `SyntaxNode`, el tipo `TreeLanguage` (`"typescript" | "javascript"`; TSX usa el de TypeScript) y `treeFunctions`. Recorre el árbol una vez:
  - reúne las filas con código;
  - apila las funciones abiertas;
  - suma cada rama a la función más interna.
- Core, `checks/tree-languages.ts`: la tabla de cada lenguaje, con sus nodos de función, de rama y de comentario, los operadores lógicos y los nodos de los que sale el nombre. C2 y C3 añaden filas aquí.
- CLI, `check/syntax.ts`: elige la gramática por la extensión (`.ts`, `.mts`, `.cts`, `.tsx`, `.js`, `.mjs`, `.cjs`, `.jsx`). Busca los bytes como dice A2 y carga con A8. `treeMetrics(path, text)` devuelve las funciones, o `undefined` si no hay gramática, no carga o el árbol tiene errores.
- CLI, `check/functions.ts`: aplica A7 a cada archivo antes de emparejar.
- `build.mjs`: comprime con brotli el runtime y las gramáticas que nombra su lista y escribe `grammars/LICENSES`. Pone `logOverride: { "direct-eval": "silent" }`.
- Documentos: ADR 0016 «tree-sitter para medir las funciones» (por qué ahora, tamaño, fuentes, respaldo, lo que queda fuera); `formats.md`, `checks.md`, `checks.en.md` y `ARCHITECTURE.md` describen la medida de TypeScript y JavaScript.

## Archivos

- crear packages/core/src/checks/functions-tree.ts — la medida sobre el árbol y la interfaz de nodo
- crear packages/core/src/checks/tree-languages.ts — la tabla de TypeScript y JavaScript
- modificar packages/core/src/index.ts — exporta `treeFunctions`, `SyntaxNode` y `TreeLanguage` para el CLI
- modificar packages/core/package.json — web-tree-sitter y las gramáticas para los tests
- crear packages/core/test/checks/functions-tree.test.ts — AC3 y AC7 con árboles de verdad
- crear packages/cli/src/check/syntax.ts — carga del runtime y de las gramáticas, y parseo
- modificar packages/cli/src/check/functions.ts — mide con el árbol y cae en la estimación (A7)
- modificar packages/cli/build.mjs — las gramáticas comprimidas y sus licencias en `dist`
- crear packages/cli/grammar-licenses.txt — las licencias MIT de las gramáticas, que el build copia
- modificar packages/cli/package.json — web-tree-sitter y las gramáticas
- crear packages/cli/test/check-functions-tree.test.ts — AC1, AC2 y AC5 de punta a punta
- modificar packages/cli/test/check-functions.test.ts — solo si la medida nueva cambia algún número de sus funciones (R2)
- crear packages/cli/test/bundle-grammars.test.ts — AC4 y AC6 con el bundle en una carpeta temporal
- modificar pnpm-lock.yaml — las dependencias nuevas
- crear docs/decisions/0016-tree-sitter-para-medir-las-funciones.md — la decisión
- modificar docs/formats.md — la medida de TypeScript y JavaScript
- modificar docs/checks.md — la medida de TypeScript y JavaScript
- modificar docs/checks.en.md — la medida de TypeScript y JavaScript
- modificar docs/ARCHITECTURE.md — la medida de TypeScript y JavaScript

## Tareas

- [x] T1: El core mide las funciones de TypeScript y JavaScript sobre el árbol
  - files: packages/core/src/checks/functions-tree.ts, packages/core/src/checks/tree-languages.ts, packages/core/src/index.ts, packages/core/package.json, packages/core/test/checks/functions-tree.test.ts, pnpm-lock.yaml
  - ac: AC3, AC7
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/checks/functions-tree.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint
- [x] T2: specty check mide TypeScript y JavaScript con tree-sitter y cae en la estimación
  - files: packages/cli/src/check/syntax.ts, packages/cli/src/check/functions.ts, packages/cli/package.json, packages/cli/test/check-functions-tree.test.ts, packages/cli/test/check-functions.test.ts, pnpm-lock.yaml
  - ac: AC1, AC2, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-functions-tree.test.ts test/check-functions.test.ts && pnpm --filter @baquia-dev/specty typecheck && pnpm lint && pnpm knip
- [x] T3: El bundle lleva el runtime, las gramáticas y sus licencias
  - files: packages/cli/build.mjs, packages/cli/grammar-licenses.txt, packages/cli/test/bundle-grammars.test.ts
  - ac: AC4, AC6
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/bundle-grammars.test.ts test/bundle.test.ts && pnpm lint
- [ ] T4: La decisión y la documentación de la medida nueva
  - files: docs/decisions/0016-tree-sitter-para-medir-las-funciones.md, docs/formats.md, docs/checks.md, docs/checks.en.md, docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-docs.test.ts
  - type: docs

## Riesgos

- R1: Las gramáticas de `@repomix/tree-sitter-wasms` van por detrás de TypeScript, y la sintaxis nueva sale como `ERROR`. Mitigación: ese archivo se mide con la estimación (A7).
- R2: Los tests de `functions` que ya existen fijan números de la estimación. Mitigación: las funciones de esos tests se leen igual con los dos métodos (AC7); si alguno cambia, se ajusta con su motivo.
- R3: Más tiempo de `specty check --all`. Mitigación: el cierre mide `--all` sobre Specty, con y sin tree-sitter.
