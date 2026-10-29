---
kind: quick
---

# Los precios del consumo salen de las sesiones del mismo proyecto

## Objetivo

Tras ejecutar las evals, el cierre volvió a dar el consumo sin coste. Las sesiones sin interfaz de las evals escriben la caché con otro precio, que el informe de ccusage no distingue, así que ninguna cuadra con los precios de Opus. Con las de hoy pasan del 10 % de las sesiones que admite el ajuste.

Las 15 sesiones de este proyecto, en cambio, cuadran todas. Specty deduce ahora los precios de las sesiones del mismo proyecto que las del cambio (`projectPath` en el informe de ccusage), y solo usa todas para un modelo que ese proyecto no tiene en cuatro sesiones.

## Archivos

- modificar packages/cli/src/flow/usage.ts — los precios, primero de las sesiones del proyecto del cambio
- crear packages/cli/test/usage-projects.test.ts — con sesiones de otro proyecto que no cuadran, el coste sale de las del proyecto; sin bastantes, de todas
- modificar docs/ARCHITECTURE.md — §13, de qué sesiones salen los precios

## Tareas

- [x] T1: Los precios salen de las sesiones del proyecto del cambio
  - files: packages/cli/src/flow/usage.ts, packages/cli/test/usage-projects.test.ts, docs/ARCHITECTURE.md
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/usage-projects.test.ts test/usage.test.ts && pnpm --filter @baquia-dev/specty typecheck && pnpm lint
