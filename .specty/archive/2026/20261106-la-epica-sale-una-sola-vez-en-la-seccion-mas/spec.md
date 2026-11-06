---
kind: standard
epic: 20261106-epica-en-la-bandeja-con-lineas-por-corte
slice: C1
---

# La épica sale una sola vez, en la sección más urgente, con todos sus cortes

## Objetivo

En la Bandeja, una épica cargada y todos sus cortes cargados forman un solo bloque que sale una vez, en una única sección: la más urgente entre ellos al agrupar por estado, la de la fase de la épica al agrupar por fase, su sitio del orden sin agrupar y la suya al agrupar por épica. Desaparecen las varias apariciones de la misma épica (su fila en una sección y sus cortes agrupados en otras), primer paso hacia la tarjeta con una línea de fases por corte.

## Fuera de alcance

- Las líneas de fases de cada corte, quién lo lleva y la cabecera con el avance de la épica (cortes C2, C3 y C4): en este corte, los cortes siguen como filas dentro del bloque de su épica.
- Los cortes sin cambio cargado (por empezar, o terminados que no llegaron en las páginas) no salen en el bloque: los trae C2.
- `InboxRow` sigue recibiendo `inEpic`; C2 lo quita.
- «X de N cambios», los contadores de los filtros de fase y el resumen bajo el título siguen contando cambios.

## Supuestos

- A1: Una épica cargada siempre forma un bloque, aunque no tenga cortes cargados: lo encabeza su propia fila, y sus cortes cargados van debajo. Un corte cuya épica no está cargada sigue siendo una fila suelta con «Feature · C2 · <Épica>».
  - impacto: alto
- A2: La urgencia de un bloque al agrupar por estado cuenta a todos sus miembros cargados, también a los que un filtro no deja pasar: el bloque sale entero y en la misma sección con o sin filtro.
  - impacto: medio
- A3: Sin agrupar y dentro de cada sección, el bloque ocupa el sitio de su miembro que va primero en el orden elegido (los abiertos antes que los terminados), y sus cortes van debajo en ese mismo orden. El orden de la spec de la épica llega con las líneas, en C2.
  - impacto: medio
- A4: Los cortes cargados son los abiertos y los terminados de las páginas cargadas. Con una búsqueda o una fase, la fuente da solo los terminados que coinciden, así que un corte terminado que no coincide no está en el bloque hasta que C2 pida el cambio de cada corte (AC11 de la épica).
  - impacto: bajo
- A5: Agrupando por épica, los cortes cuya épica no está cargada siguen yendo, como filas, a la sección de su épica, con el título de la épica que traen.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO la Bandeja, agrupada por estado, muestra una épica con un corte que espera una decisión, otros en curso y otros terminados ENTONCES la muestra una sola vez, en «Esperan tu decisión», con todos sus cortes dentro; ningún corte suyo sale como fila en otra sección, y el número de la sección cuenta la épica como uno.
- AC10: CUANDO la Bandeja se agrupa por fase, sin agrupar o por épica, o un filtro deja pasar solo uno de los cortes de una épica ENTONCES la épica sale una sola vez, con todos sus cortes, en la sección de su propia fase, en su sitio del orden o en su propia sección.

## Diseño

- `inbox-view.ts` (puro):
  - `inboxSections` ordena todos los cambios listados (los abiertos y después los terminados, cada parte en el orden elegido) y los reúne en bloques: cada épica cargada con todos sus cortes cargados es un bloque `epic` (`{ kind, key, epic, slices }`), y cada otro cambio, un bloque `row`.
  - Un filtro deja pasar el bloque si deja pasar a cualquiera de sus miembros, con la misma función que `visibleChanges`.
  - Los bloques van a una sola sección: por estado, la del más urgente de sus miembros (decisión › en curso › recientes); por fase, la de la épica; sin agrupar, la única; por épica, cada épica en la suya, los cortes sin épica cargada en la de su épica y los demás por tipo.
  - `InboxSection` lleva `blocks` (su número es el de la sección) y `order`, los cambios que recorren `j`/`k`: cada fila, o la épica y después sus cortes. `sectionBlocks`, `clusterByEpic` y la épica de otra sección desaparecen.
