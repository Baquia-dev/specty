---
kind: standard
---

# La memoria comparte su frontmatter y sus nombres de tipo

## Objetivo

`packages/core/src/memory/fronts.ts` repite de `memory/entries.ts` la lectura del frontmatter (`FRONTMATTER` y `loadYaml`), y `cards/fronts.ts` repite de `cards/memory-refusals.ts` la tabla `ONE_OF_KIND`. Cada una pasa a un módulo propio que usan los dos, para que un arreglo no tenga que hacerse dos veces. Lo que leen y dicen no cambia.

## Fuera de alcance

- El frontmatter de `spec.md` (`spec/parse.ts`), que tiene sus propias reglas y mensajes de error.
- Cambiar los textos de las tarjetas o el formato de las entradas y los frentes.

## Supuestos

- A1: Las dos lecturas del frontmatter son iguales: pasan `\r\n` a `\n`, separan el YAML del cuerpo con la misma expresión y dan `undefined` si el YAML no se lee.
  - impacto: alto

## Criterios de aceptación

- AC1: CUANDO se ejecutan los tests de las entradas, los frentes y sus tarjetas ENTONCES pasan sin cambiar ninguno.
  - test: manual
- AC2: CUANDO se busca `FRONTMATTER`, `loadYaml` u `ONE_OF_KIND` en `packages/core/src` ENTONCES cada uno está definido en un solo archivo.
  - test: manual

## Diseño

- `memory/frontmatter.ts`, nuevo: `frontmatterOf(markdown)` devuelve `{ data, body }` (el YAML leído, o `undefined` si no se lee, y el cuerpo) o `undefined` sin frontmatter. `parseEntry` y `parseFront` lo usan en vez de su `FRONTMATTER` y su `loadYaml`.
- `cards/memory-kinds.ts`, nuevo: `ONE_OF_KIND`, cada tipo con su artículo en español y en inglés. `cards/memory-refusals.ts` y `cards/fronts.ts` lo importan.
- La API pública de core no cambia: los módulos nuevos no se exportan.

## Archivos

- crear packages/core/src/memory/frontmatter.ts — leer el frontmatter de una entrada o un frente
- modificar packages/core/src/memory/entries.ts — usa `frontmatterOf`
- modificar packages/core/src/memory/fronts.ts — usa `frontmatterOf`
- crear packages/core/src/cards/memory-kinds.ts — cada tipo de entrada con su artículo
- modificar packages/core/src/cards/memory-refusals.ts — importa `ONE_OF_KIND`
- modificar packages/core/src/cards/fronts.ts — importa `ONE_OF_KIND`

## Tareas

- [x] T1: El frontmatter de la memoria, en su propio módulo
  - files: packages/core/src/memory/frontmatter.ts, packages/core/src/memory/entries.ts, packages/core/src/memory/fronts.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/memory && pnpm typecheck && pnpm lint && pnpm exec knip
  - type: refactor
- [ ] T2: Los tipos de entrada con su artículo, en su propio módulo
  - files: packages/core/src/cards/memory-kinds.ts, packages/core/src/cards/memory-refusals.ts, packages/core/src/cards/fronts.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards test/memory && pnpm typecheck && pnpm lint && pnpm exec knip && pnpm sources
  - type: refactor
