---
kind: quick
---

# Comprobación rápida en cada task done

## Objetivo

Una clave nueva, `verify.quick`, nombra una comprobación rápida de todo el repositorio que `task done` ejecuta antes de la verificación de cada tarea, como un solo comando (`<quick> && <verify>`) que también muestra la tarjeta de la tarea. En este repositorio es `pnpm sources`, para que una tarea que pasa un archivo de 300 líneas o lo crea sin cabecera SPDX no lo descubra otra tarea, o `pnpm check` al aceptar. Sin la clave, nada cambia.

## Archivos

- modificar packages/core/src/schema/config.ts — la clave `verify.quick`
- modificar packages/core/test/schema/schema.test.ts — el ejemplo de formats.md con `verify.quick`
- modificar packages/cli/src/flow/views.ts — la verificación de una tarea empieza por `verify.quick`
- modificar packages/cli/src/commands/task.ts — `task done` ejecuta esa misma verificación
- modificar packages/cli/test/flow.test.ts — la comprobación rápida en la tarjeta, y su fallo
- modificar .specty/config.yaml — `verify.quick: pnpm sources` en este repositorio
- modificar docs/formats.md — §6: la clave `verify.quick`
- modificar docs/ARCHITECTURE.md — la tabla de comandos: qué ejecuta `task done`

## Tareas

- [x] T1: Comprobación rápida en cada task done
  - files: packages/core/src/schema/config.ts, packages/core/test/schema/schema.test.ts, packages/cli/src/flow/views.ts, packages/cli/src/commands/task.ts, packages/cli/test/flow.test.ts, .specty/config.yaml, docs/formats.md, docs/ARCHITECTURE.md
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/schema && pnpm --filter @baquia-dev/specty exec vitest run test/flow.test.ts
  - type: feat
