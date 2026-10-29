---
kind: standard
---

# Tooltip con contexto en siglas de ítems de la UI

## Objetivo

Cuando cualquier componente de la UI muestra o menciona una sigla de ítem o solicitud (`A1`, `AC1`, `T4`, `R1`, `S1`, `C1`), pasar el puntero o llevar el foco sobre ella despliega un tooltip con el nombre completo de la sigla, su identificador y su contenido o título en el idioma activo, dando contexto inmediato sin tener que cambiar de pestaña ni buscar en la spec.

## Fuera de alcance

- Cambiar el formato de `spec.md`, `state.json` o `audit.jsonl`.
- Convertir las siglas en enlaces de navegación entre pestañas.
- Alterar los identificadores dentro de bloques de código o diffs de archivos fuente.

## Supuestos

- A1: Las siglas de Specty que aparecen en la UI corresponden a los prefijos `A` (Supuesto / Assumption), `AC` (Criterio de aceptación / Acceptance criterion), `T` (Tarea / Task), `R` (Riesgo / Risk), `S` (Solicitud de alcance / Scope request) y `C` (Corte / Slice).
- A2: Cuando una sigla tiene texto o título disponible en el cambio activo (o en el delta de revisión o historial), el tooltip sigue el formato `<Tipo> <ID>: <contenido>`; cuando solo se conoce la sigla, muestra `<Tipo> <ID>`.

## Criterios de aceptación

- AC1: CUANDO la persona pasa el puntero o lleva el foco sobre una sigla de ítem o solicitud (`A`, `AC`, `T`, `R`, `S`, `C`) en las vistas de revisión, progreso, aceptación, historial, trazabilidad o bandeja ENTONCES se muestra un tooltip flotante con el tipo de la sigla, su identificador y su contenido o título en el idioma activo.
- AC2: CUANDO un texto de comentario, estado de test bloqueado, solicitud de alcance o evento del historial incluye una o más siglas en una frase ENTONCES cada sigla conserva el texto visible del mensaje y al pasar el puntero sobre ella muestra en un tooltip qué sigla es junto con su contenido.
- AC3: CUANDO una sigla referenciada no tiene contenido asociado en los datos presentes ENTONCES el tooltip muestra el nombre completo del tipo de sigla seguido de su identificador en el idioma activo.

## Diseño

Se añade `packages/ui/src/components/item-tooltip.ts` con:
- `formatItemTooltip(id, lang, text?)`: traduce el prefijo (`A`, `AC`, `T`, `R`, `S`, `C`) al idioma activo (`es` / `en`) y añade `: <contenido>` cuando existe texto asociado.
- `itemsOfChange(change)` e `itemsOfReview(review)`: construyen el mapa de identificadores a su texto o título a partir de supuestos, criterios, tareas, riesgos, entradas del delta, solicitudes de alcance e historial del cambio.
- `ItemTooltips` (`[spItemTooltips]`): directiva que escucha eventos de puntero y foco en su contenedor, hereda el mapa de ítems de ancestros o del `ChangesStore`, y abre un overlay CDK con las posiciones de `TOOLTIP_POSITIONS` sobre elementos con `[data-item-ref]`, etiquetas/chips cuyo texto visible es una sigla, o nodos de texto que contienen siglas (sin tocar bloques `<code>`, `<pre>` ni `<sp-tooltip>` existentes).
- `ItemText` (`<sp-item-text>`): componente en línea que segmenta un texto con `splitItemRefs` y envuelve cada sigla en `<span [attr.data-item-ref]="id">` sin alterar el `textContent` del elemento padre.

## Archivos

