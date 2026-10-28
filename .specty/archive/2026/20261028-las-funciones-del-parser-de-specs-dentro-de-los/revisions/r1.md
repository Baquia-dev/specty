---
kind: standard
follows:
  - 20261027-las-carpetas-spec-dentro-del-codigo-no-son-tests
---

# Las funciones del parser de specs, dentro de los límites

## Objetivo

Desde que `packages/core/src/spec/` cuenta como código y no como tests, `specty check --all` encuentra cinco funciones del parser por encima de `checks.functions`: `parseSpec` tiene 63 líneas de código (máximo 50) y `readFrontmatter`, `readList`, `readEntry` y `sectionBody` tienen complejidad 11, 14, 16 y 13 (máximo 10). Este cambio las divide por responsabilidad, sin cambiar lo que hacen, para que el repositorio vuelva a no tener funciones por encima de los límites.

## Fuera de alcance

- Cambiar lo que acepta o produce el parser: los tests de `spec` que ya existen son el contrato y no cambian.
- Los avisos de `max-lines` de `cards/index.ts`, `guard/decide.ts` y `schema/config.ts`.

## Supuestos

- A1: Basta con extraer funciones o tablas con una responsabilidad cada una, como en la épica de deuda de funciones (C1–C9): ninguna regla nueva, ningún texto nuevo.

## Criterios de aceptación

- AC1: CUANDO se ejecuta `specty check --all` con el CLI construido sobre este cambio ENTONCES `function-lines` y `complexity` no señalan ninguna función de `packages/core/src/spec/`.
  - test: manual
- AC2: CUANDO se ejecutan los tests de `packages/core/test/spec` y de core ENTONCES pasan sin cambiar ninguno.
  - test: manual

## Diseño

- `parseSpec`: el recorrido de las secciones va a `readSections`, que devuelve las secciones, sus líneas y sus diagnósticos.
- `readFrontmatter`: el frontmatter válido lo construye `frontmatterOf`.
- `readList`: cada línea la clasifica `readLine`, y el bucle solo aplica lo clasificado.
- `readEntry`: la acción la lee `readAction`, y las rutas, con un renombrado o sin él, `readPaths`.
- `sectionBody`: las secciones de prosa salen directas y las de lista, de una tabla por sección.

## Archivos

- modificar packages/core/src/spec/parse.ts — `readSections`
- modificar packages/core/src/spec/frontmatter.ts — `frontmatterOf`
- modificar packages/core/src/spec/list.ts — `readLine`
- modificar packages/core/src/spec/read-files.ts — `readAction` y `readPaths`
- modificar packages/core/src/spec/serialize.ts — la tabla de las secciones de lista

## Tareas

- [ ] T1: parseSpec y readFrontmatter, divididas
  - files: packages/core/src/spec/parse.ts, packages/core/src/spec/frontmatter.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/spec
- [ ] T2: readList y readEntry, divididas
  - files: packages/core/src/spec/list.ts, packages/core/src/spec/read-files.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/spec
- [ ] T3: sectionBody con una tabla
  - files: packages/core/src/spec/serialize.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/spec

## Riesgos

- R1: Un cambio de comportamiento escondido en la división. Mitigación: los tests de `spec` no cambian, y la verificación completa al aceptar ejecuta todos los de core, cli y ui, que leen y escriben specs.
