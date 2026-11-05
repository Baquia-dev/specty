---
kind: standard
epic: 20261106-pendientes-de-la-sesion-por-feature
slice: C5
---

# La página de un cambio muestra sus pendientes

## Objetivo

Hoy, para saber qué pendientes dejó un cambio o cuáles resolvió, hay que ir a la Memoria y buscar su id. Con este cambio, la página de un cambio lista las entradas de la memoria que salieron de él y las que tomó, cada una con su id, su tipo, su estado y su primera línea, y el id lleva a la Memoria con esa entrada buscada.

## Fuera de alcance

- Decidir sobre las entradas desde la página de un cambio (descartar, mantener o marcar hecho): sigue en la Memoria.
- Listar en la página de una épica las entradas de sus cortes.
- Un endpoint de la memoria por cambio.
- Que la búsqueda de la Memoria encuentre un id exacto (P12 sin P120).
- Que escribir en la búsqueda de la Memoria cambie la URL.

## Supuestos

- A1: La sección lista las entradas de cualquier tipo (pendientes, mejoras, recordatorios, decisiones y lecciones) cuyo `origin.change` o `taken.change` es el cambio, también las hechas y las descartadas, por fecha de creación, la más antigua primero.
  - impacto: medio
- A2: La sección va al final de la cabecera amplia, bajo la franja de datos y sus avisos y antes de las pestañas, así se ve en cualquier pestaña y también en un cambio que perdió su carpeta. Lleva el divisor «En la memoria» («In the memory») con su número, y las filas sangradas como en la Memoria.
  - impacto: medio
- A3: Los datos salen de `SpectyData.memory()`, la petición que ya hace la página Memoria (`GET /api/memory`), y la sección la vuelve a leer con cada aviso de la fuente. Si la fuente no da la memoria o no puede leerla, la sección no aparece y no avisa: la página Memoria ya dice el error.
  - impacto: bajo
- A4: El id lleva a `/memory?q=<id>`, y a `/memory?q=<id>&closed=1` si la entrada está hecha o descartada. La página Memoria lee los dos parámetros al abrirse: `q` llena la búsqueda y `closed` marca «Ver hechas y descartadas». La búsqueda es la de la caja, así que también deja las entradas cuyo texto contiene el id (P120 al buscar P12).
  - impacto: medio
- A5: El estado va a la derecha de cada fila, en una etiqueta con el tono de una fase: abierta (borrador), tomada (implementando), hecha (terminado), descartada (cancelado) y propuesta para descartar (revisión). Bajo la primera línea van «salió de este cambio» o «la tomó este cambio», «tomada por» con el id del otro cambio si la tomó otro, quién la anotó y su fecha.

## Criterios de aceptación

- AC1: CUANDO la persona abre la página de un cambio y la memoria tiene entradas que salieron de él o que él tomó ENTONCES la sección «En la memoria» las lista por fecha, cada una con su id, su tipo, su primera línea, su estado (abierta, tomada, hecha, descartada o propuesta para descartar) y si salió del cambio o la tomó, y no lista las de otros cambios.
- AC2: CUANDO la persona pulsa el id de una entrada de esa sección ENTONCES va a la Memoria con el id en la búsqueda y la entrada a la vista, también si está hecha o descartada.
- AC3: CUANDO la persona abre la Memoria con `?q=P6` ENTONCES la búsqueda dice «P6» y la página muestra lo que la contiene; y CUANDO la abre con `?q=P20&closed=1` ENTONCES «Ver hechas y descartadas» está marcado y P20 está a la vista.
- AC4: CUANDO la memoria no tiene entradas del cambio, o la fuente no da la memoria ENTONCES la página del cambio no muestra la sección.
- AC5: CUANDO la página está en inglés ENTONCES la sección dice «In the memory», los estados «open», «taken», «done», «dropped» y «proposed to drop», y la relación «came from this change» o «taken by this change»; y en español, «En la memoria», «abierta», «tomada», «hecha», «descartada», «propuesta para descartar», «salió de este cambio» y «la tomó este cambio».

## Diseño

- `packages/ui/src/change/change-memory.ts` (nuevo): `sp-change-memory`, con el id del cambio como entrada.
  - Lee `SpectyData.memory()` con `resource` y la vuelve a leer con `subscribe`, como `memory/memory-page.ts`.
  - Sin entradas del cambio, no pinta nada. Con alguna, una `<section data-change-memory>` con `sp-section-divider` (nivel 2, su número a la derecha) y una lista `LIST` de filas `ROW` (`components/document.ts`).
  - Cada fila (`[data-entry]`) lleva el id como enlace a la Memoria (`routerLink` con `queryParams`), con un título que lo explica; la etiqueta de su tipo y su primera línea; debajo, su relación con el cambio, quién la anotó y su fecha; a la derecha, su estado (`[data-status]`).
  - Solo exporta el componente, que importa `change-page.ts` (knip).
