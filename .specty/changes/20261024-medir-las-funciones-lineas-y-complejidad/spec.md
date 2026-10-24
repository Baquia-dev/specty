---
kind: standard
follows:
  - 20261024-tipado-estricto-de-typescript-en-specty-check
---

# Medir las funciones: líneas y complejidad

## Objetivo

El core sabe medir cada función de un archivo en los lenguajes de llaves (TypeScript y JavaScript, Dart, Java, Kotlin, C#, Go, Rust, Swift, PHP, C y C++): dónde empieza y acaba, cuántas líneas de código tiene y su complejidad ciclomática aproximada. La configuración gana sus límites (`checks.functions`, 50 líneas y complejidad 10). Es la base de las verificaciones `function-lines` y `complexity` del cambio siguiente, que no dependen de que el proyecto tenga un linter.

## Fuera de alcance

- Las verificaciones en `specty check`, el uso de las reglas de ESLint cuando el proyecto lo tiene y sus textos: son el cambio siguiente.
- Los lenguajes sin llaves (Python, Ruby, Elixir) y las funciones sin cuerpo entre llaves (`=> expr` en Dart, Kotlin o TypeScript): no se miden.
- Una medida exacta: es una estimación línea a línea, sin árbol de sintaxis.

## Supuestos

- A1: Una función empieza en una línea que abre un bloque (`{`) y cuyo texto antes de la llave tiene `function`, `func`, `fun` o `fn`, acaba en `=>`, o cierra una lista de parámetros (`)`, con un tipo de retorno, `throws` o `async` detrás); salvo que esa lista sea la condición de un `if`, `for`, `while`, `switch`, `catch`, `when`, `using` o `synchronized`, mirando también la línea donde se abrió el paréntesis si la cabecera ocupa varias.
  - impacto: alto
- A2: La función acaba en la línea donde su llave se cierra, contando llaves sin comentarios ni cadenas; en Rust, un `'` que no se cierra en tres caracteres es un lifetime, no una cadena.
  - impacto: alto
- A3: Las líneas de una función son sus líneas de código, de la cabecera a la llave de cierre, sin blancos ni comentarios, como la regla `lines` cuenta las de un archivo; las de una función anidada cuentan también en la que la contiene, como hace `max-lines-per-function` de ESLint.
- A4: La complejidad es 1 más cada `if`, `for`, `while`, `case`, `catch`, `guard`, `&&`, `||`, `??` y `?` de ternario (con espacios a los lados), sin contar los de las funciones anidadas, como `complexity` de ESLint.

## Criterios de aceptación

- AC1: CUANDO un archivo de cualquiera de esos lenguajes tiene funciones, métodos, constructores, lambdas o funciones flecha con bloque ENTONCES `functionMetrics` da cada una con su nombre si lo tiene, su línea de inicio y de fin, sus líneas de código y su complejidad.
- AC2: CUANDO un bloque es un `if`, `for`, `while`, `switch`, `catch`, una clase, un objeto o una llamada con un objeto (`foo({`) ENTONCES no es una función; tampoco una condición de varias líneas que acaba en `) {`.
- AC3: CUANDO hay llaves, `if` o `&&` dentro de comentarios o cadenas ENTONCES no cuentan, y una función anidada no suma su complejidad a la que la contiene.
- AC4: CUANDO el archivo es de un lenguaje sin llaves ENTONCES `functionMetrics` no da nada.
- AC5: CUANDO `checks.functions` define `maxLines` o `complexity` ENTONCES la configuración los usa; sin la clave, 50 y 10.

## Diseño

- `core/src/checks/code.ts`: `codeLines` de un texto, con el código de cada línea (comentarios fuera, cadenas vacías, comentarios de bloque seguidos entre líneas) y sus comentarios aparte. Lo usan `strict-types.ts`, que hoy tiene su propia versión, y `functions.ts`.
- `core/src/checks/functions.ts`: `functionMetrics(ruta, texto)` decide el lenguaje por la extensión, reconoce las cabeceras, empareja las llaves y mide cada función.
- `core/src/schema/checks.ts`: `checks.functions` con `maxLines` y `complexity`.

## Archivos

- crear packages/core/src/checks/code.ts — el código y los comentarios de cada línea
- modificar packages/core/src/checks/strict-types.ts — usar `code.ts` en vez de su propio separador
- crear packages/core/src/checks/functions.ts — medir las funciones de un archivo
- modificar packages/core/src/index.ts — exportar `functionMetrics` y la configuración
- crear packages/core/test/checks/functions.test.ts — cada lenguaje, los bloques que no son funciones y la complejidad
- modificar packages/core/src/schema/checks.ts — `checks.functions`

## Tareas

- [x] T1: El código y los comentarios de cada línea, compartidos
  - files: packages/core/src/checks/code.ts, packages/core/src/checks/strict-types.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/checks/strict-types.test.ts
- [ ] T2: Medir las funciones y sus límites en la configuración
  - files: packages/core/src/checks/functions.ts, packages/core/src/index.ts, packages/core/test/checks/functions.test.ts, packages/core/src/schema/checks.ts
  - ac: AC1, AC2, AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/checks

## Riesgos

- R1: Una sintaxis que la estimación no reconoce mide de más o de menos — el cambio siguiente solo mirará las funciones que el diff toca, usará ESLint cuando exista y dejará bajar el nivel de cada verificación.
