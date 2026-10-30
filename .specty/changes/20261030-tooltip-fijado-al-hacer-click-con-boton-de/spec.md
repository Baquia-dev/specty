---
kind: standard
---

# Tooltip fijado al hacer click con botón de cierre

## Objetivo

Permitir que la persona fije el tooltip contextual de una sigla (`A`, `AC`, `T`, `R`, `S`, `C`) al hacer click sobre ella, manteniéndolo visible sin cerrarse al mover el puntero fuera y mostrando un botón "x" en la esquina superior derecha para cerrarlo y desfijarlo cómodamente.

## Fuera de alcance

- Fijar múltiples tooltips simultáneamente (al fijar uno nuevo se cierra el anterior).
- Modificar la apariencia del tooltip cuando solo se abre mediante hover o foco.

## Supuestos

- A1: El botón de cierre "x" solo se muestra cuando el tooltip está en estado fijado por click, preservando el comportamiento ligero en hover.
- A2: El tooltip fijado puede cerrarse tanto haciendo click en el botón "x", presionando la tecla Escape, o haciendo click en otra sigla para fijarla.

## Criterios de aceptación

- AC1: CUANDO la persona hace click sobre un elemento de sigla detonador ENTONCES el tooltip se fija en pantalla, no se cierra al mover el puntero fuera, y muestra un botón de cierre con icono "x" en la esquina superior derecha.
- AC2: CUANDO el tooltip está fijado y la persona hace click en el botón de cierre "x" (o presiona Escape) ENTONCES el tooltip se oculta y se desfija.
- AC3: CUANDO el tooltip se abre únicamente por hover o foco (sin click) ENTONCES no muestra el botón de cierre "x" y se oculta de forma habitual al retirar el puntero.

## Diseño

- En `packages/ui/src/components/item-tooltip.ts`:
  - Se añade escucha del evento `(click)` en el host de la directiva `ItemTooltips`.
  - Cuando se hace click en una sigla resuelta, el estado pasa a fijado (`pinned = true`). Si ya estaba fijado en esa misma sigla, se desfija y oculta.
  - Al fijarse, la burbuja incluye en su cabecera un botón de cierre en la esquina superior derecha (`[data-item-close]`, con `aria-label` en el idioma activo).
  - En `onLeave`, si el tooltip está fijado (`pinned === true`), no se programa el cierre por temporizador ni se oculta al mover el puntero.
  - El botón "x" tiene un handler que ejecuta `hide()` y restablece `pinned = false`.
  - La tecla Escape o la apertura/fijación de otro tooltip también limpian el estado fijado.

## Archivos

- modificar packages/ui/src/components/item-tooltip.ts — soporte de estado fijado al hacer click y botón de cierre en la esquina superior derecha
- modificar packages/ui/src/components/item-tooltip.test.ts — pruebas del comportamiento de fijación por click, presencia y funcionamiento del botón de cierre y escape

## Tareas

- [x] T1: Fijación del tooltip por click y botón de cierre en esquina superior derecha
  - files: packages/ui/src/components/item-tooltip.ts, packages/ui/src/components/item-tooltip.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/components/item-tooltip.test.ts
