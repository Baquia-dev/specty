---
kind: quick
---

# Los archivos de checks.exclude se suman a los excluidos por defecto

## Objetivo

La persona deja rutas fuera de `specty check` listándolas en `checks.exclude`. Hoy esa lista reemplaza la de por defecto, así que añadir una carpeta hace que las verificaciones empiecen a leer `node_modules`, `build`, `dist` y el resto de dependencias y artefactos. Desde este cambio, lo que pone la persona se suma a la lista por defecto, como ya hace `lines.exclude`.

## Archivos

- modificar packages/core/src/schema/checks.ts — `checks.exclude` se suma a la lista por defecto
- modificar packages/core/test/schema/schema.test.ts — una ruta de la persona queda fuera y las carpetas por defecto también
- modificar docs/formats.md — §6: `checks.exclude` se suma a la lista por defecto
- modificar docs/checks.md — configuración común: cómo dejar fuera una ruta
- modificar docs/checks.en.md — lo mismo en inglés

## Tareas

- [ ] T1: Los archivos de checks.exclude se suman a los excluidos por defecto
  - files: packages/core/src/schema/checks.ts, packages/core/test/schema/schema.test.ts, docs/formats.md, docs/checks.md, docs/checks.en.md
  - verify: pnpm typecheck && pnpm lint && pnpm --filter @baquia-dev/specty-core exec vitest run test/schema test/checks
  - type: feat
