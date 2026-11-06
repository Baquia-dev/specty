---
kind: standard
---

# La Bandeja guarda solo el resumen de cada terminado y su página pide el registro

## Objetivo

Hoy la Bandeja guarda cada cambio terminado de sus páginas entero: su spec revisada, su progreso y su historial. Sin embargo, su fila solo muestra un resumen, y la página del cambio usa ese cambio entero cuando ya está cargado. Con este cambio, la Bandeja guarda de cada terminado solo su resumen, y la página de un terminado pide siempre su registro a la fuente por su id, como ya hace con uno que la Bandeja no cargó. Es el primer paso de P178: después, otro cambio hará que el servidor mande en cada página solo esos resúmenes, en lugar de unos 680 KB de registros completos por cada 30 cambios.

## Fuera de alcance

- Cambiar lo que da `GET /api/changes/finished` o `SpectyData.finished`: siguen dando los registros completos, y la UI los deriva en el worker como hoy. Lo cambia el cambio siguiente (C2 de P178).
- Cambiar lo que muestra la fila de un terminado, la cabecera de su épica o la página del cambio.
- Los cambios abiertos: la Bandeja los sigue guardando enteros, porque su fila muestra decisiones, carpeta, archivos compartidos y avisos.
- Que los tooltips de referencias por id de un cambio encuentren los terminados de una página: hoy solo se usan en los tests.

## Supuestos

- A1: La fila de un terminado solo lee del cambio su fase, título, tipo, épica (id, título, corte y título del corte), las horas de inicio, fin y fase, el tamaño con sus motivos, las tareas (que solo pinta en `implementing` y `adjusting`) y la pestaña de su enlace. Lo demás (la decisión, la carpeta, los avisos de conversación, carpeta perdida o configuración, los archivos compartidos, los supuestos de alto impacto, las solicitudes de alcance, el delta y los tests enviados) nunca se da en un terminado. Con ese resumen, la fila se ve igual.
- A2: La página de un terminado pide su registro por id también cuando la Bandeja tiene su resumen: un cambio solo cuenta como cargado si viene entero en `changes()`. Con los datos de ejemplo y el MCP App, que dan todos sus cambios en `changes()`, el terminado viene entero y no se pide. Con el servidor local, abrir un terminado cuesta una petición (`GET /api/changes/<id>`), con el esqueleto de carga mientras llega, igual que hoy con uno que la Bandeja no cargó.
  - impacto: alto
- A3: `ChangesStore.all()` sigue dando todos los cambios cargados, los abiertos enteros y los terminados por su resumen. Así, los enlaces de los cortes de una épica (P159, que leen el id, la fase y la épica), la paleta de comandos (id y título) y la cabecera de una épica en la Bandeja (fase y pestaña) tienen lo que necesitan. Lo que necesita un cambio entero, como la vista del MCP App o los tooltips por id de un cambio, lee solo los cambios que da la fuente (`listed`), que son los únicos enteros.
- A4: El resumen de una épica guarda sus cortes (id y título): un corte cargado en otra página toma de él el título de su corte, igual que antes lo tomaba de la épica entera.
- A5: El resumen es un subconjunto de la vista (`Pick` de `ChangeView`): es lo que recibirá la UI cuando el servidor mande resúmenes en C2, así que este cambio fija su forma.

## Criterios de aceptación

- AC1: CUANDO la Bandeja carga una página de terminados ENTONCES guarda de cada uno solo su resumen: id, título, tipo, épica (id, título, corte y título del corte), cortes si es una épica, fase, desde cuándo, inicio y fin, tamaño con sus motivos, tareas hechas y totales, y la pestaña con la que se abre; sin su spec revisada, su progreso ni su historial.
- AC2: CUANDO se abre la página de un cambio terminado que la Bandeja tiene en una página ENTONCES la página pide su registro a la fuente por su id y lo muestra entero, con su historial, en la pestaña que pide su enlace.
- AC3: CUANDO la Bandeja muestra un terminado de una página ENTONCES su fila se ve igual que con el cambio entero: fase, «Empezó el …», «Tardó …», tamaño y motivos, la épica con el título del corte y el enlace a su pestaña Historial.
- AC4: CUANDO la pestaña Spec de una épica muestra sus cortes ENTONCES el corte que implementa un terminado de una página enlaza con él, con su fase, igual que con el cambio entero.

## Diseño

