---
kind: standard
---

# El servidor muestra el cambio cuya configuración no puede leer

## Objetivo

Un servidor de `specty ui` arrancado con un CLI más viejo que el que escribió la `.specty/config.yaml` de una worktree (una clave que su esquema estricto no conoce, como `verify.units` con un servidor del 2026-11-04) deja fuera el cambio de esa worktree sin decir nada: la Bandeja no lo muestra y la persona no sabe por qué (P160). Con este cambio, el servidor da ese cambio con los errores de su configuración, la Bandeja lo marca y su página dice que no se pudo leer la configuración de su carpeta: si la escribió un Specty más nuevo, hay que reiniciar `specty ui`, y si no, corregirla. Los comandos y el guard siguen juzgando esa carpeta como hoy.

## Fuera de alcance

- Dar a los comandos o al guard una configuración de reserva en una carpeta cuya configuración no pueden leer: siguen rechazando con su error.
- Comparar la versión del CLI del servidor con la de otra carpeta para decir cuál es más nueva.
- El diff, la traza y la verificación de ese cambio desde la UI, que buscan su carpeta con una sesión: siguen sin encontrarlo. Sus acciones ejecutan el comando, que lo rechaza con el error de la configuración.
- La vista del cambio en el chat (MCP App, `specty_view`).

## Supuestos

- A1: El servidor muestra el cambio con los errores de su configuración en lugar de detectar que su CLI es más viejo: no puede saber si una clave desconocida es de un Specty más nuevo o una errata, así que el texto de la página dice las dos salidas. Es la primera de las dos que propone P160.
  - impacto: alto
- A2: Sin configuración no se abre una sesión en esa carpeta, así que el cambio de la worktree es el abierto de su `.specty/changes/` cuyo `state.branch` es la rama de la worktree, la última búsqueda de `changeOfBranch`. Se lee con los archivos de su carpeta como cualquier otro, sin `verifyFull`, sin los tests de sus criterios y sin las marcas de huérfano, que necesitan esa sesión.
- A3: Cada error va como `ruta: mensaje`, como lo imprime la CLI al rechazar una configuración (`program.ts`), y solo el mensaje cuando la ruta está vacía, como con una clave desconocida en la raíz.
- A4: La huella del servidor incluye la hora y el tamaño de la `.specty/config.yaml` de cada worktree, para que corregirla actualice la Bandeja y la página sin esperar a otro cambio de archivos.
- A5: Los textos de la fila y de la página van en sus plantillas con `t()`, en español y en inglés, como las demás marcas de la Bandeja («Sin carpeta», «Ninguna conversación lo lleva»): el servidor solo da los errores, como datos.

## Criterios de aceptación

- AC1: CUANDO la `.specty/config.yaml` de la worktree de un cambio abierto tiene una clave que el CLI del servidor no conoce ENTONCES `GET /api/changes` y `GET /api/changes/<id>` dan ese cambio, con su spec, su estado y su carpeta, y `configIssues` con cada error de esa configuración; los cambios cuya configuración se lee no llevan `configIssues`.
- AC2: CUANDO se ejecuta un comando de Specty en esa carpeta ENTONCES lo sigue rechazando con el error de su configuración, como hoy.
- AC3: CUANDO cambia la `.specty/config.yaml` de una worktree ENTONCES cambia la huella del servidor, así que `/api/events` emite `changes`.
- AC4: CUANDO la Bandeja muestra un cambio con `configIssues` ENTONCES su fila lleva la marca «Su configuración no se pudo leer», y solo la suya.
- AC5: CUANDO se abre la página de ese cambio ENTONCES su cabecera dice que no se pudo leer la configuración de su carpeta, que si la escribió un Specty más nuevo que el del servidor hay que reiniciar `specty ui` y si no, corregirla, y cita cada error.

## Diseño

- CLI `flow/changes.ts`: `unreadableChanges(session)`, el cambio abierto de cada worktree, salvo la de la sesión, cuya configuración no se puede leer (`loadConfig` da `invalid`), con su carpeta y sus errores. `locateChanges` no cambia.
- CLI `server/records.ts`: `ChangeRecord.configIssues`. `openOnes` añade esos cambios tras los de `locateChanges` y antes de los que perdieron su carpeta, leídos con `readRecord` y con sus errores; como los demás, cada id una vez. `openRecords` y `changeRecords` los heredan.
- CLI `server/events.ts`: `fingerprint` añade la hora y el tamaño de la `.specty/config.yaml` de cada worktree.
- UI `data/records.ts`: `configIssues` en `ChangeRecord` y en `ChangeView`; `data/views.ts` lo pasa del registro a la vista.
- UI `inbox/inbox-row.ts`: la marca `data-config`, como la de «Sin carpeta».
- UI `change/change-page.ts`: tras los problemas de la cabecera, la nota `data-config-issues`, con la frase en `data-config-hint` y cada error en un `data-config-issue`.
- Docs: `docs/ARCHITECTURE.md` §15, el cambio con `configIssues` en `GET /api/changes` y la configuración en la firma de `/api/events`.

## Archivos

- modificar packages/cli/src/flow/changes.ts — `unreadableChanges`: los cambios de las worktrees cuya configuración no se lee
- modificar packages/cli/src/server/records.ts — esos cambios en la lista, con `configIssues`
- modificar packages/cli/src/server/events.ts — la configuración de cada worktree en la huella
- crear packages/cli/test/server/unreadable-config.test.ts — los tests del servidor y de los comandos (AC1–AC3)
- modificar packages/ui/src/data/records.ts — `configIssues` en el registro y en la vista
- modificar packages/ui/src/data/views.ts — la vista lleva los errores del registro
- modificar packages/ui/src/inbox/inbox-row.ts — la marca de la fila
- modificar packages/ui/src/change/change-page.ts — la nota de la cabecera
- crear packages/ui/src/change/unreadable-config.test.ts — los tests de la Bandeja y de la página (AC4, AC5)
- modificar docs/ARCHITECTURE.md — §15: el cambio con `configIssues` y la configuración en la firma

## Tareas

- [x] T1: El servidor da el cambio cuya configuración no puede leer, con sus errores
  - files: packages/cli/src/flow/changes.ts, packages/cli/src/server/records.ts, packages/cli/src/server/events.ts, packages/cli/test/server/unreadable-config.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server/unreadable-config.test.ts && pnpm --filter @baquia-dev/specty typecheck && pnpm lint
- [ ] T2: La Bandeja y la página del cambio dicen que su configuración no se pudo leer
  - files: packages/ui/src/data/records.ts, packages/ui/src/data/views.ts, packages/ui/src/inbox/inbox-row.ts, packages/ui/src/change/change-page.ts, packages/ui/src/change/unreadable-config.test.ts
  - ac: AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/change/unreadable-config.test.ts && pnpm typecheck && pnpm lint
- [ ] T3: ARCHITECTURE cuenta el cambio cuya configuración no se lee
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: grep -q "configIssues" docs/ARCHITECTURE.md
  - type: docs