- `packages/ui/src/memory/memory-lines.ts`: recibe de `memory-page.ts` el nombre y el tono de cada tipo de entrada (`ENTRY_KINDS`) y la primera línea de su texto (`firstLine`), para que la Memoria y la página de un cambio los pinten igual.
- `packages/ui/src/memory/memory-page.ts`: entradas del router `q` y `closed` (`withComponentInputBinding`, como `tab` en la página de un cambio); `query` y `closed` pasan a `linkedSignal` de ellas, así la persona sigue cambiándolas en la barra.
- `packages/ui/src/change/change-page.ts`: `<sp-change-memory [change]="change.id" />` al final de la cabecera amplia.
- `packages/ui/src/data/sample-memory.ts`: el prototipo da un pendiente abierto que salió del cambio terminado de muestra (`20261015-redondeo-promedios`) y una mejora que tomó y quedó hecha, con su origen en `origins`.
- Tests: los escritos antes que el código no usan tipos ni miembros que aún no existen; leen el DOM con una fuente que extiende `FixtureData` y da su propia memoria.

## Archivos

- crear packages/ui/src/change/change-memory.ts — la sección «En la memoria» de la página de un cambio
- crear packages/ui/src/change/change-memory.test.ts — las entradas de un cambio con su estado, su enlace a la Memoria, sin entradas y en inglés
- modificar packages/ui/src/change/change-page.ts — pinta la sección al final de la cabecera amplia
- modificar packages/ui/src/memory/memory-lines.ts — el nombre y el tono de cada tipo de entrada y su primera línea, compartidos con la página de un cambio
- modificar packages/ui/src/memory/memory-page.ts — lee la búsqueda y las cerradas de la URL y usa los tipos de `memory-lines.ts`
- crear packages/ui/src/memory/memory-url.test.ts — la Memoria abierta con `?q=` y `?closed=1`
- modificar packages/ui/src/data/sample-memory.ts — entradas del prototipo que salieron del cambio terminado de muestra y que este tomó
- crear packages/ui/src/data/sample-memory.test.ts — las entradas del cambio terminado de muestra y los orígenes con el título y la fase de los cambios del prototipo
- modificar docs/ui.md — la sección «En la memoria» de la página de un cambio y los parámetros de la Memoria

## Tareas

- [x] T1: La Memoria lee la búsqueda y las cerradas de la URL
  - files: packages/ui/src/memory/memory-page.ts, packages/ui/src/memory/memory-url.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/memory/memory-url.test.ts --include src/memory/memory-toolbar.test.ts --include src/memory/memory-page.test.ts && pnpm --filter @baquia-dev/specty-ui typecheck
- [x] T2: La página de un cambio lista sus entradas de la memoria con su estado y su enlace
  - files: packages/ui/src/change/change-memory.ts, packages/ui/src/change/change-page.ts, packages/ui/src/memory/memory-lines.ts, packages/ui/src/memory/memory-page.ts, packages/ui/src/change/change-memory.test.ts
  - ac: AC1, AC2, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/change/change-memory.test.ts --include src/change/change-page.test.ts --include src/memory/memory-page.test.ts --include src/memory/memory-actions.test.ts --include src/memory/memory-lines.test.ts && pnpm --filter @baquia-dev/specty-ui typecheck
- [x] T3: El prototipo muestra las entradas del cambio terminado de muestra
  - files: packages/ui/src/data/sample-memory.ts, packages/ui/src/data/sample-memory.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/sample-memory.test.ts --include src/change/change-page.unloaded.test.ts --include src/history/history-tab.test.ts --include src/history/history-export.test.ts --include src/memory/memory-toolbar.test.ts --include src/memory/memory-actions.test.ts && pnpm typecheck
- [x] T4: ui.md cuenta la sección de la página de un cambio y los parámetros de la Memoria
  - files: docs/ui.md
  - ac: —
  - verify: grep -q "En la memoria" docs/ui.md && grep -q "closed=1" docs/ui.md
  - type: docs

## Riesgos

- R1: La página de un cambio pide toda la memoria con cada aviso de la fuente, y `GET /api/memory` lee los orígenes. Mitigación: es la misma petición de la Memoria, que el servidor sirve con los archivados que ya guarda; sin entradas con cambio de origen no lee nada.
- R2: Las pruebas de la página de un cambio con el prototipo ven la sección nueva en el cambio terminado de muestra. Mitigación: la sección no usa insignias de fase, `h1`, `role=status` ni `[data-event]`, que leen esas pruebas, y sus verificaciones entran en la de T3.
