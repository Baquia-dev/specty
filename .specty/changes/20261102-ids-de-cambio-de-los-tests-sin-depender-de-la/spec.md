---
kind: quick
---

# Ids de cambio de los tests sin depender de la zona horaria

## Objetivo

Los tests de la CLI construyen el id del cambio y la carpeta del archivo con la fecha UTC de `NOW`, mientras que `makeChangeId` y `close` usan la fecha local. Desde que `NOW` es la hora real, cuando la fecha local no coincide con la de UTC (en Colombia, de 19:00 a 24:00) fallan casi todos los tests. Los tests pasan a calcular esas fechas igual que el código: el id con `makeChangeId(NOW, …)` y el año del archivo con la fecha local de `NOW`.

## Archivos

- modificar packages/cli/test/support.ts — `CHANGE` con `makeChangeId(NOW, "Saludo personalizado")` y `ARCHIVE` con el año local de `NOW`
- modificar packages/cli/test/sizing.test.ts — el id del cambio con `makeChangeId(NOW, "Arreglar utilidades")`

## Tareas

- [x] T1: Calcular los ids y el año del archivo como el código
  - files: packages/cli/test/support.ts, packages/cli/test/sizing.test.ts
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/sizing.test.ts test/anywhere.test.ts test/flow.test.ts test/commands.test.ts
