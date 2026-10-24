---
kind: quick
---

# La limpieza respeta la carpeta de otra sesión

## Objetivo

Antes de crear su worktree, `specty new` (y `specty prune`) borra las carpetas de los cambios terminados, salvo la del propio proceso. Pero otra sesión de agente puede seguir dentro de la suya: en modo delegado, la que cierra su cambio desde dentro conserva la carpeta, y hoy un `new` de otra sesión se la borraba debajo. Ahora la limpieza deja la carpeta a la que está atada una sesión según el guard (`common/specty/sessions/`), y lo dice. Una sesión que no ha entrado en ninguna carpeta desde hace un día ya no cuenta, porque ese registro no se borra al terminar la sesión.

## Archivos

- modificar packages/cli/src/store/local.ts — leer todas las sesiones atadas
- modificar packages/cli/src/flow/prune.ts — no borrar la carpeta de una sesión de agente
- modificar packages/cli/test/prune.test.ts — la carpeta queda con una sesión reciente y se va con una de hace más de un día
- modificar docs/ARCHITECTURE.md — §9, la limpieza

## Tareas

- [x] T1: La limpieza no borra la carpeta a la que está atada otra sesión
  - files: packages/cli/src/store/local.ts, packages/cli/src/flow/prune.ts, packages/cli/test/prune.test.ts, docs/ARCHITECTURE.md
  - verify: pnpm check
  - type: fix

## Cierre

### Resumen

removeFinished (new y prune) deja la carpeta de un cambio terminado si una sesión de agente está atada a ella según el guard (readBindings), y prune lo dice; un registro de hace más de un día no cuenta. ARCHITECTURE §9.
