---
kind: standard
---

# Pulido: bordes que se desvanecen y desplazamientos medidos

## Objetivo

Tres detalles pendientes de la UI. Las filas que se desplazan de lado (las fases de la Bandeja, el menú del catálogo en el teléfono y los filtros del delta) se desvanecen en el borde donde queda más contenido, para que se note que hay más. El menú del catálogo en el teléfono deja a la vista la página activa. Y la Bandeja mide su barra fija para no dejar una fila bajo ella al moverse con j/k, en lugar de suponer una altura fija.

## Fuera de alcance

- El peso de los iconos de Lucide: va en su propio cambio.
- Otras filas desplazables: la matriz de trazabilidad y los diffs ya se desplazan dentro de su caja.

## Supuestos

- A1: Basta con marcar los bordes al desplazar, al cambiar el tamaño y al cambiar el contenido. Un `ResizeObserver` y un `MutationObserver` sobre la fila lo cubren sin vigilar nada más.

## Criterios de aceptación

- AC1: CUANDO una fila desplazable tiene contenido oculto a un lado ENTONCES ese borde se desvanece, y deja de hacerlo al llegar al extremo. Sin contenido oculto, ningún borde se desvanece.
- AC2: CUANDO la persona abre una página del catálogo en el teléfono ENTONCES el menú se desplaza para dejar a la vista su enlace activo.
- AC3: CUANDO la persona se mueve con j/k en la Bandeja ENTONCES la fila elegida queda por debajo de la barra fija medida, no de una altura supuesta.
- AC4: CUANDO alguien lee el documento de la UI ENTONCES encuentra los bordes que se desvanecen.

## Diseño

- `components/edge-fade.ts`: la directiva `spEdgeFade` marca `data-fade-start` y `data-fade-end` según lo que queda oculto, y `styles.css` desvanece esos bordes con `mask-image` sobre el token `--fade-edge`.
- `Catalog` desplaza su menú hasta el enlace activo después de cada navegación, solo si el menú se desplaza de lado.
- `Inbox` mide su barra con un `ResizeObserver` y la publica como `--sp-sticky-top`, como la página del cambio; `InboxRow` la usa en su `scroll-margin-top`.

## Archivos

- crear packages/ui/src/components/edge-fade.ts — los bordes que se desvanecen
- crear packages/ui/src/components/edge-fade.test.ts — tests de la directiva
- modificar packages/ui/src/styles.css — el desvanecido y su token
- modificar packages/ui/src/inbox/inbox-toolbar.ts — las fases se desvanecen
- modificar packages/ui/src/review/delta-review.ts — los filtros se desvanecen
- modificar packages/ui/src/catalog/catalog.ts — el menú se desvanece y deja a la vista la página activa
- modificar packages/ui/src/catalog/catalog.test.ts — test del menú
- modificar packages/ui/src/inbox/inbox.ts — mide la barra fija
- modificar packages/ui/src/inbox/inbox-row.ts — el margen de desplazamiento medido
- modificar packages/ui/src/inbox/inbox.test.ts — test de la barra medida
- modificar docs/ui.md — los bordes que se desvanecen

## Tareas

- [ ] T1: Los bordes que se desvanecen
  - files: packages/ui/src/components/edge-fade.ts, packages/ui/src/components/edge-fade.test.ts, packages/ui/src/styles.css, packages/ui/src/inbox/inbox-toolbar.ts, packages/ui/src/review/delta-review.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/components --include src/inbox --include src/review && pnpm sources
- [ ] T2: El menú del catálogo y la barra de la Bandeja
  - files: packages/ui/src/catalog/catalog.ts, packages/ui/src/catalog/catalog.test.ts, packages/ui/src/inbox/inbox.ts, packages/ui/src/inbox/inbox-row.ts, packages/ui/src/inbox/inbox.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/catalog --include src/inbox && pnpm sources
- [ ] T3: Documentar los bordes que se desvanecen
  - files: docs/ui.md
  - ac: AC4
  - verify: pnpm check
  - type: docs
