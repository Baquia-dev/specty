---
kind: standard
---

# Carpeta y archivos compartidos en la Bandeja

## Objetivo

La Bandeja dice en qué carpeta (worktree) vive cada cambio y avisa cuando dos cambios abiertos piensan tocar el mismo archivo, como `specty approve` y `specty scope add` en la terminal. Así la persona ve dónde trabajar con cada cambio y qué incorporaciones pueden chocar, sin abrir la terminal.

## Fuera de alcance

- Leer `config.yaml` desde la UI.
- Mostrar la carpeta o el aviso en la página del cambio: aquí solo va en la Bandeja.
- Bloquear la aprobación por archivos compartidos.

## Supuestos

- A1: La UI no recibe `config.yaml`, así que decide qué archivos son gobernados con la configuración por defecto (todo salvo la documentación y `.specty/`), igual que ya hace con el tamaño. En un proyecto con `governed` o `ignored` propios, el aviso puede diferir del de la terminal.
- A2: En la fila basta con la carpeta acortada a sus dos últimos tramos (`specty.worktrees/<id>`), con la ruta completa en el `title`.

## Criterios de aceptación

- AC1: CUANDO la UI lee los cambios del servidor ENTONCES cada vista trae la carpeta donde vive el cambio.
- AC2: CUANDO dos cambios abiertos listan un mismo archivo gobernado, en Archivos o en una ampliación aprobada, ENTONCES la vista de cada uno trae ese archivo con los otros cambios que lo listan, con su título. Los globs cuentan en los dos sentidos. Los cambios terminados o cancelados y los archivos no gobernados no cuentan.
- AC3: CUANDO la Bandeja muestra un cambio ENTONCES su fila dice su carpeta, acortada y con la ruta completa en el `title`. Si comparte archivos, muestra además un aviso con los archivos y los otros cambios.
- AC4: CUANDO alguien lee el documento de la UI ENTONCES encuentra la carpeta y el aviso de archivos compartidos en la Bandeja.

## Diseño

- `ChangeRecord.folder` recoge lo que ya envía el servidor, y `ChangeView.folder` lo pasa a la vista.
- `data/shared.ts` calcula, sobre todos los registros, los archivos que comparten los cambios abiertos, con la regla de `cli/flow/shared.ts`: `listed` de la spec más las ampliaciones aprobadas, `isGoverned` con `DEFAULT_CONFIG` y `matchesAny` en los dos sentidos. `deriveViews` lo añade como `ChangeView.shared`.
- `InboxRow` muestra la carpeta en una línea atenuada y monoespaciada, y el aviso en el tono de atención: «Comparte <archivos> con «<título>»».

## Archivos

- modificar packages/ui/src/data/records.ts — `folder` en el registro y en la vista, y `shared` en la vista
- crear packages/ui/src/data/shared.ts — los archivos que comparten los cambios abiertos
- crear packages/ui/src/data/shared.test.ts — tests de los archivos compartidos
- modificar packages/ui/src/data/views.ts — `folder` y `shared` en cada vista
- modificar packages/ui/src/data/views.test.ts — tests de la derivación
- modificar packages/ui/src/inbox/inbox-row.ts — la carpeta y el aviso en la fila
- crear packages/ui/src/inbox/inbox-row.test.ts — tests de la fila
- modificar docs/ui.md — la Bandeja con la carpeta y el aviso

## Tareas

- [x] T1: La carpeta y los archivos compartidos en la vista
  - files: packages/ui/src/data/records.ts, packages/ui/src/data/shared.ts, packages/ui/src/data/shared.test.ts, packages/ui/src/data/views.ts, packages/ui/src/data/views.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data && pnpm sources
- [x] T2: La Bandeja muestra la carpeta y el aviso
  - files: packages/ui/src/inbox/inbox-row.ts, packages/ui/src/inbox/inbox-row.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/inbox && pnpm sources
- [x] T3: Documentar la carpeta y los archivos compartidos en la Bandeja
  - files: docs/ui.md
  - ac: AC4
  - verify: pnpm check
  - type: docs
