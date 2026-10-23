---
kind: quick
---

# La documentación no cuenta como módulo

## Objetivo

El tamaño de un cambio cuenta como módulos solo las rutas gobernadas: la documentación y las demás rutas de `ignored` dejan de sumar un módulo. Hoy `docs/` cuenta como uno, así que un cambio de core y CLI que actualiza ARCHITECTURE pasa del máximo de 2 módulos y debe dejar la documentación para otro cambio, aunque las reglas del repo piden actualizarla junto al código.

## Archivos

- modificar packages/core/src/sizing/size.ts — `collectSignals` cuenta como módulos solo las rutas gobernadas (`isGoverned`)
- modificar packages/core/test/sizing/sizing.test.ts — una ruta de `docs/` o un `.md` no suma módulo, y una ruta gobernada sí
- modificar docs/ARCHITECTURE.md — §11: los módulos son de código gobernado

## Tareas

- [ ] T1: Contar como módulos solo las rutas gobernadas
  - files: packages/core/src/sizing/size.ts, packages/core/test/sizing/sizing.test.ts, docs/ARCHITECTURE.md
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/sizing/sizing.test.ts
