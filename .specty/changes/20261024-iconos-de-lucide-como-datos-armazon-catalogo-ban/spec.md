---
kind: standard
---

# Iconos de Lucide como datos: armazón, catálogo, bandeja y progreso

## Objetivo

Segunda de las tres partes de «Iconos de Lucide como datos». `app/`, `catalog/`, `change/`, `inbox/` y `progress/` toman sus iconos de `components/icons.ts` en lugar de importar las clases de `@lucide/angular`, que cargan una plantilla compilada por icono.

## Fuera de alcance

- `acceptance/` y `review/`: van en la tercera parte.
- Cambiar cómo se ve algún icono.

## Supuestos

- A1: Igual que en `components/`, basta con cambiar de dónde se importan los iconos. Los tipos que los guardan (`LucideIconInput`) ya aceptan los datos.

## Criterios de aceptación

- AC1: CUANDO se construye la UI tras esta parte ENTONCES `app/`, `catalog/`, `change/`, `inbox/` y `progress/` ya no importan clases de iconos de `@lucide/angular`, solo `LucideDynamicIcon` y tipos, y se ven igual.

## Diseño

- Cada archivo divide su importación de `@lucide/angular`: los iconos vienen de `../components/icons`, y `LucideDynamicIcon` y los tipos siguen viniendo de `@lucide/angular`.

## Archivos

- modificar packages/ui/src/app/delegation.ts — iconos desde `icons.ts`
- modificar packages/ui/src/app/shell.ts — iconos desde `icons.ts`
- modificar packages/ui/src/app/preferences-menu.ts — iconos desde `icons.ts`
- modificar packages/ui/src/catalog/catalog.ts — iconos desde `icons.ts`
- modificar packages/ui/src/catalog/components.ts — iconos desde `icons.ts`
- modificar packages/ui/src/catalog/patterns.ts — iconos desde `icons.ts`
- modificar packages/ui/src/catalog/overlays.ts — iconos desde `icons.ts`
- modificar packages/ui/src/change/change-page.ts — iconos desde `icons.ts`
- modificar packages/ui/src/inbox/inbox-toolbar.ts — iconos desde `icons.ts`
- modificar packages/ui/src/inbox/inbox.ts — iconos desde `icons.ts`
- modificar packages/ui/src/progress/progress-tab.ts — iconos desde `icons.ts`
- modificar packages/ui/src/progress/scope-request.ts — iconos desde `icons.ts`
- modificar packages/ui/src/progress/task-row.ts — iconos desde `icons.ts`

## Tareas

- [x] T1: El armazón y el catálogo toman sus iconos de icons.ts
  - files: packages/ui/src/app/delegation.ts, packages/ui/src/app/shell.ts, packages/ui/src/app/preferences-menu.ts, packages/ui/src/catalog/catalog.ts, packages/ui/src/catalog/components.ts, packages/ui/src/catalog/patterns.ts, packages/ui/src/catalog/overlays.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/app --include src/catalog && pnpm sources
  - type: refactor
- [x] T2: La página del cambio, la Bandeja y el progreso toman sus iconos de icons.ts
  - files: packages/ui/src/change/change-page.ts, packages/ui/src/inbox/inbox-toolbar.ts, packages/ui/src/inbox/inbox.ts, packages/ui/src/progress/progress-tab.ts, packages/ui/src/progress/scope-request.ts, packages/ui/src/progress/task-row.ts
  - ac: AC1
  - verify: pnpm check
  - type: refactor