- `data/records.ts`: `ChangeSummary`, el `Pick` de `ChangeView` con `id`, `title`, `kind`, `epic`, `slices`, `phase`, `phaseSince`, `createdAt`, `closedAt`, `size`, `tasks` y `tab`. `ListedChange`, lo que muestra una lista: `ChangeSummary & Partial<ChangeView>`, el resumen y, si el cambio está entero, lo demás. `isWhole(change)`: si es un `ChangeView` entero, por su `review`, que solo trae la vista entera.
- `data/finished-pages.ts`: `FinishedPages.views` pasa a ser `Signal<readonly ChangeSummary[]>`. Deriva los registros de cada página como hoy y guarda de cada vista solo su resumen (`summaryOf`).
- `data/changes-store.ts`:
  - `listed` pasa a ser público: los cambios que da la fuente, enteros.
  - `finished` y `all` pasan a ser de `ChangeSummary`, y `withEpic` admite tanto un resumen como una vista.
  - `decisions` y `active` salen de `listed`, porque solo los abiertos los tienen.
  - `byId` busca solo en `listed` y, si no lo encuentra, pide el registro a la fuente, como ya hace con uno no cargado; el título de su épica lo sigue tomando de `all`.
- Bandeja: `inbox-view.ts` (filtros, secciones y bloques) e `inbox.ts` pasan a trabajar con `ListedChange`.
  - `inbox-row.ts` recibe un `ListedChange`: lo que solo tiene un abierto se lee como opcional (`?? 0`, `?? []`, `review?.delta`), y solo da a sus tooltips el cambio entero (`isWhole`).
  - `inbox-epic.ts` recibe la épica como `ListedChange`.
- `review/spec-sections.ts`: la entrada `changes` pasa a ser de `ChangeSummary`; de cada cambio lee el id, la fase y la épica.
- `app/embedded.ts` toma su cambio de `listed()`, y `components/item-tooltip.ts` busca por id en `listed()`.
- Docs: `docs/ui.md` (Terminados por páginas) y ARCHITECTURE §15 (`GET /api/changes/<id>`): la Bandeja guarda el resumen de cada terminado, y su página pide el registro por id.

## Archivos

- modificar packages/ui/src/data/records.ts — `ChangeSummary`, `ListedChange` e `isWhole`
- modificar packages/ui/src/data/finished-pages.ts — las páginas guardan el resumen de cada terminado
- modificar packages/ui/src/data/changes-store.ts — `listed` público, terminados por su resumen y `byId` solo con los cambios enteros
- modificar packages/ui/src/inbox/inbox-view.ts — filtros, secciones y bloques sobre `ListedChange`
- modificar packages/ui/src/inbox/inbox.ts — la lista de la Bandeja sobre `ListedChange`
- modificar packages/ui/src/inbox/inbox-row.ts — la fila lee un resumen o un cambio entero
- modificar packages/ui/src/inbox/inbox-epic.ts — la cabecera de una épica con su resumen
- modificar packages/ui/src/review/spec-sections.ts — los cortes enlazan con el resumen de su cambio
- modificar packages/ui/src/app/embedded.ts — el MCP App toma su cambio entero de `listed()`
- modificar packages/ui/src/components/item-tooltip.ts — los tooltips por id buscan entre los cambios enteros
- crear packages/ui/src/change/change-page.finished.test.ts — la página de un terminado de una página pide su registro por id
- crear packages/ui/src/data/finished-summaries.test.ts — el resumen que guarda la Bandeja, su fila y el enlace de su corte
- modificar packages/ui/src/acceptance/closing-actions.test.ts — su componente de prueba toma el cambio entero de `listed()`
- modificar packages/ui/src/progress/progress-tab.test.ts — su componente de prueba toma el cambio entero de `listed()`
- modificar docs/ui.md — Terminados por páginas: el resumen y el registro por id
- modificar docs/ARCHITECTURE.md — §15: la UI pide por id la página de cualquier terminado

## Tareas

- [x] T1: La página de un terminado pide su registro por id
  - files: packages/ui/src/data/changes-store.ts, packages/ui/src/change/change-page.finished.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/change/change-page.finished.test.ts --include src/change/change-page.unloaded.test.ts --include src/data/changes-store.test.ts
- [x] T2: La Bandeja y los cortes de una épica leen el resumen de un cambio
  - files: packages/ui/src/data/records.ts, packages/ui/src/inbox/inbox-view.ts, packages/ui/src/inbox/inbox.ts, packages/ui/src/inbox/inbox-row.ts, packages/ui/src/inbox/inbox-epic.ts, packages/ui/src/review/spec-sections.ts
  - ac: —
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/inbox/inbox-row.test.ts --include src/inbox/inbox-view.test.ts --include src/inbox/inbox.test.ts --include src/review/spec-sections.test.ts && pnpm --filter @baquia-dev/specty-ui typecheck
  - type: refactor
- [x] T3: La Bandeja guarda solo el resumen de cada terminado
  - files: packages/ui/src/data/finished-pages.ts, packages/ui/src/data/changes-store.ts, packages/ui/src/app/embedded.ts, packages/ui/src/components/item-tooltip.ts, packages/ui/src/data/finished-summaries.test.ts
  - ac: AC1, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/finished-summaries.test.ts --include src/data/finished-pages.test.ts --include src/data/fixtures.test.ts --include src/app/embedded.test.ts --include src/components/item-tooltip.test.ts && pnpm typecheck
