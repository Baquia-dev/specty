---
kind: quick
---

# Cancelar no sugiere fusionar la rama

## Objetivo

`specty cancel` termina hoy con «SIGUIENTE: fusiona la rama … (o abre un PR)», aunque la rama tenga commits de tareas: fusionarla llevaría código a medias a la rama principal. Al cancelar, la salida dice qué guarda la rama (la spec y su registro, y además el código de las tareas hechas si las hay) y que no se incorpora, y el siguiente paso es solo empezar otro cambio con `specty new`.

## Archivos

- modificar packages/core/src/cards/human.ts — tarjeta del cambio cancelado
- modificar packages/cli/src/commands/finish.ts — `cancel` usa esa tarjeta
- modificar packages/cli/test/commands.test.ts — cancelar con y sin tareas hechas

## Tareas

- [x] T1: La salida de `cancel` no sugiere fusionar la rama
  - files: packages/core/src/cards/human.ts, packages/cli/src/commands/finish.ts, packages/cli/test/commands.test.ts
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/commands.test.ts test/flow.test.ts test/delegate.test.ts
  - type: fix

## Cierre

### Resumen

cancel usa la nueva cancelledCard: dice que la rama guarda la spec y su registro (y el código de las tareas hechas, si las hay) y que no se incorpora, y su SIGUIENTE solo propone specty new
