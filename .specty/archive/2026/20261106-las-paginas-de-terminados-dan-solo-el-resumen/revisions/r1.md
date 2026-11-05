---
kind: standard
follows:
  - 20261106-core-da-el-resumen-de-un-cambio-y-la-ui-lo
---

# Las páginas de terminados dan solo el resumen de cada cambio

## Objetivo

Hoy cada página de terminados del servidor local da los 30 registros completos, con su spec, su spec aprobada, su estado y su auditoría: la primera pesa 682 KB sobre este repositorio, con 539 terminados. La Bandeja solo guarda de cada uno su resumen, y la página de un terminado pide su registro por id. Con este cambio, `GET /api/changes/finished` da solo el resumen de cada cambio, hecho con `summarizeChange` de core, que es la misma función con la que deriva la UI. Lleva además el título de la épica y el de su corte. La Bandeja guarda los resúmenes tal como llegan, sin derivarlos, y se ve igual. Resuelve P178.

## Fuera de alcance

- Cambiar `GET /api/changes` (los abiertos, enteros) o `GET /api/changes/<id>`, que sigue dando el registro completo de un terminado, con el commit de sus tareas, para su página.
- Cambiar lo que muestra la Bandeja, la cabecera de una épica, el enlace de un corte o la página de un terminado.
- Pasar a core la regla del título de la épica y del corte de un corte: la aplica quien conoce las épicas (`deriveViews` en la UI; `finishedPage` en el servidor, con las abiertas y las archivadas).
- Compatibilidad con un servidor o una UI de otra versión: los dos salen del mismo paquete y de la misma compilación.

## Supuestos

- A1: El resumen que da el servidor tiene la forma de `ChangeSummary` de la UI (`data/records.ts`): el resumen de core, con `epic` como `{ id, title, slice?, sliceTitle? }`. Así, la UI lo guarda tal como llega.
- A2: El título de la épica de un corte es el de su spec, abierta o archivada, o su id si no está; el título del corte es el que le da la sección Cortes de esa épica, si la tiene y lo nombra. Es la regla de `deriveViews` en la UI, y el servidor ya la aplicaba al título de la épica.
- A3: El servidor lee la spec de un archivado sin indicar idioma (`parseSpec(record.spec)`), como la UI, para que el resumen sea el mismo que derivaría la UI. Hoy la leía con el idioma del repositorio, pero solo para buscar y ordenar.
- A4: La página ya no busca el commit de cada tarea (`withTaskCommits`, que hacía una búsqueda en el historial de git en cada petición): un resumen solo cuenta las tareas hechas. `withTaskCommits` se borra porque nadie más la usa.
- A5: La validación de la UI (`isFinishedPage`) es ligera, como la de los registros: comprueba los textos y números que lee la fila (id, título, tipo, fase, horas, pestaña, tareas, la épica con su id y su título, y el tamaño con su nivel y sus motivos), no cada campo.
  - impacto: alto
- A6: Con una fuente que da todos sus cambios (los datos de ejemplo y el MCP App), `SpectyData.finished` sigue derivando en memoria, en el chunk perezoso de `views.ts`. Ahora da de cada vista su resumen (`summaryOf`, que pasa de `data/finished-pages.ts` a `data/source.ts`).

## Criterios de aceptación

- AC1: CUANDO la UI pide una página de terminados al servidor local ENTONCES cada cambio llega por su resumen: id, título, tipo, épica, cortes si es una épica, fase, `phaseSince`, inicio y fin, tamaño con sus motivos en español y en inglés, tareas hechas y totales, y la pestaña con la que se abre; sin su spec, su estado ni su auditoría, y la respuesta es `{ changes, total, counts, finished }`, sin `records` ni `epics`.
- AC2: CUANDO un terminado de la página es el corte de una épica abierta, archivada o que ya no existe ENTONCES su resumen lleva el título de la épica, y el de su corte cuando la épica lo nombra en sus Cortes; si la épica ya no existe, su id.
- AC3: CUANDO una fuente que da todos sus cambios da una página de terminados ENTONCES la da con el resumen de cada cambio, el mismo que deriva la UI, y sin el mapa `epics`.
- AC4: CUANDO llega una página de terminados ENTONCES la Bandeja guarda sus resúmenes tal como llegan, sin derivarlos, y prefiere el título de una épica abierta cargada; y CUANDO el servidor responde algo que no es una página de resúmenes ENTONCES la UI dice que devolvió datos inesperados.
- AC5: CUANDO el servidor local da la primera página de terminados de este repositorio ENTONCES pesa del orden de 20 KB por 30 cambios, frente a los 682 KB de antes.
  - test: manual

## Diseño

- `packages/cli/src/server/finished.ts`:
  - `FinishedPage` pasa a ser `{ changes, total, counts, finished }`.
  - `summaryOf(record)` llama a `summarizeChange` con la spec leída con `parseSpec(record.spec)`, el estado, `phaseSince` y la auditoría del registro. Se guarda con el registro archivado, como ahora (`WeakMap`), y sustituye al `Summary` propio.
  - `openSide` da de cada épica abierta su título y sus cortes, y las archivadas los dan desde su resumen.
  - `listedOf(summary, epics)` pone en la épica de un corte su título (o su id) y el de su corte. Busca, filtra y ordena sobre eso, como ahora.
  - La página no lleva el commit de las tareas.
