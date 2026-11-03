---
kind: standard
epic: 20261030-tree-sitter-mide-las-funciones
follows:
  - 20261030-python-ruby-con-tree-sitter
allowedDependencies:
  - tree-sitter-elixir
---

# El core mide las funciones de Elixir sobre el árbol

## Objetivo

Elixir es el único stack sin `function-lines` ni `complexity`: no tiene estimación. Este cambio enseña al core a medir sus funciones sobre el árbol de tree-sitter. Es el cambio previo del corte C3 de la épica, que no cabía en uno: el corte conecta la medida con `specty check`, el bundle y la documentación.

## Fuera de alcance

- `specty check`, el bundle y la documentación: van en el corte C3. Hasta entonces, Elixir sigue sin medirse para la persona.
- Contar como ramas las cláusulas de un `fn`: un `fn` es una función.

## Supuestos

- A1: La gramática sale de `tree-sitter-elixir` 0.3.5 (Apache-2.0, de elixir-lang), con versión exacta, como devDependency del core para sus tests. Trae su `.wasm` en el paquete. Su script de instalación (`node-gyp-build`) compila un binding nativo que no hace falta, y su `tree-sitter` nativo es un peer obligatorio que pnpm instala: los dos van en `allowBuilds` con `false`.
  - impacto: alto
- A2: En Elixir todo es una llamada: `def`, `if` y `case` son nodos `call` que se distinguen por el texto de su `target`. Una función es una llamada `def`, `defp`, `defmacro` o `defmacrop` (con su bloque o con `do:`), o una `fn`. Su nombre es el de la llamada que va en sus argumentos, también con una guarda `when`; una `fn` toma el de la variable que la recibe.
  - impacto: alto
- A3: Las ramas son las llamadas `if` y `unless`, cada cláusula (`->`) de `case`, `cond`, `receive` y `with`, cada cláusula de un `rescue` o un `catch`, y los operadores `and`, `or`, `&&` y `||`. El core lo lee con un campo nuevo de la tabla, `calls`: el nodo de una llamada, el campo de su `target`, los textos que son una función, una rama o una llamada con cláusulas, el nodo de una cláusula y los bloques cuyas cláusulas cuentan.
  - impacto: alto
- A4: Probado el 2026-10-30 con un prototipo sobre la gramática: los números del test salen a mano.

## Criterios de aceptación

- AC1: CUANDO `treeFunctions` mide en Elixir un `def` con guarda, comentario, una `fn`, `unless`, `cond`, `try` con `rescue`, `&&` y `||`, y un `defp` de una línea ENTONCES da sus nombres, sus inicios, sus finales, sus líneas de código y su complejidad, y la `fn` toma el nombre de su variable.
- AC2: CUANDO `treeFunctions` mide un `defp` de Elixir cuyo `case` tiene cuatro cláusulas ENTONCES su complejidad es 5.

## Diseño

- `checks/tree-languages.ts`: `TreeGrammar` añade `calls`, opcional. `TreeLanguage` suma `elixir`.
- `checks/tree-languages-scripting.ts`: la tabla de Elixir.
- `checks/functions-tree.ts`: una llamada cuyo `target` es una función de `calls` es una función, con el nombre de sus argumentos; una cuyo `target` es una rama cuenta como rama; y una cláusula cuenta si su bloque es de `rescue` o `catch`, o si su llamada es de las que tienen cláusulas.

## Archivos

- modificar packages/core/src/checks/functions-tree.ts — las funciones y las ramas que son llamadas
- modificar packages/core/src/checks/tree-languages.ts — el campo `calls` y `elixir`
- modificar packages/core/src/checks/tree-languages-scripting.ts — la tabla de Elixir
- modificar packages/core/package.json — la gramática de Elixir para los tests
- crear packages/core/test/checks/functions-tree-elixir.test.ts — AC1 y AC2
- modificar pnpm-workspace.yaml — `tree-sitter-elixir` y `tree-sitter` en `allowBuilds` con `false`
- modificar pnpm-lock.yaml — la dependencia nueva

## Tareas

- [x] T1: La tabla lee las llamadas y el core mide Elixir sobre el árbol, con su gramática sin compilar nada
  - files: packages/core/src/checks/functions-tree.ts, packages/core/src/checks/tree-languages.ts, packages/core/src/checks/tree-languages-scripting.ts, packages/core/test/checks/functions-tree-elixir.test.ts, packages/core/package.json, pnpm-workspace.yaml, pnpm-lock.yaml
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/checks/functions-tree-elixir.test.ts test/checks/functions-tree-scripting.test.ts test/checks/functions-tree.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint && pnpm knip

## Riesgos

- R1: El `tree-sitter` nativo que pnpm instala como peer pesa en la instalación de desarrollo. Mitigación: no se compila (`allowBuilds: false`) y no va en ningún paquete publicado.

## Cierre

### Resumen

El core mide las funciones de Elixir sobre el árbol de tree-sitter.
- `TreeGrammar` añade `calls`, que distingue las llamadas por el texto de su `target`.
  - `def`, `defp`, `defmacro` y `defmacrop` son funciones, nombradas por la llamada de sus argumentos (también con guarda).
  - `if` y `unless` son ramas, y lo es cada cláusula de `case`, `cond`, `receive`, `with`, `rescue` y `catch`.
- Una `fn` es una función y toma el nombre de su variable.
- `tree-sitter-elixir` 0.3.5 es devDependency del core, sin su binding nativo.

### Desviaciones

- El corte C3 no cabía en un cambio (XL): este es su cambio previo, solo el core, y el corte conecta la medida con `specty check`, el bundle y la documentación.
- Su peer `tree-sitter` (el binding nativo, obligatorio) se declara opcional con `packageExtensions` en `pnpm-workspace.yaml`, en lugar de dejar que pnpm lo instale y apagarlo en `allowBuilds`: instalado, dejaba un aviso de peer no satisfecho en la gramática de Kotlin.

### Decisiones

- Las cláusulas de una `fn` no son ramas: una `fn` es una función.

### Pendientes

- El corte C3: `.ex` y `.exs` en el CLI, Elixir fuera de `UNMEASURED`, el test que lo daba por no medido, la gramática en el bundle con su licencia Apache-2.0, y la documentación.
