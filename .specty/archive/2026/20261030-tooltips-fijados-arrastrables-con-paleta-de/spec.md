---
kind: quick
---

# Tooltips fijados arrastrables con paleta de color e inversión de contraste

## Objetivo

Permitir arrastrar libremente por la pantalla los tooltips fijados para organizar el espacio visual, asignarles un color mate no repetitivo compartido entre el elemento detonador y la burbuja del tooltip para asociarlos con facilidad, e invertir el contraste del tooltip adaptando su fondo y texto según el tema claro u oscuro de la aplicación.

## Archivos

- modificar packages/ui/src/styles.css — tokens de color de tooltip invertidos por tema, cursor de arrastre y estilos de indicadores de color
- modificar packages/ui/src/components/item-tooltip.ts — soporte de arrastre por puntero en tooltips fijados, gestión de paleta de colores mate sin repetición por tooltip abierto, e integración de contraste invertido
- modificar packages/ui/src/components/item-tooltip.test.ts — pruebas unitarias de arrastre, asignación y liberación de colores mate, asociación visual y contraste invertido

## Tareas

- [x] T1: Tooltips fijados arrastrables, asociación visual mediante paleta de color mate no repetitiva y contraste invertido por tema
  - files: packages/ui/src/styles.css, packages/ui/src/components/item-tooltip.ts, packages/ui/src/components/item-tooltip.test.ts
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/components/item-tooltip.test.ts

## Cierre

### Resumen

Tooltips fijados arrastrables con puntero, asociación visual con paleta mate no repetitiva e inversión de contraste de fondo y texto según tema
