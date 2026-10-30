---
kind: standard
epic: 20261030-tree-sitter-mide-las-funciones
slice: C3
follows:
  - 20261030-elixir-con-tree-sitter
allowedDependencies:
  - tree-sitter-elixir
---

# Elixir se mide en specty check con tree-sitter

## Objetivo

Elixir era el único stack sin `function-lines` ni `complexity`. El cambio previo enseñó al core a medir sus funciones sobre el árbol de tree-sitter; este las mide en `specty check`, lleva la gramática en el bundle y lo documenta. Con él cierra el corte C3 y la épica: todos los stacks de Specty miden sus funciones sobre el árbol.

## Fuera de alcance

- Una estimación línea a línea para Elixir: si la gramática no carga, Elixir sigue sin medirse.
- Saldar la deuda que la medida nueva destape en proyectos Mix: solo fallan las funciones que el cambio crea o agranda.

## Supuestos

- A1: `tree-sitter-elixir` 0.3.5 pasa a ser también devDependency del CLI, con versión exacta. Su `allowBuilds: false` y su peer opcional (`packageExtensions`) ya están en `pnpm-workspace.yaml` desde el cambio previo.
- A2: La gramática sale de la extensión: `.ex` y `.exs`. El CLI nombra el archivo en su paquete con un literal en `require.resolve`, para que knip lo vea usado.
- A3: Elixir sale de `UNMEASURED` en `check/functions.ts`, que queda vacío y desaparece: todo stack ve las dos verificaciones. El test de `check-functions.test.ts` que daba Elixir por no medido cambia en la fase de tests.
  - impacto: alto
- A4: El build copia la gramática de su paquete y su licencia Apache-2.0 a `grammars/LICENSES`. El paquete no trae un `NOTICE`, así que no hay otro aviso que copiar.

## Criterios de aceptación

- AC1: CUANDO un cambio agranda por encima de `checks.functions.maxLines` un `def` de Elixir en un proyecto Mix ENTONCES `function-lines` lo señala con su nombre y su línea.
- AC2: CUANDO un cambio añade un `defp` de Elixir cuyo `case` tiene más cláusulas que `checks.functions.complexity` ENTONCES `complexity` lo señala.
- AC3: CUANDO `specty check` revisa un proyecto Mix sin funciones por encima de los límites ENTONCES `function-lines` y `complexity` cuentan entre sus verificaciones.
- AC4: CUANDO se construye el CLI ENTONCES `grammars/` lleva comprimida la gramática de Elixir, y `LICENSES` lleva su licencia Apache-2.0.

## Diseño

- `check/syntax.ts`: `.ex` y `.exs`, con el archivo en su propio paquete, como Kotlin.
- `check/functions.ts`: sin `UNMEASURED`; el proveedor se aplica a todo stack.
- `build.mjs`: la gramática de Elixir desde su paquete, con su licencia.
- Documentos: `formats.md`, `checks.md`, `checks.en.md` y `ARCHITECTURE.md` dejan de exceptuar Elixir y describen su medida; el ADR 0016 recoge las fuentes, el tamaño final y la épica cerrada.

## Archivos

- modificar packages/cli/src/check/syntax.ts — `.ex` y `.exs`, y el archivo de Elixir
- modificar packages/cli/src/check/functions.ts — Elixir deja de ser un stack sin medida
- modificar packages/cli/package.json — la gramática de Elixir
- crear packages/cli/test/check-functions-elixir.test.ts — AC1 y AC2
- modificar packages/cli/test/check-functions.test.ts — AC3: Elixir ya ve las dos verificaciones
- modificar packages/cli/build.mjs — la gramática de Elixir y su licencia
- crear packages/cli/test/bundle-grammars-elixir.test.ts — AC4
- modificar pnpm-lock.yaml — la dependencia en el CLI
- modificar docs/formats.md — Elixir se mide
- modificar docs/checks.md — Elixir se mide
- modificar docs/checks.en.md — Elixir se mide
- modificar docs/ARCHITECTURE.md — Elixir se mide
- modificar docs/decisions/0016-tree-sitter-para-medir-las-funciones.md — las fuentes, el tamaño final y la épica cerrada

## Tareas

- [x] T1: specty check mide Elixir con tree-sitter
  - files: packages/cli/src/check/syntax.ts, packages/cli/src/check/functions.ts, packages/cli/package.json, packages/cli/test/check-functions-elixir.test.ts, packages/cli/test/check-functions.test.ts, pnpm-lock.yaml
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-functions-elixir.test.ts test/check-functions.test.ts && pnpm --filter @baquia-dev/specty typecheck && pnpm lint && pnpm knip
- [x] T2: El bundle lleva la gramática de Elixir y su licencia
  - files: packages/cli/build.mjs, packages/cli/test/bundle-grammars-elixir.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/bundle-grammars-elixir.test.ts test/bundle-grammars.test.ts && pnpm lint
- [x] T3: La documentación de la medida de Elixir
  - files: docs/formats.md, docs/checks.md, docs/checks.en.md, docs/ARCHITECTURE.md, docs/decisions/0016-tree-sitter-para-medir-las-funciones.md
  - ac: —
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-docs.test.ts
  - type: docs

## Riesgos

- R1: Los proyectos Mix que ya usan Specty ven dos verificaciones nuevas. Mitigación: solo fallan las funciones que el cambio crea o agranda; la deuda vieja sale con `--all`.
