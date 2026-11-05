---
kind: standard
epic: 20261105-bandeja-por-paginas
slice: C4
---

# La Bandeja pide los terminados al servidor por páginas

## Objetivo

Hoy la única forma de leer los cambios terminados es `GET /api/changes`, que los da todos de una vez (512 registros y 9,5 MB en este repositorio), y el servidor vuelve a leer cada archivado en cada petición. Este primer tramo del corte deja lista la parte del servidor: `GET /api/changes/finished` da los terminados por páginas, buscados y ordenados con las mismas funciones que la Bandeja, que pasan a `@baquia-dev/specty-core/light`, y el servidor guarda en memoria los archivados que ya leyó. La Bandeja busca y ordena con esas funciones de core y, por lo demás, no cambia.

## Fuera de alcance

- La Bandeja por páginas: pedir la página siguiente al llegar al final, «Cargar más», los contadores que cuentan todos los que coinciden, `j` en la última fila y los abiertos antes que los terminados en cada sección (futuro C5).
- Que `GET /api/changes` dé solo los abiertos y los que perdieron su carpeta (futuro C6).
- C5 y C6 se añaden a la épica con un ajuste cuando llegue a aceptación.
- Cambiar lo que responden `GET /api/changes` y `GET /api/changes/<id>`: solo se vuelven más rápidos con la memoria de los archivados.
- Guardar en memoria los cambios abiertos o el commit de cada tarea: se siguen leyendo en cada petición.

## Supuestos

- A1: `GET /api/changes/finished` da una página de los cambios archivados (hechos o cancelados) con `offset` (0 por defecto), `limit` (30; 0 da solo las cuentas), `q`, `phase` (`all` o una fase; una fase abierta no encuentra ninguno), `sort` (`waiting`, `recent`, `title` o `size`; `waiting` por defecto) y `lang` (`es` o `en`, para ordenar por título; por defecto, el idioma del repositorio). Un valor que no entiende toma el de por defecto. Responde `{ records, total, counts, finished, epics }`: los registros de la página, como los da `/api/changes`; cuántos coinciden con la búsqueda y la fase; cuántos hechos y cuántos cancelados coinciden con la búsqueda (`{ done, cancelled }`), para los filtros por fase; cuántos terminados hay sin búsqueda ni fase, para el «X de N» y el resumen de C5; y, por el id de cada épica de los cortes de la página, su título. `finished` y `lang` amplían el A2 de la épica: sin ellos, la Bandeja no sabría el total sin filtros y ordenaría por título distinto que la UI en otro idioma.
  - impacto: alto
- A2: El servidor busca y ordena cada terminado por lo mismo que la Bandeja deriva de él: el título de su spec (o su id), su id, su épica (id, título y corte), su `phaseSince` y su tamaño (`state.size.level` o, sin él, `computeSize` con la configuración por defecto, como `data/views.ts`). El título de la épica de un corte es el de la spec de la épica, abierta en alguna worktree o archivada; si la épica perdió su carpeta, su id, como hace la UI cuando no tiene la épica cargada.
- A3: `@baquia-dev/specty-core/light` y el índice ganan `matchesQuery`, `sortChanges` y los órdenes (`CHANGE_SORTS` y `ChangeSort`), genéricos sobre los campos que leen, y la Bandeja deja sus copias de `inbox/inbox-view.ts` e importa estas. `matchesQuery` compara con `fold`, que ya está en core y además junta los espacios, en lugar de un `folded` nuevo. `sortChanges` desempata por id, para que el orden de las páginas del servidor y el de la Bandeja coincidan siempre; hasta ahora, dos cambios empatados quedaban en el orden en que llegaban.
  - impacto: alto
- A4: El servidor guarda en memoria, mientras vive su sesión, cada cambio archivado que leyó, por su carpeta, y lo que deriva de él para buscar y ordenar. Solo vuelve a leerlo si cambia la hora de modificación de su `state.json`. Un archivado cuyo estado no se puede leer no se guarda, para intentarlo de nuevo la próxima vez. Es el A5 de la épica, con esa comprobación barata por si un cierre reescribe el estado. La usan también `/api/changes`, `/api/changes/<id>` y los demás lectores de `changeRecords`, que responden lo mismo que antes.
- A5: Como en `/api/changes`, cada cambio sale una vez: un archivado cuyo id está abierto en alguna worktree no sale entre los terminados, y de un id archivado en varias worktrees vale el de la carpeta principal. El commit de cada tarea se añade solo a los registros de la página.

## Criterios de aceptación

