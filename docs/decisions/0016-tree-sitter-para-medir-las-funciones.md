# 0016 · tree-sitter para medir las funciones

- Estado: aceptada
- Fecha: 2026-10-30

## Contexto

`function-lines` y `complexity` ([ADR 0012](0012-lo-verificable-lo-verifica-specty.md)) medían cada función con una estimación línea a línea del core: una para los lenguajes de llaves, otra para Python y otra para Ruby. Sin un parser, el paquete del CLI no crecía. La estimación, en cambio, falla sin avisar. Medida el 2026-10-30 contra tree-sitter:

- En las 430 fuentes TypeScript de Specty coincidían 2.702 de 3.282 funciones.
- No veía `deriveView` (85 líneas) ni `asistenciaSample` (68), porque un parámetro llamado `record` se toma por una declaración de tipo de Java. La verificación pasaba sin mirarlas.
- No veía las arrow functions cuyo cuerpo es una expresión de varias líneas, ni los getters de Dart (cinco de entre 78 y 134 líneas en dos apps Flutter).
- Contaba como funciones los tipos de parámetro de varias líneas.
- No contaba los ternarios cuyo `?` abre la línea, como los deja Biome. Sobre todo por eso, nueve funciones de Specty pasan de complejidad 10 con el árbol y no con la estimación.

La decisión de antes miraba el tamaño desempaquetado de las gramáticas (22–52 MB). Comprimidas, ocupan mucho menos, y el runtime en WebAssembly no compila nada en la máquina de la persona.

## Decisión

- `function-lines` y `complexity` miden con el árbol de sintaxis de tree-sitter: web-tree-sitter (MIT), en WebAssembly. La medida no cambia de definición, así que `checks.functions` significa lo mismo:
  - las líneas de código van de la primera línea de la cabecera, sin decoradores, a la última del cuerpo, sin blancos ni comentarios;
  - la complejidad es 1 más cada condición, bucle, `case`, `catch`, ternario y operador lógico, sin los de las funciones anidadas.
- El core mide sobre una interfaz de nodo propia (`SyntaxNode`), que el nodo de web-tree-sitter cumple sin casts, con una tabla por lenguaje (`core/src/checks/tree-languages.ts`). El CLI carga el runtime y las gramáticas (`cli/src/check/syntax.ts`) y le pasa el árbol.
- El paquete del CLI lleva en `grammars/` el runtime y las gramáticas comprimidos con brotli de calidad 9, con sus licencias. La 11 ahorraría un 10 % más y tardaría ochenta veces más en cada build. El bundle solo lee esas copias: el `NODE_PATH` que pone pnpm le dejaría encontrar otras.
- Las gramáticas salen de `@repomix/tree-sitter-wasms` (Unlicense; gramáticas MIT de 2025), con versión exacta. Las de `tree-sitter-wasms` no sirven, porque web-tree-sitter 0.27 no carga su formato. Kotlin, que ese paquete no trae, sale de `@tree-sitter-grammars/tree-sitter-kotlin`, de los mantenedores de tree-sitter; su script de instalación compila un binding nativo que Specty no usa, y va apagado en `allowBuilds`.
- La estimación sigue y mide un archivo cuando su lenguaje no tiene gramática, cuando el runtime o la gramática no cargan, o cuando su versión de partida o la actual tienen errores de sintaxis. En ese caso mide las dos versiones, para que ninguna función crezca solo por cambiar de medida.
- Llegan por familias, con la épica «Specty mide las funciones con tree-sitter»: TypeScript y JavaScript; C, C++, Java, C# y PHP; Go, Rust, Swift, Dart y Kotlin; y después Python, Ruby y Elixir.

## Consecuencias

- El paquete de npm crece: 336 KB con TypeScript, TSX y JavaScript, y 1,5 MB con todos los lenguajes de llaves (catorce gramáticas y el runtime).
- Medir todo Specty (450 archivos) tarda 0,5 s, frente a 0,04 s de la estimación. Con `--changed`, solo se parsean los archivos del cambio.
- Aparecen funciones por encima de los límites que antes no se veían. Solo fallan si el cambio las crea o las agranda; la deuda vieja sale con `--all`.
- Los escáneres de imports del aviso de impacto y de las capas siguen sin parser: lo difícil es resolver cada import, no leerlo.
- Ejecutar WebAssembly de terceros: no toca el sistema por sí solo, va con versión exacta y su integridad en el lockfile.
