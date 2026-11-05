---
kind: standard
epic: 20261105-bandeja-por-paginas
slice: C6
---

# La lista de cambios del servidor solo da los abiertos

## Objetivo

Hoy `GET /api/changes` da los cambios abiertos, los que perdieron su carpeta y también todos los archivados, unos 9,5 MB con 512 registros en este repositorio. Sin embargo, la Bandeja ya toma los terminados por páginas de `GET /api/changes/finished` (C4 y C5). Con este corte, `GET /api/changes` da solo los abiertos y los que perdieron su carpeta, y un terminado llega en su página o por su id. Así, al abrir la Bandeja, el servidor manda todos los abiertos y solo la primera página de terminados (AC7 de la épica).

## Fuera de alcance

- Cambiar lo que responden `GET /api/changes/<id>`, `GET /api/changes/finished`, el diff y la traza de un cambio o `specty_view`.
- Que la paleta de comandos y los tooltips encuentren los terminados que la Bandeja no cargó: la épica lo deja fuera.
- Acelerar `GET /api/changes/<id>`, que sigue leyendo todos los cambios para dar uno.
- Dividir `server/http.ts`, que pasa del aviso de 300 líneas de código (P163).

## Supuestos

- A1: `GET /api/changes` da, en el mismo orden y con la misma forma que hoy, el cambio abierto de cada worktree (y los de esta carpeta sin rama propia) y después los abiertos que perdieron su carpeta. Los archivados solo llegan por `GET /api/changes/finished` y `GET /api/changes/<id>`.
  - impacto: alto
- A2: Los demás lectores de `changeRecords` siguen buscando entre todos los cambios (abiertos, sin carpeta y archivados) y responden lo mismo que antes: `GET /api/changes/<id>`, el diff y la traza de un cambio y `specty_view`. `changeRecords` sigue siendo esa lista completa, y la ruta usa una función nueva, `openRecords`.
- A3: En la UI solo cambia «Exportar» del Historial. Buscaba el cambio en `changes()`, así que con el servidor dejaría de encontrar un terminado. Pasa a pedirlo con `SpectyData.change(id)`: con el servidor es `GET /api/changes/<id>`, y las demás fuentes lo buscan entre los que dan. La Bandeja ya toma los terminados solo de sus páginas (C5) y la página de un cambio lo pide por su id (C3). La paleta y los tooltips ven los cargados, como dice la épica.
- A4: Las fuentes de prueba de la UI que dan todos los cambios en `changes()` (`inbox/inbox-more.test.ts` y `data/finished-pages.test.ts`) se quedan así: prueban que la Bandeja no toma los terminados de `changes()`, como el prototipo y el MCP App, que los siguen dando. Solo cambia su comentario, que habla de `/api/changes` «antes de C6».

## Criterios de aceptación

- AC1: CUANDO el navegador con la sesión pide `GET /api/changes` ENTONCES recibe los cambios abiertos de cada worktree y después los que perdieron su carpeta, y ningún archivado.
- AC2: CUANDO se pide un cambio archivado por su id, con `GET /api/changes/<id>` o su diff (`GET /api/changes/<id>/diff`), ENTONCES el servidor lo encuentra como antes: el registro es el mismo que da su página de `GET /api/changes/finished`.
- AC3: CUANDO se exporta desde el Historial un cambio que la fuente no da en `changes()` pero sí por su id, como un terminado con el servidor local, ENTONCES se descarga igual.

## Diseño

- CLI, `server/records.ts`: `openRecords(session)` da los abiertos de cada worktree y los que perdieron su carpeta, cada id una vez, con el commit de sus tareas, las marcas de quién los lleva y, en aceptación, los tests de cada criterio. `changeRecords(session)` da esos y, después, los archivados que no están abiertos, como hoy. Las dos comparten la lectura de los abiertos y el completado de los registros.
- CLI, `server/http.ts`: la entrada `/api/changes` de `VIEWS` pasa a `openRecords`, con su import; el archivo no crece.
- CLI, `mcp/app.ts`: solo el comentario de `ViewData`, que da el registro «como `/api/changes/<id>`».
- UI, `history/history-export.ts`: `this.data.change(id)` en lugar de buscar en `changes()`.
- Docs: `docs/ARCHITECTURE.md` §15 (`/api/changes` da los abiertos y los que perdieron su carpeta; `/api/changes/<id>` y `/api/changes/finished` dan los registros con su misma forma; `specty_view`) y `docs/ui.md` (de dónde salen los abiertos de la Bandeja y cómo lee «Exportar» el cambio).

## Archivos

- modificar packages/ui/src/history/history-export.ts — pide el cambio a la fuente por su id
- modificar packages/ui/src/history/history-export.test.ts — exporta un cambio que la fuente da solo por su id
- modificar packages/ui/src/inbox/inbox-more.test.ts — el comentario de su fuente, que ya no describe `/api/changes`
- modificar packages/ui/src/data/finished-pages.test.ts — el comentario de su fuente, que ya no describe `/api/changes`
- modificar packages/cli/src/server/records.ts — `openRecords`, los abiertos y los que perdieron su carpeta; `changeRecords` sigue dando todos
- modificar packages/cli/src/server/http.ts — `/api/changes` sirve `openRecords`
- modificar packages/cli/src/mcp/app.ts — el comentario de lo que da `specty_view`
- modificar packages/cli/test/server.test.ts — la lista sin el archivado; el archivado, por su id y su diff
- modificar packages/cli/test/server-restore.test.ts — la lista con los abiertos y los que perdieron su carpeta, sin archivados
- modificar packages/cli/test/server/finished.test.ts — compara con `/api/changes/<id>` en lugar de con la lista
- modificar docs/ARCHITECTURE.md — §15: lo que da cada ruta de los cambios y `specty_view`
- modificar docs/ui.md — Bandeja y Exportar: de dónde salen los abiertos y el cambio que se exporta

## Tareas

- [ ] T1: «Exportar» del Historial pide el cambio por su id
  - files: packages/ui/src/history/history-export.ts, packages/ui/src/history/history-export.test.ts, packages/ui/src/inbox/inbox-more.test.ts, packages/ui/src/data/finished-pages.test.ts, docs/ui.md
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/history/history-export.test.ts && pnpm lint
- [ ] T2: `GET /api/changes` da solo los abiertos y los que perdieron su carpeta
  - files: packages/cli/src/server/records.ts, packages/cli/src/server/http.ts, packages/cli/src/mcp/app.ts, packages/cli/test/server.test.ts, packages/cli/test/server-restore.test.ts, packages/cli/test/server/finished.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server.test.ts test/server-restore.test.ts test/server/finished.test.ts test/server/diff.test.ts test/server/records.test.ts test/mcp-app-change.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: Otro lector de `/api/changes` podría esperar los archivados. Mitigación: se buscaron todos. En la UI, `ServerData.changes` solo lo usan el almacén de la Bandeja, las fuentes por defecto de `change` y `finished` y «Exportar», que pasa a pedir por id. La extensión de VS Code y los exporters no leen la ruta, y los tests de la CLI que la leen se ajustan aquí.
- R2: `server/http.ts` ya pasa del aviso de 300 líneas de código (P163). Mitigación: solo cambian la función de la entrada de `VIEWS`, su import y un comentario, sin líneas nuevas.
