---
kind: standard
---

# La pestaña Spec de una épica enlaza cada corte con su cambio aunque no esté cargado

## Objetivo

En la pestaña Spec de una épica (`specty ui`), cada corte enlaza con el cambio que lo implementa y muestra su fase aunque la UI no tenga ese cambio cargado, como el corte cerrado de una épica antigua, que hoy se ve sin enlace ni fase (P189). La sección Cortes se lo pide al servidor por una ruta propia, que elige el cambio de cada corte con la regla de la tarjeta de la épica, y `GET /api/changes` sigue igual de ligero. Sin servidor (datos de ejemplo, MCP App), los cortes siguen enlazando con los cambios cargados.

## Fuera de alcance

- Dar los cambios de los cortes en `GET /api/changes` o en `GET /api/changes/<id>`: la UI vuelve a pedir la lista con cada evento `changes`, y cada épica abierta leería entero el archivo en cada lectura.
- Las tarjetas de la spec en la MCP App (`review/spec-cards.ts`): en el chat los cortes van sin enlaces ni fases.
- Decir que un corte aún no ha empezado.

## Supuestos

- A1: Encontrar los cambios de una épica lee las specs del archivo (537 hoy), como ya hace la tarjeta de `specty next` en una épica. Cuesta poco para una petición que solo hace la sección Cortes de una épica, al abrirse y con cada evento de la fuente mientras sigue abierta.
  - impacto: medio
- A2: La ruta encuentra la épica como los comandos (`findChange`): en la carpeta del servidor, abierta en cualquier worktree o archivada en la principal. Una épica cuya carpeta se perdió no se encuentra (404), y sus cortes enlazan con los cambios cargados.
- A3: La respuesta es la lista misma, en el orden de los cortes de la épica y solo con los cortes que tienen un cambio, cada uno con `slice`, `id` y `phase`: es lo que la fila de un corte necesita para el enlace y la fase.
- A4: Mientras el servidor no responde, o si responde con un error o con datos inesperados, la sección usa los cambios cargados, como hasta ahora; cuando responde, solo su respuesta.

## Criterios de aceptación

- AC1: CUANDO la UI pide `GET /api/changes/<id>/slices` de una épica ENTONCES el servidor da, por cada corte que tiene un cambio, el id y la fase de ese cambio: el cerrado o, si no hay, el primero de los demás, sin contar uno cancelado, esté abierto o archivado; de un cambio que no es una épica da una lista vacía, y de un id que no existe, 404.
- AC2: CUANDO la sección Cortes de una épica se abre con el servidor local ENTONCES cada corte enlaza con el cambio que da el servidor y muestra su fase, aunque ese cambio no esté entre los cargados.
- AC3: CUANDO la fuente no da los cambios de los cortes (datos de ejemplo, MCP App) o el servidor responde con un error o con datos inesperados ENTONCES cada corte enlaza con el cambio cargado que lo implementa, como hasta ahora.

## Diseño

- `flow/epic.ts`: exporta `sliceChanges(session, epic, spec)`, el cambio de cada corte que tiene uno, sacado de `sliceViews`, la misma función con la que la tarjeta de la épica elige el cambio de cada corte, y su tipo `SliceChange` (`slice`, `id`, `phase`).
- `server/slices.ts` (nuevo): `epicSliceChanges(session, id)` busca el cambio con `findChange`; si no hay, nada (404); si no es una épica, `[]`; si lo es, `sliceChanges` con su spec.
- `server/api.ts`: `readChange` atiende `/api/changes/<id>/slices` junto a `diff`, `run` y `trace`. Es una lectura, también en el servidor del agente.
- `data/records.ts`: `SliceChangeRecord` (`slice`, `id`, `phase`). `data/source.ts`: `SpectyData.sliceChanges(epic)`, que por defecto no da nada. `data/server.ts`: `ServerData` la lee de la ruta, y `data/server-answers.ts` comprueba la respuesta con `isSliceChanges`.
- `review/spec-sections.ts`: `ReviewItems` inyecta `SpectyData` como opcional (las tarjetas de la MCP App la pintan sin fuente en sus tests) y, solo en la sección `slices` con `epic`, pide `sliceChanges(epic)` con un `resource` y la vuelve a pedir con cada evento de la fuente mientras la sección sigue abierta. `sliceChanges` (el `computed` de las filas) usa la respuesta si la hay y, si no, la regla de hoy sobre `changes` (A4).

## Archivos

- modificar packages/cli/src/flow/epic.ts — exportar el cambio de cada corte de una épica
- crear packages/cli/src/server/slices.ts — los cambios de los cortes de la épica que pide la ruta
- modificar packages/cli/src/server/api.ts — la ruta `GET /api/changes/<id>/slices`
- crear packages/cli/test/server/slices.test.ts — el test de la ruta
- modificar docs/ARCHITECTURE.md — la ruta en §15, y que la sección Cortes la pide
- modificar packages/ui/src/data/records.ts — el tipo de los cambios de los cortes
- modificar packages/ui/src/data/source.ts — `sliceChanges`, que por defecto no da nada
- modificar packages/ui/src/data/server.ts — `sliceChanges` lee la ruta
- modificar packages/ui/src/data/server-answers.ts — la comprobación de la respuesta
- modificar packages/ui/src/review/spec-sections.ts — la sección Cortes pide los cambios de sus cortes y los usa antes que los cargados
- modificar packages/ui/src/review/spec-sections.test.ts — los tests del enlace con lo que da el servidor y de la reserva
- modificar docs/ui.md — de dónde salen el enlace y la fase de cada corte

## Tareas

- [x] T1: El servidor da el cambio de cada corte de una épica
  - files: packages/cli/src/flow/epic.ts, packages/cli/src/server/slices.ts, packages/cli/src/server/api.ts, packages/cli/test/server/slices.test.ts, docs/ARCHITECTURE.md
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server/slices.test.ts && pnpm --filter @baquia-dev/specty typecheck && pnpm lint
  - type: feat
- [ ] T2: La sección Cortes enlaza con lo que da el servidor, con los cargados como reserva
  - files: packages/ui/src/data/records.ts, packages/ui/src/data/source.ts, packages/ui/src/data/server.ts, packages/ui/src/data/server-answers.ts, packages/ui/src/review/spec-sections.ts, packages/ui/src/review/spec-sections.test.ts, docs/ui.md
  - ac: AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch && pnpm typecheck && pnpm lint && pnpm knip
  - type: feat

## Riesgos

- R1: El constructor de los tests de Angular comprueba los tipos de todos los tests a la vez, y los de T2 se escriben antes que su código — los tests nuevos no usan nada que aún no exista: dan a `ReviewItems` un `ServerData` con `fetch` simulado y miran el documento, así que compilan antes de T2 y fallan solo al ejecutarse.
- R2: `SpectyData` gana un método y `ReviewItems` una inyección, y muchos tests extienden la fuente o pintan la sección — el método tiene una implementación por defecto y la inyección es opcional; el `verify` de T2 ejecuta la suite entera de la UI.
