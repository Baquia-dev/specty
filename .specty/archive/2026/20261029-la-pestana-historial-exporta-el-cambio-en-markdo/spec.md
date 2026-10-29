---
kind: standard
allowedDependencies:
  - "@baquia-dev/specty-exporters"
---

# La pestaña Historial exporta el cambio en Markdown, JSON, OpenSpec, Spec Kit y Kiro

## Objetivo

La pestaña Historial muestra la línea de tiempo, pero para llevarse el cambio hay que ir a la terminal (`specty audit`, `specty export`). Un menú «Exportar» en la pestaña descarga el informe de auditoría en Markdown o en JSON, o la spec en OpenSpec, Spec Kit o Kiro, igual que esos comandos.

## Fuera de alcance

- La vista de trazabilidad: va en su propio cambio.
- Exportar varios cambios a la vez, o desde la Bandeja.
- Escribir la exportación en `.specty/exports/` del repositorio: la UI la descarga.

## Supuestos

- A1: La UI genera la exportación ella misma, con `auditViewOf` y `auditReport` de core y `exportContextOf` y `exportSpec` de los exportadores, a partir del registro del cambio que le da la fuente (la spec, el estado con los commits de las tareas y la auditoría). Así sale lo mismo que en la CLI, y funciona con el servidor local, con el prototipo y con la webview de VS Code que vendrá.
  - impacto: alto
- A2: Los formatos de varios archivos (OpenSpec, Spec Kit y Kiro) se descargan en un `.zip` sin comprimir que escribe la propia UI, con las rutas que daría `specty export`; un solo archivo se descarga tal cual.
  - impacto: medio
- A3: El JSON es el mismo dato que `specty audit --json`, con sangría de dos espacios para leerlo.

## Criterios de aceptación

- AC1: CUANDO la persona elige «Exportar» y después Markdown o JSON ENTONCES descarga el informe de auditoría del cambio, el mismo de `specty audit`, como `<id>.md` o `<id>.json`.
- AC2: CUANDO elige OpenSpec, Spec Kit o Kiro ENTONCES descarga `<id>-<formato>.zip` con los archivos que escribiría `specty export --to <formato>`.
- AC3: CUANDO la fuente ya no tiene el cambio, o no puede darlo ENTONCES un aviso lo dice y no se descarga nada.

## Diseño

- `data/export.ts`: `exportOf(record, choice, lang)` devuelve el nombre, el tipo y el contenido de la descarga.
- `data/zip.ts`: `zip(files)` escribe un ZIP sin comprimir (CRC-32, nombres en UTF-8).
- `history/history-export.ts` (`sp-history-export`): el `sp-menu` «Exportar» con los cinco formatos; al elegir, pide los cambios a la fuente, toma el suyo y descarga con un enlace `download`; si falla, un aviso.
- `history-tab.ts` lo pone a la derecha de los filtros, también sin eventos, cuando recibe el id del cambio; `change-page.ts` se lo pasa.

## Archivos

- modificar packages/ui/package.json — depende de los exportadores
- modificar pnpm-lock.yaml — la dependencia nueva
- crear packages/ui/src/data/export.ts — el informe o la spec en el formato elegido
- crear packages/ui/src/data/export.test.ts — los cinco formatos, como en la CLI
- crear packages/ui/src/data/zip.ts — el ZIP sin comprimir
- crear packages/ui/src/data/zip.test.ts — sus entradas, contenidos y CRC
- crear packages/ui/src/history/history-export.ts — el menú «Exportar» y la descarga
- crear packages/ui/src/history/history-export.test.ts — elegir un formato y descargar, o el aviso
- modificar packages/ui/src/history/history-tab.ts — el menú junto a los filtros
- modificar packages/ui/src/change/change-page.ts — el id del cambio para el menú
- modificar docs/ui.md — la exportación hecha

## Tareas

- [x] T1: La exportación en cada formato y el ZIP
  - files: packages/ui/package.json, pnpm-lock.yaml, packages/ui/src/data/export.ts, packages/ui/src/data/export.test.ts, packages/ui/src/data/zip.ts, packages/ui/src/data/zip.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/export.test.ts --include src/data/zip.test.ts && pnpm lint
- [x] T2: El menú «Exportar» de la pestaña Historial
  - files: packages/ui/src/history/history-export.ts, packages/ui/src/history/history-export.test.ts, packages/ui/src/history/history-tab.ts, packages/ui/src/change/change-page.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/history/history-export.test.ts --include src/history/history-tab.test.ts && pnpm --filter @baquia-dev/specty-ui typecheck && pnpm lint && pnpm knip
- [x] T3: Documentar la exportación
  - files: docs/ui.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Cierre

### Resumen

La pestaña Historial tiene un menú «Exportar» (`history/history-export.ts`) a la derecha de los filtros, también sin eventos. Descarga el informe de auditoría del cambio en Markdown o JSON, el mismo de `specty audit`, o la spec en OpenSpec, Spec Kit o Kiro en un `.zip` con los archivos de `specty export`. La UI lo genera ella misma (`data/export.ts`) con `auditViewOf`, `auditReport`, `exportContextOf` y `exportSpec`, a partir del cambio tal como lo tiene la fuente, y escribe el `.zip` sin comprimir con `data/zip.ts` (comprobado con `unzip -t`). Si la fuente no tiene o no puede dar el cambio, un aviso lo dice y no se descarga nada.

### Desviaciones

- `data/export.ts` entró en T2 (S1): la lista de formatos pasó al menú y el módulo solo exporta su tipo.
- El bundle inicial de la UI pasa de 521 a 740 kB: el parser y el informe de core entran en un chunk compartido que carga `main`, porque el hilo principal importa core por su índice. Cargarlo bajo demanda con `import()` no bastaba (el mismo chunk compartido) y además hacía inestable el test bloqueado. Lo arregla el cambio siguiente, «El hilo principal de la UI importa core por una entrada ligera», ya creado.

### Decisiones

- La exportación se genera en la UI, no en el servidor: sale igual que en la CLI y sirve para cualquier fuente (servidor, prototipo, la webview de VS Code y MCP Apps).
- El menú lista los formatos por su nombre, igual en los dos idiomas; el JSON lleva sangría de dos espacios.

### Pendientes

- La entrada ligera de core para el hilo principal, que devuelve el bundle inicial a su tamaño.
- La vista de trazabilidad.
