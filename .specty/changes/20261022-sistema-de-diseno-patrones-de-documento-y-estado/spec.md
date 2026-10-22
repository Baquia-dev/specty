---
kind: standard
follows:
  - 20261022-revision-acciones-en-la-cabecera-y-en-la-barra-c
---

# Sistema de diseño: patrones de documento y estado vacío

## Objetivo

Las piezas que hoy dan a la revisión su aire de documento (las filas sin líneas con su resalte, las listas con sangría bajo su sección, el divisor tipográfico con su contador y el ancho de página) y un estado vacío con icono, texto y acción pasan al sistema de diseño, con su página en el catálogo. Así la Bandeja y las pantallas que faltan (progreso, aceptación, cierre) se construyen con ellas y no con copias.

## Fuera de alcance

- Rehacer la Bandeja con estas piezas, el buscador, los filtros y la agrupación: siguiente cambio.
- La cabecera amplia y la barra compacta de la página del cambio: siguen allí hasta que otra página las necesite.
- El divisor numerado de la spec completa ("§ 0N", con su animación), que es propio de la revisión.

## Supuestos

- A1: El ancho de página común es el de la página del cambio (72 rem con 1,5 rem de margen lateral); la Bandeja lo adopta al rehacerse.
- A2: El estado vacío anuncia su contenido como `role="status"`, lleva un icono decorativo, un título, un texto y, si hace falta, una acción proyectada.

## Criterios de aceptación

- AC1: CUANDO una pantalla necesita una lista de documento ENTONCES usa las filas y listas del sistema de diseño (sangría bajo la sección, sin líneas, resalte suave al pasar el puntero o con el foco que revela las acciones del ítem) y un divisor de sección con su título y un contador o progreso; la revisión y el delta las usan y se ven como antes.
- AC2: CUANDO no hay nada que mostrar (por ejemplo, un cambio que no existe) ENTONCES aparece el estado vacío del sistema de diseño: icono, título, texto y la acción para seguir.
- AC3: CUANDO se abre el catálogo ENTONCES una página "Patrones" muestra el divisor de sección, una lista de documento con ítems de ejemplo y el estado vacío, en el tema y el idioma elegidos, y se puede abrir desde la paleta de comandos.

## Archivos

- crear packages/ui/src/components/document.ts — filas, listas, divisor de sección y ancho de página
- crear packages/ui/src/components/document.test.ts — tests del divisor y de las clases de fila y lista
- crear packages/ui/src/components/empty-state.ts — estado vacío
- crear packages/ui/src/components/empty-state.test.ts — tests del estado vacío
- modificar packages/ui/src/review/spec-sections.ts — usa las filas y listas del sistema de diseño
- modificar packages/ui/src/review/assumption-row.ts — usa las filas del sistema de diseño
- modificar packages/ui/src/review/spec-review.ts — usa las listas del sistema de diseño
- modificar packages/ui/src/review/delta-review.ts — filas, listas y divisor de sección del sistema de diseño
- modificar packages/ui/src/change/change-page.ts — ancho de página y estado vacío
- crear packages/ui/src/catalog/patterns.ts — página "Patrones" del catálogo
- modificar packages/ui/src/catalog/catalog.ts — la página en la navegación, las rutas y la paleta
- modificar packages/ui/src/catalog/catalog.test.ts — tests de la página
- modificar docs/ui.md — los patrones del sistema de diseño

## Tareas

- [x] T1: Filas, listas y divisor en el sistema de diseño
  - files: packages/ui/src/components/document.ts, packages/ui/src/components/document.test.ts, packages/ui/src/review/spec-sections.ts, packages/ui/src/review/assumption-row.ts, packages/ui/src/review/spec-review.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-ui test
- [ ] T2: Estado vacío y ancho de página
  - files: packages/ui/src/components/empty-state.ts, packages/ui/src/components/empty-state.test.ts, packages/ui/src/review/delta-review.ts, packages/ui/src/change/change-page.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui test
- [ ] T3: Página "Patrones" del catálogo
  - files: packages/ui/src/catalog/patterns.ts, packages/ui/src/catalog/catalog.ts, packages/ui/src/catalog/catalog.test.ts, docs/ui.md
  - ac: AC3
  - verify: pnpm check
  - notes: Comprobar en el navegador, en claro y en oscuro, la página "Patrones", la revisión y el delta (se ven como antes) y el estado vacío de un cambio que no existe.