- AC1: CUANDO el navegador con la sesión pide `GET /api/changes/finished` sin parámetros ENTONCES recibe los 30 primeros cambios archivados en el orden de lo que más espera, con `total`, `counts` (hechos y cancelados), `finished` y el título de la épica de sus cortes en `epics`; sin la sesión, recibe 403.
- AC2: CUANDO la petición lleva `offset` y `limit` ENTONCES recibe esa página; CUANDO lleva `q` ENTONCES solo los que lo tienen en el título, el id o en el id, el título o el corte de su épica, sin mayúsculas ni acentos; CUANDO lleva `phase` ENTONCES solo los de esa fase; CUANDO lleva `sort` ENTONCES en ese orden; CUANDO un valor no se entiende ENTONCES vale el de por defecto.
- AC3: CUANDO el servidor ya leyó un cambio archivado ENTONCES lo da en las peticiones siguientes, de `/api/changes/finished` y de `/api/changes`, sin volver a leer sus archivos mientras su `state.json` no cambie, y lee los que aparecen nuevos en el archivo.
- AC4: CUANDO se busca un texto con `matchesQuery` de `@baquia-dev/specty-core/light` ENTONCES encuentra los cambios que lo tienen en el título, el id o en el id, el título o el corte de su épica, sin mayúsculas ni acentos; CUANDO se ordenan con `sortChanges` ENTONCES quedan por lo que más espera, lo más reciente, el título o el tamaño, y por id cuando empatan.
- AC5: CUANDO se busca o se ordena en la Bandeja ENTONCES encuentra y ordena con las funciones de core, como el servidor: sin mayúsculas ni acentos y, cuando dos cambios empatan, por su id.

## Diseño

- Core, `packages/core/src/listing.ts` (nuevo): `matchesQuery(change, query)` sobre `{ id, title, epic?: { id, title, slice? } }` y `sortChanges(changes, sort, lang)` sobre `{ id, title, phaseSince, size?: { level } }`, con `CHANGE_SORTS` y `ChangeSort`. Solo importa tipos de `sizing/` y `fold` de `i18n.ts`, así la entrada ligera sigue sin el parser (lo comprueba `light.test.ts`). Se exporta en `index.ts` y en `light.ts`.
- CLI, `server/records.ts`: `changeRecords` se apoya en `archivedRecords(session)`, los archivados de cada worktree, la principal primero, una vez cada id y sin los commits, con la memoria de A4 en un `WeakMap` por sesión, y en `withTaskCommits(session, records)`, que añade el commit de cada tarea. Su respuesta no cambia.
- CLI, `server/finished.ts` (nuevo): `finishedPage(session, params)` lee los parámetros (A1); toma los archivados que no están abiertos (`locateChanges`), el resumen de cada uno para buscar y ordenar (guardado por registro) y los títulos de las épicas abiertas y archivadas; filtra con `matchesQuery` y la fase, cuenta, ordena con `sortChanges`, corta la página y le añade los commits.
- CLI, `server/http.ts`, solo el enganche: las lecturas de `VIEWS` reciben también los parámetros de la URL, y `/api/changes/finished` va a `finishedPage`, antes que `/api/changes/<id>`.
- UI, `inbox/inbox-view.ts`: importa `matchesQuery` y `sortChanges` de core y quita `folded`, `matchesQuery` y su `sortChanges`; `InboxSort` e `INBOX_SORTS` son `ChangeSort` y `CHANGE_SORTS`.
- Docs: `docs/ARCHITECTURE.md` §15, la ruta `/api/changes/finished` y la memoria de los archivados.

## Archivos

- crear packages/core/src/listing.ts — `matchesQuery`, `sortChanges` y los órdenes, compartidos por la UI y el servidor
- modificar packages/core/src/index.ts — exporta la búsqueda y el orden de los cambios
- modificar packages/core/src/light.ts — exporta la búsqueda y el orden en la entrada ligera
- crear packages/core/test/listing.test.ts — los tests de la búsqueda y del orden, desde la entrada ligera
- modificar packages/cli/src/server/records.ts — los archivados en memoria y el commit de las tareas aparte
- crear packages/cli/src/server/finished.ts — la página de terminados: parámetros, búsqueda, orden, cuentas y épicas
- modificar packages/cli/src/server/http.ts — el enganche de `/api/changes/finished`
- crear packages/cli/test/server/finished.test.ts — los tests de `/api/changes/finished` y de la memoria de los archivados
- modificar packages/ui/src/inbox/inbox-view.ts — la búsqueda y el orden de core, sin sus copias
- modificar packages/ui/src/inbox/inbox-view.test.ts — importa la búsqueda y el orden de core, y prueba el desempate por id
- modificar docs/ARCHITECTURE.md — §15: la ruta `/api/changes/finished` y la memoria de los archivados

## Tareas

- [x] T1: Core busca y ordena los cambios para la UI y el servidor
  - files: packages/core/src/listing.ts, packages/core/src/index.ts, packages/core/src/light.ts, packages/core/test/listing.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/listing.test.ts test/light.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint
