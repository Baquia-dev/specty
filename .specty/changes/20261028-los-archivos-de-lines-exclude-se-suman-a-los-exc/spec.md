---
kind: quick
---

# Los archivos de lines.exclude se suman a los excluidos por defecto

## Objetivo

La persona puede dejar archivos concretos fuera del límite de líneas listándolos en `lines.exclude`, con su ruta o con un glob. Hoy esa lista reemplaza la de por defecto, así que añadir un archivo deja de excluir sin aviso las carpetas de datos (fixtures, mocks, migrations, i18n…). Desde este cambio, lo que pone la persona se suma a la lista por defecto, que siempre queda fuera.

## Archivos

- modificar packages/core/src/schema/config.ts — `lines.exclude` se suma a la lista por defecto
- modificar packages/core/test/schema/schema.test.ts — un archivo de la persona queda fuera y las carpetas por defecto también
- modificar docs/formats.md — §6: `lines.exclude` se suma a la lista por defecto
- modificar docs/checks.md — `max-lines`: cómo dejar fuera un archivo concreto
- modificar docs/checks.en.md — lo mismo en inglés

## Tareas

- [x] T1: Los archivos de lines.exclude se suman a los excluidos por defecto
  - files: packages/core/src/schema/config.ts, packages/core/test/schema/schema.test.ts, docs/formats.md, docs/checks.md, docs/checks.en.md
  - verify: pnpm typecheck && pnpm --filter @baquia-dev/specty-core exec vitest run test/schema test/sizing
  - type: feat