- `packages/cli/src/server/records.ts`: se borra `withTaskCommits`.
- `packages/ui/src/data/source.ts`:
  - `FinishedPage` pasa a ser `{ changes: readonly ChangeSummary[], total, counts, finished }`.
  - La implementación en memoria de `finished` da `page.map(summaryOf)`, y `summaryOf(view)` se mueve aquí.
- `packages/ui/src/data/server-answers.ts`: `isFinishedPage` comprueba `changes` con `isChangeSummary`, una comprobación ligera de cada resumen (A5).
- `packages/ui/src/data/finished-pages.ts`: `FinishedPages` ya no recibe el derivador. Guarda los resúmenes de cada página tal como llegan, y desaparecen `epics` y su mezcla al añadir páginas.
- `packages/ui/src/data/changes-store.ts`: crea `FinishedPages` sin el derivador. `withEpic` ya no recibe títulos: toma el de la épica cargada y, si no, deja el que trae el resumen.
- Tests:
  - en la CLI, `test/server/finished.test.ts` (resúmenes completos y las épicas de los cortes, con una épica abierta), y `test/server.test.ts` y `test/server-restore.test.ts`, que leían `records` de la página;
  - en la UI, `data/finished-source.test.ts` (la respuesta del servidor, su validación y la página en memoria) y `data/finished-pages.test.ts` (la Bandeja guarda los resúmenes sin derivarlos, con una fuente que pide la página a `ServerData` con `fetch` simulado).
  - Ningún test de la UI escrito antes que el código usa un tipo o un miembro que aún no existe: leen la página con `toEqual` y `toMatchObject`.
- Docs: ARCHITECTURE §15 (`/api/changes/finished` y `/api/changes/<id>`) y `docs/ui.md` (Terminados por páginas).

## Archivos

- modificar packages/cli/src/server/finished.ts — cada página da el resumen de cada cambio, con el título de su épica y de su corte
- modificar packages/cli/src/server/records.ts — se borra `withTaskCommits`
- modificar packages/cli/test/server/finished.test.ts — los resúmenes de la página y las épicas de sus cortes
- modificar packages/cli/test/server.test.ts — leen los resúmenes de la página en vez de sus registros
- modificar packages/cli/test/server-restore.test.ts — lee los resúmenes de la página en vez de sus registros
- modificar packages/ui/src/data/source.ts — `FinishedPage` con resúmenes y la página en memoria por resúmenes
- modificar packages/ui/src/data/server-answers.ts — `isFinishedPage` comprueba los resúmenes
- modificar packages/ui/src/data/finished-pages.ts — guarda los resúmenes tal como llegan, sin derivarlos
- modificar packages/ui/src/data/changes-store.ts — `FinishedPages` sin derivador y `withEpic` sin títulos
- modificar packages/ui/src/data/finished-source.test.ts — la respuesta del servidor, su validación y la página en memoria
- modificar packages/ui/src/data/finished-pages.test.ts — la Bandeja guarda los resúmenes sin derivarlos
- modificar docs/ARCHITECTURE.md — §15: la página de terminados da resúmenes
- modificar docs/ui.md — Terminados por páginas: la Bandeja guarda los resúmenes tal como llegan

## Tareas

- [ ] T1: El servidor da el resumen de cada terminado en sus páginas
  - files: packages/cli/src/server/finished.ts, packages/cli/src/server/records.ts, packages/cli/test/server/finished.test.ts, packages/cli/test/server.test.ts, packages/cli/test/server-restore.test.ts
  - ac: AC1, AC2, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server/finished.test.ts test/server.test.ts test/server-restore.test.ts && pnpm --filter @baquia-dev/specty typecheck && pnpm lint && pnpm knip
- [ ] T2: La Bandeja guarda los resúmenes de cada página tal como llegan
  - files: packages/ui/src/data/source.ts, packages/ui/src/data/server-answers.ts, packages/ui/src/data/finished-pages.ts, packages/ui/src/data/changes-store.ts, packages/ui/src/data/finished-source.test.ts, packages/ui/src/data/finished-pages.test.ts
  - ac: AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch && pnpm typecheck && pnpm lint && pnpm knip
- [ ] T3: ARCHITECTURE y ui.md cuentan las páginas de resúmenes
  - files: docs/ARCHITECTURE.md, docs/ui.md
  - ac: —
  - verify: grep -q "changes, total, counts, finished" docs/ARCHITECTURE.md && grep -q "tal como llegan" docs/ui.md
  - type: docs

## Riesgos

- R1: Un resumen del servidor que difiera del que derivaría la UI cambiaría la fila de un terminado según la fuente. Mitigación: los dos lados usan `summarizeChange` de core (C2a) y leen la spec igual (A3), y la regla de la épica es la de `deriveViews` (A2). AC1 y AC2 comprueban resúmenes completos en el servidor, y los tests de C1 (`finished-summaries`, `change-page.finished`) siguen pasando con la fuente en memoria.
- R2: Una página que un servidor más viejo respondiera con registros no pasaría la validación, y la Bandeja diría que el servidor devolvió datos inesperados. Mitigación: la UI y el servidor salen de la misma compilación de `specty`, y ese mensaje ya existe para una respuesta que no se entiende.
