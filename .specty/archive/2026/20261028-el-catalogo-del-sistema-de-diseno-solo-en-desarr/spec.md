---
kind: quick
---

# El catálogo del sistema de diseño solo en desarrollo

## Objetivo

El catálogo del sistema de diseño es una herramienta para quien desarrolla la UI, pero hoy la ve cualquier persona en la UI que sirve `specty ui`: en la cabecera, en la paleta ⌘K y en `/catalog`. Pasa a existir solo en desarrollo (`ng serve`): un `InjectionToken` `DEV_TOOLS`, que por defecto es `isDevMode()`, decide si la cabecera y la paleta lo ofrecen, y `appRoutes(devTools)` solo añade su ruta en desarrollo. En producción, `/catalog` lleva a la Bandeja.

## Archivos

- modificar packages/ui/src/app/routes.ts — `DEV_TOOLS` y `appRoutes`, con el catálogo solo en desarrollo
- modificar packages/ui/src/app/shell.ts — el enlace y el comando del catálogo solo con `DEV_TOOLS`
- modificar packages/ui/src/main.ts — las rutas según `isDevMode()`
- modificar packages/ui/src/app/shell.test.ts — en producción no hay catálogo
- modificar docs/ui.md — el catálogo, solo en desarrollo

## Tareas

- [x] T1: El catálogo solo en desarrollo
  - files: packages/ui/src/app/routes.ts, packages/ui/src/app/shell.ts, packages/ui/src/main.ts, packages/ui/src/app/shell.test.ts, docs/ui.md
  - verify: pnpm --filter @baquia-dev/specty-ui typecheck && pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/app/shell.test.ts --include src/app/delegation.test.ts

## Cierre

### Resumen

DEV_TOOLS (isDevMode) decide el enlace y el comando del catálogo, y appRoutes solo añade su ruta en desarrollo