- [x] T2: El servidor da los terminados por páginas y recuerda los archivados
  - files: packages/cli/src/server/records.ts, packages/cli/src/server/finished.ts, packages/cli/src/server/http.ts, packages/cli/test/server/finished.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server/finished.test.ts test/server.test.ts test/server/records.test.ts && pnpm --filter @baquia-dev/specty typecheck && pnpm lint
- [x] T3: La Bandeja busca y ordena con las funciones de core
  - files: packages/ui/src/inbox/inbox-view.ts, packages/ui/src/inbox/inbox-view.test.ts
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/inbox/inbox-view.test.ts --include src/inbox/inbox.test.ts && pnpm typecheck && pnpm lint && pnpm knip

## Riesgos

- R1: Un archivado guardado en memoria podría quedar viejo si algo reescribe su carpeta sin tocar `state.json`. Mitigación: el archivo solo se escribe al archivar (estado y auditoría antes de mover la carpeta) o al incorporar la rama, y la memoria se descarta si cambia la hora de `state.json`.
- R2: `server/http.ts` ya tiene 302 líneas de código (P163). Mitigación: la página va en `server/finished.ts` y en http.ts solo queda el enganche.

## Cierre

### Resumen

El servidor local da los cambios terminados por páginas con `GET /api/changes/finished` (`server/finished.ts`). Admite `offset`, `limit` (30 por defecto; 0 da solo las cuentas), `q`, `phase`, `sort` y `lang`, y responde `{ records, total, counts, finished, epics }`. Los registros salen como en `/api/changes`, con el commit de sus tareas, y llevan el título de la épica de cada corte. Busca y ordena con `matchesQuery` y `sortChanges`, que pasan a core (`core/src/listing.ts`) y se exportan en `index.ts` y en `@baquia-dev/specty-core/light`. La Bandeja usa ahora esas mismas funciones y quita sus copias de `inbox/inbox-view.ts`. El servidor guarda en memoria cada archivado que leyó, por su carpeta, mientras su `state.json` no cambie (`archivedRecords` en `server/records.ts`), y también lo que deriva de él para buscar y ordenar. `/api/changes`, `/api/changes/<id>` y el MCP App responden lo mismo que antes, pero más rápido. `http.ts` solo engancha la ruta en `VIEWS`. ARCHITECTURE §15 cuenta la ruta y la memoria.

### Desviaciones

- El corte C4 de la épica salió XL en `specty propose`: 23 archivos gobernados en core, CLI y UI, y 6 tareas. La persona eligió dividirlo en tres tramos. Este, el primero, cubre solo core y el servidor: la búsqueda y el orden compartidos, `GET /api/changes/finished` y la memoria de los archivados. `/api/changes` no cambia, así que la Bandeja de main sigue igual.
- Los criterios AC7–AC9 de la épica quedan para dos cortes nuevos, que el agente principal añade a la épica con un ajuste cuando llegue a aceptación. C5: la Bandeja pide los terminados por páginas (al llegar al final, «Cargar más», `j` en la última fila), con los contadores de todos los que coinciden y los abiertos antes que los terminados en cada sección (A4 de la épica). C6: `GET /api/changes` da solo los abiertos y los que perdieron su carpeta.
- La respuesta amplía el A2 de la épica con `finished` (los terminados sin búsqueda ni fase, para el «X de N» y el resumen de C5) y con el parámetro `lang` (para ordenar por título como la UI en su idioma). `limit=0` da solo las cuentas.

### Decisiones

- `matchesQuery` compara con `fold`, que ya estaba en core y además junta los espacios, en lugar de mover `folded`. `sortChanges` desempata por id, para que las páginas del servidor y la Bandeja tengan siempre el mismo orden. Antes, dos cambios empatados quedaban en el orden en que llegaban.
- La memoria de los archivados vive en un `WeakMap` por sesión y comprueba la hora de modificación de `state.json`, por si un cierre o una incorporación reescriben el estado. No guarda un archivado que no se puede leer. El resumen para buscar y ordenar se guarda en otro `WeakMap`, por registro.
- `phase` admite cualquier fase: una abierta no encuentra ningún terminado, pero las cuentas siguen siendo las de la búsqueda, para los filtros por fase de C5. Un valor que no se entiende toma el de por defecto, en lugar de responder 400.
- Un archivado cuyo id está abierto en alguna worktree no sale entre los terminados. Un id archivado en varias worktrees sale una vez, con el de la carpeta principal. El título de una épica abierta se lee de su spec con `locateChanges`; el de una épica que perdió su carpeta es su id.
- Las lecturas de `VIEWS` reciben también los parámetros de la URL. Así `/api/changes/finished` es una entrada más del mapa y `http.ts` no crece con otra función.

### Pendientes

- Ninguno nuevo. `server/http.ts` sigue en unas 303 líneas de código, sobre el aviso de 300 (P163, ya en la memoria).
