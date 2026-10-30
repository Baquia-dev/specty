---
kind: epic
---

# Specty mide las funciones con tree-sitter

## Objetivo

Hoy `function-lines` y `complexity` miden cada función con una estimación línea a línea. La estimación falla sin avisar: en Specty no ve `deriveView` (85 líneas), porque su parámetro se llama `record` y lo toma por una declaración de tipo de Java. Tampoco ve las arrow functions cuyo cuerpo es una expresión de varias líneas, ni los getters de Dart. Además, cuenta como funciones los tipos de parámetro de varias líneas.

Con esta épica, Specty mide las funciones con el árbol de sintaxis de tree-sitter, en WebAssembly y sin compilar nada en la máquina de la persona. Las gramáticas van comprimidas dentro del paquete del CLI. La estimación de hoy queda como respaldo.

## Fuera de alcance

- Los escáneres de imports del aviso de impacto y de las capas: lo difícil es resolver cada import, no leerlo.
- Scala y Groovy, que ningún stack detecta: siguen con la estimación.
- Otros usos del árbol, como reglas de riesgo por AST o un adaptador de Opengrep.
- Saldar la deuda que la medida nueva destape en Specty (`deriveView`, `asistenciaSample`…): va a la lista de pendientes, con cada función.
- Cambiar `checks.functions` o sus límites por defecto.
- Los bindings nativos de tree-sitter (node-gyp).

## Supuestos

- A1: El runtime es web-tree-sitter (MIT), con versión exacta (hoy 0.27.1). Es devDependency del CLI y va en `dist` como el resto de sus dependencias.
  - impacto: alto
- A2: Las gramáticas salen de `@repomix/tree-sitter-wasms` 0.1.17 (Unlicense; gramáticas de 2025 compiladas con tree-sitter-cli 0.26) para las 14 que trae: TypeScript, TSX, JavaScript, Dart, Python, Go, Rust, C#, Java, PHP, Ruby, Swift, C y C++. Kotlin sale de `@tree-sitter-grammars/tree-sitter-kotlin` 1.1.0 y Elixir de `tree-sitter-elixir` 0.3.5, con su `.wasm` oficial. Todas van con versión exacta. Las de `tree-sitter-wasms` 0.1.13 no sirven, porque web-tree-sitter 0.27 no carga su formato (probado el 2026-10-30). Cada corte comprueba que sus gramáticas cargan.
  - impacto: alto
- A3: `dist` guarda las gramáticas y el runtime comprimidos con brotli. Los 17 archivos pasan de 28,2 MB a 1,62 MB, y descomprimirlos todos tarda 22 ms (medido el 2026-10-30). Cada ejecución descomprime solo los de sus lenguajes. El paquete de npm crece unos 1,6 MB.
  - impacto: alto
- A4: El core sigue sin IO: mide sobre una interfaz de nodo (tipo, filas, hijos, campo por nombre) que el nodo de web-tree-sitter cumple sin casts. Cada lenguaje es una tabla en el core: sus nodos de función, de rama y de comentario, y de dónde sale el nombre. El CLI carga el runtime y la gramática, parsea y le pasa el árbol.
  - impacto: alto
- A5: Las medidas se definen como hoy, para que los límites de `checks.functions` signifiquen lo mismo. Las líneas de código son las filas de la primera línea de la cabecera a la última del cuerpo con algún token que no es un comentario, sin decoradores ni anotaciones. La complejidad es 1 más cada `if`, `for`, `while`, `case`, `catch`, `guard`, `&&`, `||`, `??` y ternario, sin los de las funciones anidadas, más las ramas propias de un lenguaje que ya cuenta su estimación (`elif`, `except`, `when`, `rescue`, `and`, `or`…).
- A6: El nombre sale del campo `name` del nodo. Si la función es anónima, sale de la variable, la propiedad o la asignación que la recibe. El emparejamiento con la versión de partida sigue siendo por nombre y por orden.
- A7: La estimación sigue en el core y mide en tres casos: un lenguaje sin gramática, un runtime o una gramática que no carga, y un archivo con errores de sintaxis para tree-sitter (nodos `ERROR` o `MISSING`) en la versión de partida o en la actual. En ese último caso, las dos versiones se miden con la estimación, para que ninguna función «crezca» solo por cambiar de medida.
- A8: El parseo vive en un módulo de `cli/src/check/` que se carga al usarse: solo cuando corren `function-lines` o `complexity` y hay un archivo de un lenguaje con gramática. El guard y los demás hooks no lo cargan.

## Criterios de aceptación

