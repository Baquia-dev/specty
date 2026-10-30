---
kind: quick
---

# Color indicador en el tooltip fijado con linea vertical y viñeta

## Objetivo

Asegurar que el tooltip fijado muestre claramente el color mate identificador asociado al elemento origen, reflejándolo mediante una línea vertical en su lateral izquierdo y en el punto (viñeta) previo al título, garantizando que el color asignado no sea anulado por estilos de texto o utilidades de contraste.

## Archivos

- modificar packages/ui/src/styles.css — reglas de borde izquierdo destacado y color de viñeta para tooltips fijados
- modificar packages/ui/src/components/item-tooltip.ts — eliminación de utilidades de color que sobrescriban la viñeta y asignación directa del color indicador
- modificar packages/ui/src/components/item-tooltip.test.ts — pruebas unitarias que verifiquen el color indicador en la viñeta y en la línea vertical del tooltip fijado

## Tareas

- [ ] T1: Color indicador en el tooltip fijado mediante línea vertical izquierda y viñeta
  - files: packages/ui/src/styles.css, packages/ui/src/components/item-tooltip.ts, packages/ui/src/components/item-tooltip.test.ts
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/components/item-tooltip.test.ts