- `inbox.ts`: recorre `section.blocks`, muestra `blocks.length` como número de la sección y `j`/`k` siguen `order`.
- `inbox-epic.ts`: solo envuelve el bloque: la fila de la épica a la cabeza, proyectada, y sus cortes sangrados debajo. La cabecera de una épica que no está en la sección (fase, título y enlace, sin fila) desaparece, porque la épica siempre está en su bloque.

## Archivos

- modificar packages/ui/src/inbox/inbox-view.ts — cada épica cargada con todos sus cortes en un solo bloque, en una sola sección; el filtro por bloque y el orden de `j`/`k`
- modificar packages/ui/src/inbox/inbox-view.test.ts — AC1 y AC10 sobre las secciones y sus bloques
- modificar packages/ui/src/inbox/inbox.ts — recorre los bloques de cada sección, cuenta bloques, y `j`/`k` siguen `order`
- modificar packages/ui/src/inbox/inbox-epic.ts — sin la cabecera de una épica que no está en su bloque
- modificar packages/ui/src/inbox/inbox.test.ts — AC1 y AC10 en la Bandeja entera, con `j`/`k`
- modificar packages/ui/src/inbox/inbox-more.test.ts — los abiertos antes que los terminados, sobre el orden de `j`/`k` de cada sección
- modificar docs/ui.md — «Épicas como cabecera» pasa a la épica con sus cortes en una sola sección; el número de cada sección cuenta bloques

## Tareas

- [x] T1: Las secciones de la Bandeja reúnen cada épica con todos sus cortes en un solo bloque
  - files: packages/ui/src/inbox/inbox-view.ts, packages/ui/src/inbox/inbox-view.test.ts
  - ac: AC1, AC10
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/inbox/inbox-view.test.ts
  - type: feat
- [x] T2: La Bandeja dibuja cada épica una vez, con su fila a la cabeza y sus cortes debajo
  - files: packages/ui/src/inbox/inbox.ts, packages/ui/src/inbox/inbox-epic.ts, packages/ui/src/inbox/inbox.test.ts, packages/ui/src/inbox/inbox-more.test.ts, docs/ui.md
  - ac: AC1, AC10
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/inbox/inbox.test.ts --include src/inbox/inbox-more.test.ts --include src/inbox/inbox-view.test.ts && pnpm typecheck
  - type: feat

## Riesgos

- R1: `j`/`k` recorren `order`, que tiene que coincidir con el orden en que se dibujan las filas; si no, `j` saltaría filas. Mitigación: `order` sale de los mismos bloques que dibuja la plantilla, y el test de AC1 en la Bandeja recorre el bloque con `j`.

## Cierre

### Resumen

En la Bandeja, cada épica cargada forma con todos sus cortes cargados un solo bloque que sale una vez, en una única sección: la más urgente entre sus miembros al agrupar por estado (decisión › en curso › recientes), la de la fase de la épica al agrupar por fase, el sitio de su primer miembro sin agrupar y la suya al agrupar por épica. Un filtro deja pasar el bloque entero si deja pasar a cualquiera de sus miembros. `InboxSection` lleva ahora `blocks`, cuyo número es el de la sección, y `order`, el recorrido de `j`/`k`: la épica y después sus cortes. `sp-inbox-epic` solo envuelve la fila de la épica y sus cortes sangrados; la cabecera de una épica que estaba en otra sección desapareció con `sectionBlocks` y `clusterByEpic`. `docs/ui.md` describe el bloque en «Cada épica, una sola vez».

### Desviaciones

- Ninguna: el cambio sigue el diseño de la spec y el de C1 en la épica.

### Decisiones

- Toda épica cargada es un bloque, aunque no tenga cortes cargados (A1): lo encabeza su fila, y el contenedor de los cortes se oculta vacío (`empty:hidden`), para que C2 dé a todas las épicas la misma tarjeta.
- La urgencia del bloque cuenta a todos sus miembros cargados, no solo a los que deja pasar un filtro (A2), así que el bloque no cambia de sección al buscar.
- Dentro del bloque, los cortes van en el orden elegido (A3); el orden de la spec llega con las líneas de C2.

### Pendientes

- Ninguno
