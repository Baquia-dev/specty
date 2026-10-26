---
kind: quick
epic: 20261025-knip-vigila-las-exportaciones-y-los-tipos-que-so
slice: C5
---

# knip vigila las exportaciones y los tipos

## Objetivo

Con core, la CLI y la UI ya limpios (C1 a C4), knip enciende sus reglas de exportaciones y de tipos: desde ahora `pnpm check` falla si un cambio deja una exportación o un tipo que ningún otro archivo importa, y dice cuál. Antes, los ayudantes de los tests de la CLI dejan de exportar los ocho que solo usa su archivo (`enter`, `XDG_CONFIG_HOME`, `nextCommand`, `ToolCall`, `Step`, `Verdict`, `Friction` y `ToolResult`), que C2 dejó para este corte para no pasar de tamaño L, y ARCHITECTURE deja de decir que esas reglas siguen apagadas.

## Archivos

- modificar knip.json — encender las reglas exports y types
- modificar packages/cli/test/support.ts — XDG_CONFIG_HOME sin export
- modificar packages/cli/test/server/support.ts — enter sin export
- modificar packages/cli/test/walk.ts — nextCommand, ToolCall, Step, Verdict y Friction sin export
- modificar packages/cli/test/fake-model.ts — ToolResult sin export
- modificar docs/ARCHITECTURE.md — knip también falla si sobra una exportación o un tipo

## Tareas

- [x] T1: knip falla si sobra una exportación o un tipo
  - files: knip.json, packages/cli/test/support.ts, packages/cli/test/server/support.ts, packages/cli/test/walk.ts, packages/cli/test/fake-model.ts, docs/ARCHITECTURE.md
  - verify: pnpm check
  - type: chore

## Cierre

### Resumen

knip enciende las reglas de exportaciones y tipos: pnpm check falla y nombra la que sobre (probado con una exportación de prueba). Los ayudantes de los tests de la CLI dejan de exportar los ocho que solo usa su archivo, y ARCHITECTURE lo cuenta.