- [x] T4: ui.md y ARCHITECTURE cuentan el resumen de los terminados
  - files: docs/ui.md, docs/ARCHITECTURE.md
  - ac: —
  - verify: grep -q "resumen" docs/ui.md && grep -q "cualquier terminado" docs/ARCHITECTURE.md
  - type: docs
- [x] T5: Los tests de closing-actions y progress-tab toman el cambio entero de `listed()`
  - files: packages/ui/src/acceptance/closing-actions.test.ts, packages/ui/src/progress/progress-tab.test.ts
  - ac: —
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch && pnpm typecheck
  - type: refactor

## Riesgos

- R1: Abrir un terminado con el servidor local muestra el esqueleto de carga hasta que llega su registro, aunque la Bandeja tenga su resumen. Mitigación: es una lectura local de un archivado que el servidor ya tiene en memoria (`archivedRecords`), y es el mismo camino que ya usa un cambio no cargado.
- R2: `isWhole` decide por `review` si un cambio de la lista está entero; un resumen que algún día lo trajera engañaría a la fila. Mitigación: `ChangeSummary` es un `Pick` sin `review`, y AC1 comprueba que el resumen guardado no trae nada más.

## Cierre

### Resumen

La Bandeja guarda de cada terminado de sus páginas solo su resumen, `ChangeSummary` en `data/records.ts`. Es un `Pick` de `ChangeView` con el id, el título, el tipo, la épica, los cortes, la fase, `phaseSince`, el inicio, el fin, el tamaño, las tareas y la pestaña. No guarda la spec revisada, el progreso ni el historial. `FinishedPages` sigue derivando los registros de cada página en el worker y se queda con `summaryOf(view)`. En `ChangesStore`, `finished` y `all` son de `ChangeSummary`, y `listed`, ahora público, da los cambios enteros que lista la fuente. `byId` solo da por cargados esos cambios enteros, así que la página de un terminado pide siempre su registro por id, aunque la Bandeja tenga su resumen. Lo que lee la lista acepta un resumen: la Bandeja (`inbox-view.ts`, genérico sobre `ListedChange`; `inbox.ts`, `inbox-row.ts` e `inbox-epic.ts`) y los enlaces de los cortes de una épica (`spec-sections.ts`). La fila se ve igual que con el cambio entero, y solo da a sus tooltips un cambio entero (`isWhole`). El MCP App y los tooltips por id de un cambio leen `listed()`. `docs/ui.md` y ARCHITECTURE §15 lo cuentan. Lo que manda el servidor no cambia todavía: la primera página de terminados sigue pesando unos 680 KB.

### Desviaciones

- Ajuste en la revisión 4 (T5): la suite entera de la UI no compilaba por las plantillas de los componentes de prueba de `acceptance/closing-actions.test.ts` y `progress/progress-tab.test.ts`, que pasaban un cambio de `store.all()` a componentes que piden uno entero. `pnpm typecheck` no compila las plantillas de los tests, y el verify de T3 no incluía esos archivos. T5 cambió el acceso a `store.listed()`, sin tocar ninguna aserción, y su verify ejecuta la suite entera de la UI.
- T3 cambió también el acceso en `data/fixtures.test.ts`, `acceptance/full-verification.test.ts` y `acceptance/acceptance-actions.test.ts`, de `store.all()` a `store.listed()`, porque leen la revisión o el progreso de un cambio entero y dejaron de compilar. Los dos de `acceptance/` llegaron por una ampliación de alcance que aprobó la política. No se tocó ninguna aserción.
- Las funciones de `inbox-view.ts` son genéricas sobre `ListedChange` (`InboxSection<T>`, `InboxBlock<T>`), y no solo de `ListedChange` como decía el Diseño: así, un test que les pasa vistas enteras recibe vistas enteras y no hubo que cambiarlo (`inbox-more.test.ts`).

### Decisiones

- El resumen es un `Pick` de `ChangeView`, y no un tipo propio, para que la fila, la cabecera de una épica y los enlaces de los cortes lean los mismos campos de un resumen que de una vista entera. Es la forma que recibirá la UI cuando el servidor mande resúmenes.
- `ListedChange` es `ChangeSummary & Partial<ChangeView>`: lo que solo tiene un abierto se lee como opcional, y el compilador impide que una lista lea de un resumen algo que no trae.
- `isWhole` decide por `review` si un cambio de la lista está entero, porque solo la vista entera la trae.
- `all()` sigue dando todos los cambios cargados, también los terminados por su resumen, para que los enlaces de los cortes (P159) y la paleta de comandos los vean. Lo que necesita un cambio entero lee `listed()`.
- El resumen guarda las tareas aunque la fila de un terminado no las pinte: cuestan poco y la fila las lee.

### Pendientes

- P178 sigue abierto: lo resuelve el cambio siguiente, que hace que `GET /api/changes/finished` mande solo estos resúmenes (y `SpectyData.finished` en memoria), para que la página de 30 terminados pase de unos 680 KB a unos pocos KB.
