---
kind: standard
epic: 20261025-knip-vigila-las-exportaciones-y-los-tipos-que-so
slice: C1
---

# core sin exportaciones ni tipos que sobran

## Objetivo

Con todas sus reglas encendidas, knip marca en `packages/core` diez exportaciones y tipos que ningún otro archivo importa. Son `kindOf` de delta.ts, `FrontmatterSchema`, `readIdHead`, `serializeFrontmatter`, `normalizeText`, `SourceHeading`, `SourceSection` y `ListProblem`, más la reexportación de `MessageCatalog` y `MessageParams` en diagnostics.ts. Todos se usan solo en su archivo, menos esa reexportación, que no usa nadie: a los primeros se les quita el `export` y la reexportación se borra. Es el primer corte de la épica; las reglas se encienden en C5.

## Fuera de alcance

- Cambiar lo que hace cualquier función: solo cambian las exportaciones.
- La CLI y la UI, que tienen sus propios cortes (C2, C3 y C4).

## Supuestos

- A1: core es privado y solo publica `src/index.ts` (el `exports` de su package.json), así que quitar el `export` de algo que index.ts no reexporta no rompe nada fuera del repositorio.

## Criterios de aceptación

- AC1: CUANDO se ejecuta knip con todas las reglas encendidas ENTONCES no marca ninguna exportación ni tipo de `packages/core`.
- AC2: CUANDO se ejecutan los tests y la comprobación de tipos ENTONCES pasan sin cambiar ningún test.

## Archivos

- modificar packages/core/src/spec/source.ts — normalizeText, SourceHeading y SourceSection sin export
- modificar packages/core/src/spec/frontmatter.ts — FrontmatterSchema sin export
- modificar packages/core/src/spec/read-helpers.ts — readIdHead sin export
- modificar packages/core/src/spec/list.ts — ListProblem sin export
- modificar packages/core/src/spec/diagnostics.ts — sin la reexportación de MessageCatalog y MessageParams
- modificar packages/core/src/spec/delta.ts — kindOf sin export
- modificar packages/core/src/spec/serialize.ts — serializeFrontmatter sin export

## Tareas

- [x] T1: Lo que solo usa la lectura de la spec deja de exportarse
  - files: packages/core/src/spec/source.ts, packages/core/src/spec/frontmatter.ts, packages/core/src/spec/read-helpers.ts, packages/core/src/spec/list.ts, packages/core/src/spec/diagnostics.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core typecheck && pnpm --filter @baquia-dev/specty-core test
  - type: refactor
- [ ] T2: Lo que solo usan el delta y el serializador deja de exportarse
  - files: packages/core/src/spec/delta.ts, packages/core/src/spec/serialize.ts
  - ac: AC1, AC2
  - verify: pnpm check
  - type: refactor
