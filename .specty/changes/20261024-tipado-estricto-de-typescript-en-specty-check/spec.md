---
kind: standard
follows:
  - 20261024-los-comandos-del-proyecto-en-specty-check
---

# Tipado estricto de TypeScript en specty check

## Objetivo

En un proyecto TypeScript, `specty check` falla si el cambio añade un `any` explícito, un `@ts-ignore` o `@ts-nocheck`, o una aserción no nula (`x!`). Usa el ESLint del proyecto con las reglas de typescript-eslint cuando está instalado, y una detección propia cuando no, para que la regla se cumpla aunque el proyecto use Biome o no tenga lint.

## Fuera de alcance

- Instalar ESLint o typescript-eslint en el proyecto: es de la instalación con confirmación (corte 6).
- Las líneas por función, la complejidad y las capas: son los cortes siguientes del proveedor de TypeScript.
- Las reglas de Biome: sin ESLint, la detección propia cubre a Biome y a los proyectos sin lint por igual.
- Los archivos de declaración (`*.d.ts`), que describen código de fuera y a menudo necesitan `any`.

## Supuestos

- A1: ESLint 9 o posterior acepta `--rule` en formato levn (`'@typescript-eslint/no-explicit-any: error'`), suma esas reglas a las de la configuración del proyecto, y con `--format json` da por archivo `filePath` y mensajes con `ruleId` y `line`; sale con 2 si la configuración falla, por ejemplo si no carga typescript-eslint.
  - impacto: alto
- A2: Hay ESLint con typescript-eslint cuando existe `node_modules/.bin/eslint` y el `package.json` de la raíz declara `typescript-eslint` o `@typescript-eslint/eslint-plugin`; si no, se usa la detección propia.
  - impacto: alto
- A3: `@typescript-eslint/ban-ts-comment` ya rechaza `@ts-ignore` y `@ts-nocheck` con sus opciones por defecto, y `@typescript-eslint/no-non-null-assertion` no tiene opciones, así que basta con activarlas a `error`.
- A4: La detección propia, línea a línea y sin comentarios ni cadenas, reconoce `any` donde va un tipo (tras `:`, `<`, `as`, `extends`, `=>`, `|`, `&`, `keyof`, o seguido de `[]`, o entre comas antes de `>`), y la aserción no nula como `!` pegado a un nombre, `)` o `]` y seguido de `.`, `[`, `)`, `,`, `;` o el fin de línea (este último, no en `.tsx`, donde un texto JSX puede acabar en `!`).
- A5: Como las demás verificaciones de marcas, con `--changed` y `--staged` solo cuentan las líneas añadidas.

## Criterios de aceptación

- AC1: CUANDO un proyecto TypeScript sin ESLint añade `const x: any`, `as any`, `Array<any>`, `// @ts-ignore`, `// @ts-nocheck` o `user!.name` ENTONCES `specty check` sale con 1 y muestra `FALLA strict-types` con `ruta:línea` y un mensaje por cada uno.
- AC2: CUANDO `any` o `!` aparecen en un comentario, en una cadena, como nombre de variable (`foo(any)`), en `!==` o en una asignación definida (`let x!: T`) ENTONCES no cuentan.
- AC3: CUANDO el proyecto tiene ESLint con typescript-eslint ENTONCES `strict-types` lo ejecuta sobre los archivos TypeScript de la ejecución con las tres reglas a `error`, y solo cuenta los mensajes de esas tres reglas en las líneas añadidas; con `--all` le pasa el proyecto entero.
- AC4: CUANDO ESLint sale con 2 ENTONCES `strict-types` no corre y `--verbose` muestra su error.
- AC5: CUANDO el repositorio no tiene TypeScript ENTONCES `strict-types` no aparece; los archivos `*.d.ts` no se miran.
- AC6: CUANDO el idioma es inglés ENTONCES los mensajes están en inglés.

## Diseño

- `core/src/checks/strict-types.ts`, puro: `strictTypeViolations(texto, tsx)` devuelve `{ line, rule }` con `rule` en `explicit-any`, `ts-comment` y `non-null-assertion`. Quita los comentarios (también los de bloque que siguen en otra línea) y las cadenas antes de buscar `any` y `!`, y busca `@ts-ignore` y `@ts-nocheck` en los comentarios.
- `cli/src/check/typescript.ts`: `typescriptProvider` se aplica si algún stack es TypeScript y trae `strict-types`. La verificación elige ESLint o la detección propia, y traduce cada regla de ESLint a la misma `rule` para dar los mismos mensajes, en los dos idiomas, por cualquiera de los dos caminos.
- `commands/check.ts` pone el proveedor de TypeScript delante del común.

## Archivos

- crear packages/core/src/checks/strict-types.ts — la detección propia del tipado estricto
- modificar packages/core/src/index.ts — exportarla
- crear packages/core/test/checks/strict-types.test.ts — cada forma y sus falsos positivos
- crear packages/cli/src/check/typescript.ts — el proveedor de TypeScript y `strict-types`
- modificar packages/cli/src/commands/check.ts — añadir el proveedor de TypeScript
- crear packages/cli/test/check-typescript.test.ts — los dos caminos de punta a punta, con un ESLint falso
- modificar docs/formats.md — la verificación `strict-types`
- modificar docs/ARCHITECTURE.md — lo que trae hoy `specty check`

## Tareas

- [x] T1: La detección propia del tipado estricto
  - files: packages/core/src/checks/strict-types.ts, packages/core/src/index.ts, packages/core/test/checks/strict-types.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/checks/strict-types.test.ts
- [x] T2: `strict-types` con ESLint o con la detección propia
  - files: packages/cli/src/check/typescript.ts, packages/cli/src/commands/check.ts, packages/cli/test/check-typescript.test.ts
  - ac: AC1, AC3, AC4, AC5, AC6
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-typescript.test.ts test/check.test.ts
- [x] T3: La documentación
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC3
  - verify: pnpm check

## Riesgos

- R1: La detección propia da un falso positivo en una sintaxis rara — solo mira las líneas añadidas, y el nivel de `strict-types` se baja en `checks.levels`; con ESLint instalado, manda el análisis de ESLint.
- R2: El ESLint del proyecto tarda con `--all` en un repositorio grande — es el mismo coste que su propio lint, y en `--changed` solo recibe los archivos de la ejecución.