- crear packages/ui/src/components/item-tooltip.ts — directiva spItemTooltips, componente sp-item-text y resolución bilingüe de siglas con su contenido
- crear packages/ui/src/components/item-tooltip.test.ts — pruebas unitarias de formateo, segmentación y superposición de tooltips en siglas
- modificar packages/ui/src/review/spec-review.ts — proveer el mapa de siglas del cambio en la revisión de la spec y el delta
- modificar packages/ui/src/review/spec-sections.ts — activar tooltips de siglas en filas de criterios, tareas, riesgos y chips de criterios
- modificar packages/ui/src/review/comments.ts — renderizar anclas y cuerpos de comentarios con sp-item-text para dar tooltip a las siglas mencionadas
- modificar packages/ui/src/review/spec-sections.test.ts — comprobar el tooltip contextual al pasar el puntero sobre siglas e insignias de criterios en la revisión
- modificar packages/ui/src/progress/progress-tab.ts — proveer el mapa de siglas del cambio en la pestaña de progreso
- modificar packages/ui/src/progress/locked-tests.ts — usar sp-item-text en el estado de cada test bloqueado para distinguir cada solicitud y tarea
- modificar packages/ui/src/progress/locked-tests.test.ts — comprobar los tooltips individuales de tareas y solicitudes en tests bloqueados
- modificar packages/ui/src/acceptance/acceptance-tab.ts — proveer el mapa de siglas del cambio en criterios, matriz, selector de cambios, avisos y hallazgos
- modificar packages/ui/src/inbox/inbox-row.ts — proveer el mapa de siglas del cambio en las filas de la bandeja
- modificar packages/ui/src/history/history-tab.ts — proveer el mapa de siglas desde el almacén de cambios y envolver títulos y detalles de eventos con sp-item-text
- modificar packages/ui/src/history/trace-view.ts — sustituir el title nativo por tooltips de siglas con tipo y contenido en tareas y criterios trazados
- modificar packages/ui/src/history/trace-view.test.ts — comprobar los tooltips de tareas y criterios en los bloques de trazabilidad

## Tareas

- [x] T1: Directiva de tooltips de siglas, componente de texto y resolución de contenido
  - files: packages/ui/src/components/item-tooltip.ts, packages/ui/src/components/item-tooltip.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/components/item-tooltip.test.ts
- [x] T2: Tooltips de siglas en revisión de spec, delta y comentarios
  - files: packages/ui/src/review/spec-review.ts, packages/ui/src/review/spec-sections.ts, packages/ui/src/review/comments.ts, packages/ui/src/review/spec-sections.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/review/spec-sections.test.ts
- [x] T3: Tooltips de siglas en progreso, tests bloqueados, aceptación y bandeja
  - files: packages/ui/src/progress/progress-tab.ts, packages/ui/src/progress/locked-tests.ts, packages/ui/src/progress/locked-tests.test.ts, packages/ui/src/acceptance/acceptance-tab.ts, packages/ui/src/inbox/inbox-row.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/progress/locked-tests.test.ts
- [x] T4: Tooltips de siglas en historial y vista de trazabilidad
  - files: packages/ui/src/history/history-tab.ts, packages/ui/src/history/trace-view.ts, packages/ui/src/history/trace-view.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/history/trace-view.test.ts

## Cierre

### Resumen

Se añadió `packages/ui/src/components/item-tooltip.ts` con la directiva `ItemTooltips` (`[spItemTooltips]`), el componente en línea `ItemText` (`<sp-item-text>`) y las funciones `formatItemTooltip`, `splitItemRefs`, `itemsOfReview` e `itemsOfChange`, y se integró en las vistas de revisión (`spec-review`, `spec-sections`, `comments`), progreso (`progress-tab`, `locked-tests`), aceptación (`acceptance-tab`), bandeja (`inbox-row`), historial (`history-tab`) y trazabilidad (`trace-view`).

### Desviaciones

- En `T2` se solicitó alcance adicional sobre `packages/ui/src/components/item-tooltip.ts` para asegurar que una sola instancia de tooltip permanezca abierta a la vez cuando coexisten varias directivas `ItemTooltips`.

### Decisiones

- Se usó `DomPortal` respaldado por un `DocumentFragment` para renderizar la burbuja del tooltip en el overlay CDK sin componentes auxiliares adicionales y mantener el módulo por debajo de 300 líneas.
- La directiva `ItemTooltips` hereda el mapa de siglas de ancestros o del `ChangesStore` y respeta bloques `<code>`, `<pre>` y `<sp-tooltip>` existentes.

### Pendientes

- Ninguno.
