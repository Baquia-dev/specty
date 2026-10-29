---
kind: quick
---

# El historial muestra el consumo de cada cambio

## Objetivo

Desde ahora el cierre anota en la auditoría lo que consumió el cambio (`change.usage`), y `specty audit` lo dice. El historial de la UI, en cambio, lo muestra por su nombre crudo. Pasa a mostrarlo como un evento del cierre: «Consumo del cambio · 21,78 M tokens en 32 llamadas, 120,45 USD». Usa el mismo texto del core, que la UI toma de su entrada ligera.

## Archivos

- modificar packages/core/src/light.ts — exporta `usageOf` y `usageWords`
- modificar packages/ui/src/data/history.ts — el evento `change.usage`
- modificar packages/ui/src/data/history.test.ts — su fila, con coste y sin él
- modificar docs/ui.md — el consumo en la línea de tiempo

## Tareas

- [x] T1: El historial muestra el consumo de cada cambio
  - files: packages/core/src/light.ts, packages/ui/src/data/history.ts, packages/ui/src/data/history.test.ts, docs/ui.md
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/history.test.ts && pnpm --filter @baquia-dev/specty-core exec vitest run test/light.test.ts && pnpm --filter @baquia-dev/specty-ui typecheck && pnpm lint && pnpm knip
