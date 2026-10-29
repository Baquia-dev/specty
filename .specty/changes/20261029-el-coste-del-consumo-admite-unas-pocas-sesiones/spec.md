---
kind: quick
---

# El coste del consumo admite unas pocas sesiones que ccusage calcula de otra forma

## Objetivo

El primer cierre medido de verdad dio tokens y llamadas, pero no coste. De las 36 sesiones de Opus en el informe de ccusage, 34 cuadran al céntimo con los precios de Opus. Las otras dos se desvían 3,85 y 1,03 USD, porque ccusage las calcula de otra forma: por un coste escrito en el log o por otro tipo de escritura de caché. Esas dos tuercen el ajuste entero, y `modelPrices` descarta el modelo.

Ahora el ajuste deja fuera, una a una, las sesiones que peor cuadran, hasta un 10 % de las del modelo, y se queda con los precios si el resto cuadra al céntimo. Con menos de 10 sesiones no deja fuera ninguna, como hasta ahora.

## Archivos

- modificar packages/core/src/usage.ts — el ajuste deja fuera hasta un 10 % de sesiones que no cuadran
- modificar packages/core/test/usage.test.ts — 36 sesiones con 2 que no cuadran dan los precios; con 3 de 20, no
- modificar docs/ARCHITECTURE.md — §13, el ajuste

## Tareas

- [x] T1: El ajuste de precios deja fuera unas pocas sesiones que no cuadran
  - files: packages/core/src/usage.ts, packages/core/test/usage.test.ts, docs/ARCHITECTURE.md
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/usage.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint
