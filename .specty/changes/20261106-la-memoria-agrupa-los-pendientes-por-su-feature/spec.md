---
kind: standard
epic: 20261106-pendientes-de-la-sesion-por-feature
slice: C4
---

# La Memoria agrupa los pendientes por su feature

## Objetivo

En la página Memoria, «Pendientes y mejoras» es hoy una lista por fecha, y para saber de qué trabajo salió cada entrada hay que leer el id de su cambio de origen. Con este cambio, el servidor da el título, el tipo, la fase y la épica de cada cambio de origen, y la página agrupa los pendientes y las mejoras abiertos bajo su feature, y las features que son cortes bajo su épica, como la Bandeja agrupa los cortes. La búsqueda encuentra los pendientes de una feature por su título.

## Fuera de alcance

- Agrupar por feature las propuestas de descartar, las decisiones, las lecciones, los recordatorios y las entradas hechas o descartadas.
- Quitar el cambio de origen de la línea de cada entrada, aunque la cabecera de su grupo ya lo diga.
- Mostrar en la página de un cambio las entradas que salieron de él (C5 de la épica).
- Plegar los grupos o filtrar por feature.

## Supuestos

- A1: La feature de una entrada es el cambio de su `origin.change`, sea del tipo que sea, y su insignia es la de su tipo («Feature», «Quick», «Spike»…; un corte, «Feature · C2»). Si el cambio de origen es una épica, sus entradas van bajo la cabecera de la épica, antes de sus cortes.
  - impacto: medio
- A2: Solo se agrupan los pendientes y las mejoras abiertos de la sección «Pendientes y mejoras». Su número sigue contando sus entradas, y la lista plana de la sección (`items`) sigue teniendo todas sus entradas, en el orden de los grupos.
- A3: Un cambio de origen que el servidor no encuentra sale con su id como título, con la insignia «Feature», sin fase y sin enlace, porque su página no existe.
- A4: El servidor lee los cambios abiertos de su spec y su estado, en la carpeta de cada uno (`locateChanges`, como la página de terminados lee las épicas abiertas), y los archivados de los registros que ya guarda en memoria (`archivedRecords`), con el resumen que la página de terminados guarda con cada registro (`summaryOf`). Sin ninguna entrada con cambio de origen, no lee nada. Un cambio abierto cuya carpeta se perdió sale como uno que no encuentra.
  - impacto: bajo
- A5: `origins` es opcional en `MemoryRecord` de la UI: con una fuente que no lo da, la página agrupa igual y cada feature lleva su id como título. El servidor local siempre lo da.
- A6: La cabecera de una épica dice su título con el enlace a su página y la insignia «Épica»; su fase solo sale cuando la épica es también el cambio de origen de alguna entrada, porque de la épica de un corte `origins` da solo el id y el título.

## Criterios de aceptación

- AC1: CUANDO la UI pide `GET /api/memory` ENTONCES la respuesta añade `origins`: de cada cambio de origen de las entradas, abierto o archivado, su título, su tipo, su fase y, si es un corte, su épica con su id, su título y su corte; uno que no encuentra lleva solo su id como título; y CUANDO la UI recibe un origen sin título ENTONCES dice que el servidor devolvió datos inesperados.
- AC2: CUANDO la persona abre la página Memoria ENTONCES los pendientes y las mejoras abiertos van en grupos bajo la feature de donde salieron, cada uno con una cabecera con su fase, su título con el enlace a su página y su insignia, y sus entradas sangradas debajo; los cortes de una épica van dentro del grupo de su épica, que lleva su título, su enlace y la insignia «Épica», con la insignia «Feature · C2» en cada corte; los que no salieron de un cambio van al final, en «Sin feature».
- AC3: CUANDO la sección tiene varios grupos ENTONCES van por la fecha de su entrada más reciente, la más reciente primero, también los cortes dentro de su épica, con «Sin feature» siempre al final; y las entradas de cada grupo van por fecha, la más antigua primero, como hoy.
- AC4: CUANDO la persona busca en la página Memoria el título de una feature ENTONCES ve los pendientes de esa feature; y CUANDO busca el título de una épica ENTONCES ve los de todos sus cortes.
- AC5: CUANDO la página está en inglés ENTONCES las cabeceras dicen «No feature», «Epic» y «Feature · C2», y en español, «Sin feature», «Épica» y «Feature · C2».

## Diseño

- `packages/cli/src/server/origins.ts` (nuevo): `memoryOrigins(session, entries)` da un objeto por id de cambio de origen con `{ title, kind?, phase?, epic? }`, y `epic` es `{ id, title, slice? }`:
  - Lee los abiertos con `locateChanges`: el título y `frontmatter.epic`/`slice` de su spec, y el tipo y la fase de su estado.
  - Lee los archivados con `archivedRecords` y `summaryOf`, y lo abierto gana a lo archivado.
  - A un corte le pone el título de su épica, abierta o archivada, o su id si no la encuentra (la regla de `listedOf` en `finished.ts`).
- `packages/cli/src/server/finished.ts`: exporta `summaryOf`, que ya guarda el resumen con el registro archivado.
- `packages/cli/src/server/api.ts`: `memoryView` da `{ entries, changes, origins }`.
- `packages/ui/src/data/records.ts`: `MemoryOrigin` y `MemoryRecord.origins?`, un objeto por id.
- `packages/ui/src/data/server-answers.ts`: `isMemoryRecord` acepta `origins` ausente o un objeto en el que cada origen es un objeto con `title` de texto.
- `packages/ui/src/memory/memory-view.ts`:
  - `MemoryGroup` es `{ change?, items, features }`: `change` es el id del cambio con su origen, y falta en «Sin feature»; `items`, sus entradas por fecha; `features`, los grupos de los cortes de una épica.
  - La sección `work` lleva `groups`, y sus `items` son las entradas de los grupos en su orden.
  - `filtered` busca también en el título de la feature y en el de su épica.
