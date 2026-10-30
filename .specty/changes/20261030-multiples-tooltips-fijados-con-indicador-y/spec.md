---
kind: standard
---

# Múltiples tooltips fijados con indicador y anticolisión

## Objetivo

Permitir que la persona mantenga abiertos múltiples tooltips simultáneamente al hacer click sobre distintas siglas detonadoras (`A`, `AC`, `T`, `R`, `S`, `C`), mostrando un indicador visual distintivo en cada elemento detonador dueño de un tooltip fijado y ajustando automáticamente su ubicación o desplazamiento para evitar el solapamiento entre ellos.

## Fuera de alcance

- Arrastre manual (drag and drop) de tooltips en pantalla.
- Persistencia del estado fijado tras recargar la página.

## Supuestos

- A1: El indicador en el elemento detonador (`[data-item-pinned]`) se retira de inmediato cuando su respectivo tooltip fijado se cierra (mediante su botón "✕", click en el elemento o tecla Escape).
- A2: La tecla Escape cierra todos los tooltips actualmente fijados o activos.
- A3: Cuando dos o más tooltips fijados se solaparían en su posición preferida por proximidad de sus detonadores, se evalúan posiciones alternativas del posicionamiento conectado y/o se aplica un desplazamiento escalonado para que ambos permanezcan legibles.

## Criterios de aceptación

- AC1: CUANDO la persona hace click sobre un elemento de sigla detonador ENTONCES el tooltip se fija y el elemento detonador recibe el atributo indicador `data-item-pinned` con estilo visual destacado mientras el tooltip permanezca abierto.
- AC2: CUANDO hay uno o más tooltips fijados y la persona hace click sobre otro elemento de sigla detonador diferente ENTONCES el nuevo tooltip se abre y se fija a la vez sin cerrar los tooltips previamente fijados, manteniendo cada uno su botón de cierre "x" y su propio indicador en el detonador.
- AC3: CUANDO se fija un tooltip cuya posición calculada colisiona o se solapa con otro tooltip fijado ya abierto ENTONCES se ajusta su ubicación o desplazamiento para evitar que queden completamente solapados y garantizar la visibilidad de su contenido.
- AC4: CUANDO la persona hace click en el botón de cierre "x" de un tooltip fijado específico (o vuelve a hacer click en su elemento detonador) ENTONCES únicamente se cierra y desfija ese tooltip y se retira el atributo indicador de su elemento detonador, permaneciendo abiertos los demás tooltips fijados.

## Diseño

- En `packages/ui/src/styles.css`:
  - Se define regla para `[data-item-pinned]` con estilo visual distintivo (fondo invertido de alto contraste, borde/outline destacado y cursor interactivo).
- En `packages/ui/src/components/item-tooltip.ts`:
  - En lugar de un único `overlay` y `bubble`, `ItemTooltips` mantiene una colección de tooltips fijados activos (`pinnedTooltips = new Map<HTMLElement, PinnedEntry>()`).
  - Un tooltip de hover transitorio coexiste sin alterar los tooltips fijados.
  - Al hacer click en un elemento detonador resuelto:
    - Si ya está fijado en esa sigla/origen, se cierra y remueve solo esa entrada.
    - Si no está fijado, se crea su propio overlay y burbuja, marcando su origen con `data-item-pinned`.
  - Detección de solapamiento:
    - Se comparan las posiciones y rectángulos de los tooltips fijados existentes (`rectsOverlap`).
    - Si una posición estándar colisiona con un tooltip fijado existente, se priorizan posiciones no solapadas o se aplica un offset escalonado (desplazamiento vertical/horizontal) para evitar la superposición completa.
  - Cierre individual e interactivo:
    - El botón "✕" de cada burbuja invoca `unpin(origin)`.
    - `(document:keydown.escape)` desfija y cierra todos los tooltips activos.

## Archivos

- modificar packages/ui/src/styles.css — estilo e indicador visual para elementos detonadores con tooltip fijado (`[data-item-pinned]`)
- modificar packages/ui/src/components/item-tooltip.ts — soporte de múltiples tooltips fijados, gestión de overlays individuales, indicador en detonador y anticolisión por solapamiento
- modificar packages/ui/src/components/item-tooltip.test.ts — pruebas unitarias de indicador de detonador, fijación concurrente de múltiples tooltips, anticolisión y cierre selectivo

## Tareas

- [ ] T1: Indicador en elemento detonador, múltiples tooltips fijados simultáneos y anticolisión ante solapamiento
  - files: packages/ui/src/styles.css, packages/ui/src/components/item-tooltip.ts, packages/ui/src/components/item-tooltip.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/components/item-tooltip.test.ts
