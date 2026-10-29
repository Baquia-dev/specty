---
kind: standard
---

# Pestañas y títulos de sección fijos al desplazarse en la UI

## Objetivo

Al desplazarse por la UI, la barra de pestañas de un cambio se queda fija bajo la barra compacta (`--sp-bar-top`) para no perder de vista las secciones del cambio, y los títulos de cada sección (`sp-section-divider` y los encabezados de `sp-spec-review`) se fijan bajo las barras superiores (`--sp-sticky-top`) mientras avanza el recorrido de su sección. Cuando el desplazamiento oculta el bloque superior de resumen o filtros de las pestañas Progreso, Aceptación e Historial, esos indicadores y selectores aparecen a la derecha de la barra fija de pestañas.

## Fuera de alcance

- Cambiar el contenido o las acciones de la barra compacta superior del cambio (`sp-change-bar`).
- Mover a la barra de pestañas el botón «Exportar» o el selector de vista («Línea de tiempo | Trazabilidad») de la pestaña Historial.
- Mostrar los indicadores o selectores a la derecha de la barra de pestañas mientras su bloque original sigue visible arriba de la pestaña.

## Supuestos

- A1: La página del cambio mide tanto la barra compacta (`--sp-bar-top`) como la suma de la barra compacta y la barra de pestañas (`--sp-sticky-top`), de modo que la barra de pestañas se fija en `--sp-bar-top` y todo lo que se fija debajo de ella (índice y comentarios de la spec, encabezados de sección y franja del visor de diffs) empieza en `--sp-sticky-top`.
- A2: En Progreso, Aceptación e Historial, un `IntersectionObserver` vigila el bloque superior de la pestaña (`[data-top]`) y proyecta su versión compacta en la zona derecha de la barra de pestañas (`[data-tabs-end]`) únicamente cuando dicho bloque sale de la vista en la pestaña activa.
- A3: Los divisores `sp-section-divider` (en Bandeja, Progreso, Aceptación, Historial y revisión del delta) y el encabezado de cada sección en `sp-spec-review` (`[data-section-header]`) usan `position: sticky` en `top: var(--sp-sticky-top, 0px)` sobre el fondo de la página (`bg-bg`), quedando por debajo de las barras superiores y por encima del contenido de su sección.

## Criterios de aceptación

- AC1: CUANDO la persona se desplaza por la página de un cambio ENTONCES la lista de pestañas (`[data-tabs-bar]`) permanece fija bajo la barra compacta (`top-[var(--sp-bar-top,0px)]`), y `--sp-sticky-top` suma la altura de la barra compacta y de la barra de pestañas.
- AC2: CUANDO avanza el desplazamiento por una sección en la revisión de la spec, el delta, Progreso, Aceptación, Historial o la Bandeja ENTONCES el encabezado de la sección (`sp-section-divider` y `[data-section-header]` en `sp-spec-review`) permanece fijo en `top-[var(--sp-sticky-top,0px)]` hasta que termina su sección.
- AC3: CUANDO el desplazamiento oculta el resumen superior de la pestaña Progreso ENTONCES a la derecha de la barra de pestañas (`[data-tabs-end]`) aparecen el texto de tareas hechas con su resumen y la barra de segmentos en versión compacta, y desaparecen al volver arriba.
- AC4: CUANDO el desplazamiento oculta el resumen superior de la pestaña Aceptación ENTONCES a la derecha de la barra de pestañas (`[data-tabs-end]`) aparecen el resumen de criterios verificados y el selector «Vista», que cambia y recuerda la vista igual que el selector superior.
- AC5: CUANDO el desplazamiento oculta la barra superior de la línea de tiempo en la pestaña Historial ENTONCES a la derecha de la barra de pestañas (`[data-tabs-end]`) aparecen el selector «Quién», el selector «Tipo» y la cantidad de eventos, que filtran la lista igual que los controles superiores.

## Diseño