- `packages/ui/src/memory/memory-group.ts` (nuevo): `sp-memory-group` pinta un grupo. Una épica va en un bloque como el de `sp-inbox-epic`, con sus cortes dentro. Una feature suelta y «Sin feature» van sin bloque. Cada cabecera lleva `PhaseBadge`, el título con el enlace y `KindBadge` (con `inEpic` dentro de una épica), y sus filas van sangradas con la línea a la izquierda de la Bandeja (`border-l-2 border-border pl-3`). Las filas las da la página como plantilla (`TemplateRef`), así se pintan igual que en las demás secciones y sus acciones siguen en la página.
- `packages/ui/src/memory/memory-page.ts`: la fila de una entrada pasa a un `ng-template` que usan las secciones planas y los grupos, y la sección `work` pinta sus grupos.
- `packages/ui/src/data/sample-memory.ts`: el prototipo da `origins`: P15 sale de una feature suelta y P6 de un corte de la épica de la memoria.
- Tests:
  - CLI: `test/server/memory-origins.test.ts`, con un cambio abierto, una épica y su corte archivados, un cambio que no existe y una entrada sin cambio de origen.
  - UI: `memory/memory-groups.test.ts` (los grupos, su orden, la búsqueda y la validación de `ServerData.memory()`) y `memory/memory-group.test.ts` (la página, en español y en inglés).
  - Los tests de la UI escritos antes que el código no usan tipos ni miembros que aún no existen: leen con `toMatchObject` y el DOM, y sus registros no se anotan con los campos nuevos.
- Docs: ARCHITECTURE §15 (`/api/memory`) y `docs/ui.md` (una sección «Memoria»).

## Archivos

- crear packages/cli/src/server/origins.ts — el título, el tipo, la fase y la épica de cada cambio de origen de la memoria
- modificar packages/cli/src/server/api.ts — `GET /api/memory` da `origins`
- modificar packages/cli/src/server/finished.ts — exporta `summaryOf` para reusar el resumen guardado de cada archivado
- crear packages/cli/test/server/memory-origins.test.ts — los orígenes que da `GET /api/memory`
- modificar packages/ui/src/data/records.ts — `MemoryOrigin` y `MemoryRecord.origins`
- modificar packages/ui/src/data/server-answers.ts — `isMemoryRecord` comprueba los orígenes
- modificar packages/ui/src/data/sample-memory.ts — los orígenes del prototipo
- modificar packages/ui/src/memory/memory-view.ts — los grupos por feature y épica, su orden y la búsqueda por su título
- crear packages/ui/src/memory/memory-groups.test.ts — los grupos, su orden, la búsqueda y la validación de la respuesta
- crear packages/ui/src/memory/memory-group.ts — el componente de un grupo con su cabecera y sus filas sangradas
- modificar packages/ui/src/memory/memory-page.ts — la fila de una entrada como plantilla y la sección por grupos
- crear packages/ui/src/memory/memory-group.test.ts — la página Memoria agrupada, en español y en inglés
- modificar docs/ARCHITECTURE.md — §15: `GET /api/memory` da `origins`
- modificar docs/ui.md — la página Memoria y sus grupos por feature

## Tareas

- [x] T1: El servidor da la feature de origen de cada entrada de la memoria
  - files: packages/cli/src/server/origins.ts, packages/cli/src/server/api.ts, packages/cli/src/server/finished.ts, packages/cli/test/server/memory-origins.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server/memory-origins.test.ts test/server/memory.test.ts test/server/finished.test.ts && pnpm --filter @baquia-dev/specty typecheck
- [x] T2: La vista de la Memoria agrupa los pendientes por feature y busca por su título
  - files: packages/ui/src/data/records.ts, packages/ui/src/data/server-answers.ts, packages/ui/src/memory/memory-view.ts, packages/ui/src/memory/memory-groups.test.ts
  - ac: AC1, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/memory/memory-groups.test.ts --include src/memory/memory-view.test.ts --include src/memory/memory-filter.test.ts && pnpm --filter @baquia-dev/specty-ui typecheck
- [x] T3: La página Memoria muestra cada grupo con su cabecera y sus filas sangradas
  - files: packages/ui/src/memory/memory-group.ts, packages/ui/src/memory/memory-page.ts, packages/ui/src/data/sample-memory.ts, packages/ui/src/memory/memory-group.test.ts
  - ac: AC2, AC5
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/memory/memory-group.test.ts --include src/memory/memory-page.test.ts --include src/memory/memory-actions.test.ts && pnpm typecheck
- [x] T4: ARCHITECTURE y ui.md cuentan los grupos de la Memoria
  - files: docs/ARCHITECTURE.md, docs/ui.md
  - ac: —
  - verify: grep -q "entries, changes, origins" docs/ARCHITECTURE.md && grep -q "Sin feature" docs/ui.md
  - type: docs

## Riesgos

- R1: Leer el título de cada cambio de origen hace más lento `GET /api/memory`, que la página pide con cada evento. Mitigación: los archivados salen de lo que el servidor ya guarda en memoria, con su resumen; los abiertos son pocos, y sin entradas con cambio de origen no se lee nada.
- R2: La página crece al pintar los grupos (284 líneas). Mitigación: el grupo y su cabecera van en `memory-group.ts`, y la fila de una entrada se escribe una sola vez, como plantilla.