- AC1: CUANDO un cambio agranda por encima de `checks.functions.maxLines` una función de TypeScript con un parámetro llamado `record` ENTONCES `function-lines` la señala con su nombre y la línea de su cabecera.
- AC2: CUANDO un cambio añade una arrow function cuyo cuerpo es una expresión de varias líneas y pasa de `checks.functions.complexity` ENTONCES `complexity` la señala.
- AC3: CUANDO una función tiene un tipo de parámetro de varias líneas entre llaves ENTONCES se mide como una sola función, desde la primera línea de su cabecera, y el tipo no cuenta como otra.
- AC4: CUANDO el runtime o la gramática de un archivo no cargan ENTONCES `function-lines` y `complexity` lo miden con la estimación, sin fallar.
- AC5: CUANDO la versión de partida o la actual de un archivo tiene errores de sintaxis para tree-sitter ENTONCES las dos versiones se miden con la estimación.
- AC6: CUANDO se construye el CLI ENTONCES `dist` lleva el runtime y las gramáticas comprimidos, y el bundle mide con ellos sin `node_modules`.
- AC7: CUANDO se mide una función con tree-sitter ENTONCES sus líneas de código y su complejidad siguen la definición de A5: las mismas que daría la estimación en una función que ella lee bien.
- AC8: CUANDO un cambio agranda por encima del límite un getter de Dart (`get x {` o `get x => …` de varias líneas) ENTONCES `function-lines` lo señala con su nombre.
- AC9: CUANDO un cambio agranda por encima del límite una función de Go, Rust, Java, Kotlin, C#, PHP, Swift, C o C++ ENTONCES `function-lines` la señala, medida con tree-sitter.
- AC10: CUANDO un cambio agranda por encima de un límite una función de Elixir (`def` o `defp`) ENTONCES `function-lines` o `complexity` la señalan, y Elixir deja de ser el stack sin medida.
- AC11: CUANDO se mide una función de Python o de Ruby ENTONCES tree-sitter da su inicio y su final, y los docstrings de Python siguen sin contar como código.

## Diseño

- Core (`core/src/checks/`): un módulo que mide sobre el árbol (`treeFunctions(language, root)`) y devuelve `FunctionMetric[]`, el tipo de hoy. Lo acompañan las tablas por lenguaje y la interfaz de nodo de A4. `functionMetrics(path, text)`, la estimación, no cambia. La API pública de core añade lo que use el CLI, en `core/src/index.ts`.
- CLI (`cli/src/check/`): un módulo de sintaxis que elige el lenguaje por la extensión, inicia web-tree-sitter una vez y carga cada gramática la primera vez que hace falta. Busca primero los `.wasm.br` junto al bundle; en el monorepo (tests y desarrollo), los `.wasm` de `node_modules`. `functions.ts` le pide las funciones de cada versión del archivo y aplica A7.
- Build (`cli/build.mjs`): copia el runtime y las gramáticas de los devDependencies a `dist/grammars/`, comprimidos con brotli. Los avisos de licencia de cada gramática van en `dist`, junto a `LICENSE` y `NOTICE`.
- Un ADR nuevo (0016) recoge la decisión: por qué tree-sitter ahora, el tamaño medido, la estimación como respaldo y lo que queda fuera.
- `docs/formats.md` (`function-lines` y `complexity`) y `docs/ARCHITECTURE.md` (la tabla de `specty check`) describen la medida nueva.

## Cortes

- C1: Las funciones de TypeScript y JavaScript se miden con tree-sitter
  - ac: AC1, AC2, AC3, AC4, AC5, AC6, AC7
- C2: Las funciones de Dart, Go, Rust, Java, Kotlin, C#, PHP, Swift, C y C++ se miden con tree-sitter
  - ac: AC8, AC9
  - depends: C1
- C3: Python, Ruby y Elixir se miden con tree-sitter, y Elixir por primera vez
  - ac: AC10, AC11
  - depends: C1

## Riesgos

- R1: El paquete del CLI crece. Mitigación: brotli (A3); C1 mide el tamaño con `npm pack` y lo anota en el ADR.
- R2: Aparecen hallazgos que la estimación no veía. Mitigación: solo fallan las funciones nuevas o que el cambio agranda; la deuda vieja solo sale con `--all`. El cierre de cada corte lo dice.
- R3: Ejecutar `.wasm` de terceros. Mitigación: WebAssembly no toca el sistema por sí solo, las versiones van exactas con su integridad en el lockfile, y el ADR nombra cada fuente.
- R4: Parsear es más lento que estimar: 0,5 s frente a 71 ms en 108 mil líneas. Mitigación: `--changed` parsea pocos archivos; C1 mide `specty check --all` sobre Specty.
- R5: Una gramática va por detrás de su lenguaje, y la sintaxis nueva sale como `ERROR`. Mitigación: la estimación mide ese archivo (A7).
- R6: C1 no cabe en un cambio de tamaño L. Mitigación: lleva un cambio previo (el runtime, las gramáticas y el build), con su test, como en otras épicas.