- `components/tabs.ts`: la barra que envuelve `[role=tablist]` pasa a ser fija (`[data-tabs-bar]`, `sticky top-[var(--sp-bar-top,0px)] z-15 bg-bg`) e incluye a la derecha un contenedor `[data-tabs-end]` donde se dibuja la plantilla activa registrada con la directiva `TabEnd` (`ng-template[spTabEnd]`). `TabEnd` observa con `IntersectionObserver` el elemento `[spTabEnd]="top"` y publica su `TemplateRef` en el `TabPanel` solo mientras ese elemento está fuera de la vista.
- `components/document.ts`: `SectionDivider` (`sp-section-divider`) es `sticky top-[var(--sp-sticky-top,0px)] z-5 -my-2 bg-bg py-2`, para fijarse bajo la barra superior de cada pantalla sin añadir hueco en reposo ni dejar ver las filas que pasan por debajo.
- `change/change-page.ts`: el `ResizeObserver` mide `sp-change-bar` (`--sp-bar-top`) y la barra `[data-tabs-bar]` de `sp-tabs`, asignando la suma a `--sp-sticky-top`.
- `review/spec-review.ts`: el divisor numerado, el título `h2` y la pista de cada sección se agrupan en un `<header data-section-header>` fijo en `top-[var(--sp-sticky-top,0px)] z-5` con el fondo de la página (y el fondo de destello cuando la sección tiene `data-flash`).
- `progress/progress-tab.ts`, `acceptance/acceptance-tab.ts` y `history/history-tab.ts`: marcan su bloque superior con `#top` (`data-top`) y declaran `<ng-template [spTabEnd]="top">` con los elementos compactos que van a la derecha de las pestañas al ocultarse por el desplazamiento.

## Archivos

- modificar packages/ui/src/components/tabs.ts — barra de pestañas fija, ranura derecha `[data-tabs-end]` y directiva `spTabEnd`
- modificar packages/ui/src/components/tabs.test.ts — pruebas de la barra fija de pestañas y de `spTabEnd` al ocultarse el elemento observado
- modificar packages/ui/src/components/document.ts — hacer fijo `sp-section-divider` en `top-[var(--sp-sticky-top,0px)]` sobre el fondo de la página
- modificar packages/ui/src/components/document.test.ts — comprobar que `sp-section-divider` se fija en `--sp-sticky-top`
- modificar packages/ui/src/change/change-page.ts — medir `--sp-bar-top` y `--sp-sticky-top` sumando la barra compacta y la barra de pestañas
- modificar packages/ui/src/change/change-page.test.ts — comprobar las alturas medidas y la barra fija de pestañas
- modificar packages/ui/src/review/spec-review.ts — hacer fijo el encabezado `[data-section-header]` de cada sección de la spec
- modificar packages/ui/src/review/spec-review.test.ts — comprobar que el encabezado de cada sección de la spec es fijo en `--sp-sticky-top`
- modificar packages/ui/src/progress/progress-tab.ts — proyectar el resumen y la barra de segmentos en `[spTabEnd]` cuando el bloque superior sale de la vista
- modificar packages/ui/src/progress/progress-tab.test.ts — comprobar que el resumen y la barra de segmentos pasan a la barra de pestañas al desplazarse
- modificar packages/ui/src/acceptance/acceptance-tab.ts — proyectar el resumen de criterios verificados y el selector «Vista» en `[spTabEnd]` al desplazarse
- modificar packages/ui/src/acceptance/acceptance-tab.test.ts — comprobar el resumen y el selector «Vista» en la barra de pestañas al desplazarse
- modificar packages/ui/src/history/history-tab.ts — proyectar «Quién», «Tipo» y el conteo de eventos en `[spTabEnd]` al desplazarse en la línea de tiempo
- modificar packages/ui/src/history/history-tab.test.ts — comprobar los filtros y el conteo en la barra de pestañas al desplazarse
- modificar docs/ui.md — documentar la barra de pestañas fija, los controles a su derecha al desplazarse y los títulos de sección fijos

## Tareas

- [x] T1: Barra de pestañas fija con ranura derecha y divisores de sección fijos
  - files: packages/ui/src/components/tabs.ts, packages/ui/src/components/tabs.test.ts, packages/ui/src/components/document.ts, packages/ui/src/components/document.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/components/tabs.test.ts --include src/components/document.test.ts && pnpm lint
- [x] T2: Medición de barras en la página del cambio y encabezados fijos en la revisión de la spec
  - files: packages/ui/src/change/change-page.ts, packages/ui/src/change/change-page.test.ts, packages/ui/src/review/spec-review.ts, packages/ui/src/review/spec-review.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/change/change-page.test.ts --include src/review/spec-review.test.ts && pnpm lint
- [x] T3: Resumen y controles a la derecha de las pestañas en Progreso y Aceptación
  - files: packages/ui/src/progress/progress-tab.ts, packages/ui/src/progress/progress-tab.test.ts, packages/ui/src/acceptance/acceptance-tab.ts, packages/ui/src/acceptance/acceptance-tab.test.ts
  - ac: AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/progress/progress-tab.test.ts --include src/acceptance/acceptance-tab.test.ts && pnpm lint
- [ ] T4: Filtros y conteo de eventos a la derecha de las pestañas en Historial y documentación
  - files: packages/ui/src/history/history-tab.ts, packages/ui/src/history/history-tab.test.ts, docs/ui.md
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/history/history-tab.test.ts && pnpm lint
