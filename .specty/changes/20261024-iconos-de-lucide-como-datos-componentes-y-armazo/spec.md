---
kind: standard
---

# Iconos de Lucide como datos: los componentes

## Objetivo

Los iconos dejan de cargar una plantilla compilada cada uno. Hoy cada icono de `@lucide/angular` es un componente con su propia copia de la misma plantilla SVG, unos 3 KB por icono: con 52 iconos, unos 165 KB de JavaScript al arrancar, un tercio de lo inicial. Con los dibujos de `lucide` como datos y un solo `LucideDynamicIcon`, esa carga desaparece. Es la primera de tres partes: trae los datos y migra `components/`.

## Fuera de alcance

- Migrar `app/`, `catalog/`, `change/`, `inbox/`, `progress/`, `acceptance/` y `review/`: van en las dos partes siguientes. Mientras tanto, ambos tipos de icono conviven.
- Cambiar cómo se ve algún icono.

## Supuestos

- A1: `lucide@1.55.0`, de la misma versión que `@lucide/angular`, dibuja los mismos iconos con los mismos datos, y su `sideEffects: false` deja en el bundle solo los iconos importados.
  - impacto: alto
- A2: `LucideDynamicIcon` acepta los datos (`{ name, node }`) igual que las clases, así que cada componente solo cambia de dónde importa sus iconos.

## Criterios de aceptación

- AC1: CUANDO un componente necesita un icono ENTONCES lo toma de `components/icons.ts`: los datos de `lucide`, con los mismos nombres que tenían en `@lucide/angular`, para todos los iconos que usa la UI.
- AC2: CUANDO se construye la UI tras esta parte ENTONCES `components/` ya no importa clases de iconos de `@lucide/angular`, solo `LucideDynamicIcon`, y se ven igual.
- AC3: CUANDO alguien lee el documento de la UI ENTONCES sabe de dónde salen los iconos y por qué.

## Diseño

- `packages/ui/package.json` añade `lucide` 1.55.0.
- `components/icons.ts` exporta cada icono como `LucideIconData` (`{ name, node }`), con el nombre en kebab-case de Lucide y el dibujo de `lucide`. Los nombres de exportación son los de siempre (`LucideTriangleAlert`…), y los renombrados toman su dibujo nuevo (`FileQuestionMark`, `Trash`).
- En `components/` solo cambian las importaciones: los iconos vienen de `icons.ts`, y `LucideDynamicIcon` sigue viniendo de `@lucide/angular`.

## Archivos

- modificar packages/ui/package.json — la dependencia `lucide`
- modificar pnpm-lock.yaml — la dependencia nueva
- crear packages/ui/src/components/icons.ts — los iconos de la UI como datos
- crear packages/ui/src/components/icons.test.ts — tests de los iconos
- modificar packages/ui/src/components/badge.ts — iconos desde `icons.ts`
- modificar packages/ui/src/components/collapsible.ts — iconos desde `icons.ts`
- modificar packages/ui/src/components/dialog.ts — iconos desde `icons.ts`
- modificar packages/ui/src/components/diff-file.ts — iconos desde `icons.ts`
- modificar packages/ui/src/components/field.ts — iconos desde `icons.ts`
- modificar packages/ui/src/components/select.ts — iconos desde `icons.ts`
- modificar packages/ui/src/components/toast.ts — iconos desde `icons.ts`
- modificar packages/ui/src/components/button.test.ts — iconos desde `icons.ts`
- modificar packages/ui/src/components/empty-state.test.ts — iconos desde `icons.ts`
- modificar docs/ui.md — de dónde salen los iconos

## Tareas

- [x] T1: Los iconos de la UI como datos
  - files: packages/ui/package.json, pnpm-lock.yaml, packages/ui/src/components/icons.ts, packages/ui/src/components/icons.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/components/icons.test.ts && pnpm sources
- [x] T2: Los componentes toman sus iconos de icons.ts
  - files: packages/ui/src/components/badge.ts, packages/ui/src/components/collapsible.ts, packages/ui/src/components/dialog.ts, packages/ui/src/components/diff-file.ts, packages/ui/src/components/field.ts, packages/ui/src/components/select.ts, packages/ui/src/components/toast.ts, packages/ui/src/components/button.test.ts, packages/ui/src/components/empty-state.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/components && pnpm sources
  - type: refactor
- [ ] T3: Documentar de dónde salen los iconos
  - files: docs/ui.md
  - ac: AC3
  - verify: pnpm check
  - type: docs
