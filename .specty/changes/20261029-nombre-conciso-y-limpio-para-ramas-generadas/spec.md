---
kind: quick
---

# Nombre conciso y limpio para ramas generadas

## Objetivo

Evitar nombres de rama largos o truncados a mitad de palabra (como `...-proponerl-2`) al generar ramas de cambios. Se mejora `slugify` para cortar siempre en fronteras de palabras completas antes de `maxLength`, y se dota a `specty new` de las opciones `--slug` y `--branch` para permitir slugs concisos y nombres de rama personalizados.

## Archivos

- modificar packages/core/src/ids.ts — truncar slugs por límites de palabras completas
- modificar packages/cli/src/commands/agent-commands.ts — registrar opciones --slug y --branch en specty new
- modificar packages/cli/src/commands/new.ts — usar slug y branch en la asignación del id y rama del cambio
- modificar packages/core/test/basics.test.ts — tests unitarios de slugify con truncado en límite de palabra
- modificar packages/cli/test/branch-names.test.ts — tests de specty new con --slug y --branch
- modificar docs/ARCHITECTURE.md — documentar --slug y --branch en specty new

## Tareas

- [x] T1: Truncado de slugs por palabra y soporte de --slug y --branch en specty new
  - files: packages/core/src/ids.ts, packages/cli/src/commands/agent-commands.ts, packages/cli/src/commands/new.ts, packages/core/test/basics.test.ts, packages/cli/test/branch-names.test.ts, docs/ARCHITECTURE.md
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/basics.test.ts && pnpm --filter @baquia-dev/specty exec vitest run test/branch-names.test.ts
