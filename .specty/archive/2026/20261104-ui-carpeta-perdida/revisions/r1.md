---
kind: standard
epic: 20261104-sesiones-con-su-carpeta
slice: C3
---

# La UI muestra los cambios sin carpeta o sin conversación y recupera la carpeta

## Objetivo

Desde el corte C2, la terminal ve los cambios abiertos cuya carpeta se perdió y los recupera con `specty restore <id>`. La UI aún no: el servidor deja fuera un cambio sin carpeta, porque lee sus archivos de una carpeta que no existe, y la persona no lo ve en la Bandeja. Con este cambio, el cambio sale en la Bandeja con la marca «Sin carpeta», y su página explica qué pasó y ofrece el botón «Recuperar carpeta», que hace lo mismo que `specty restore`, junto al comando de terminal equivalente. Es la parte central del corte C3 de la épica `20261104-sesiones-con-su-carpeta`: AC11 y AC12.

## Fuera de alcance

- La marca de los cambios que esperan al agente sin una conversación en su carpeta, con cómo retomarlos con cada agente (AC13 de la épica): va en el cambio de la épica que sigue a este.
- Las pestañas (Spec, Progreso, Aceptación, Historial) de un cambio sin carpeta: sus archivos solo están en la rama, y la página muestra la recuperación en su lugar (A10 de la épica).
- Refrescar la Bandeja cuando una carpeta desaparece sin que cambie nada más: el servidor avisa a la UI cuando cambian los archivos de los cambios; borrar o recuperar una carpeta ya los cambia.
- El modo sin worktrees (P77 de la memoria).

## Supuestos

- A1: El servidor añade a los registros de cambios (`changeRecords`) los de `lostChanges`, con la spec y el estado leídos de la punta de su rama, `lost: true` y sin carpeta. Su fase empezó, para la UI, en la fecha del último commit de la rama.
  - impacto: alto
- A2: «Recuperar carpeta» es una acción `POST /api/changes/<id>/restore` del servidor, con la cookie, la comprobación de origen y el token CSRF de las demás, y en la cola de una acción a la vez. Ejecuta `restore` de `commands/restore.ts`, el mismo código que el comando, y responde 200 con su salida, o 409 con el motivo.
  - impacto: alto
- A3: Recuperar la carpeta no decide nada sobre permisos, pero la UI solo lo ofrece cuando el servidor admite acciones (lo arrancó la persona); en modo de solo lectura, el botón dice por qué no está disponible, como las decisiones.
- A4: Tras recuperarla, la UI no hace nada especial: el servidor avisa de que cambiaron los archivos (la carpeta nueva) y la Bandeja y la página vuelven a leer el cambio, ya con su carpeta.
- A5: Los textos de la UI van en la propia UI, en español y en inglés, como los demás de sus pantallas.

## Criterios de aceptación

- AC1: CUANDO un cambio abierto no tiene carpeta y su rama sigue ENTONCES `GET /api/changes` lo trae con su spec y su estado, `lost: true` y sin carpeta.
- AC2: CUANDO la persona pulsa «Recuperar carpeta» ENTONCES el servidor, con la cookie, el origen y el token CSRF, recupera la carpeta como `specty restore` y responde 200; sin ellos, responde 403 sin tocar nada, y si la recuperación no puede, 409 con el motivo.
- AC3: CUANDO la UI lista los cambios y uno abierto no tiene carpeta ENTONCES su fila en la Bandeja lleva la marca «Sin carpeta».
- AC4: CUANDO la persona abre la página de un cambio sin carpeta ENTONCES en lugar de sus pestañas ve qué pasó (la carpeta se perdió, el cambio sigue en su rama y lo no confirmado en ella no vuelve), el botón «Recuperar carpeta» y el comando de terminal equivalente, `specty restore <id>`.
- AC5: CUANDO la persona pulsa «Recuperar carpeta» ENTONCES la UI muestra que la carpeta se recuperó o, si no pudo, el motivo que dio el servidor; en modo de solo lectura, el botón dice por qué no está disponible.

## Diseño

- CLI: `LostChange` lleva también el texto de la spec (`flow/lost.ts`). `server/records.ts` añade los registros de los cambios sin carpeta, con `lost`. `server/http.ts` añade la ruta de `restore` en la cola de acciones.
- UI, datos: `lost` en `ChangeRecord` y `ChangeView` (`data/records.ts`, `data/views.ts`); `restoreFolder(change)` en `SpectyData` (`data/source.ts`, que lo rechaza en solo lectura) y en el origen del servidor (`data/server.ts`).
- UI, pantallas: la marca en la fila de la Bandeja (`inbox/inbox-row.ts`); un panel `sp-lost-folder` (`change/lost-folder.ts`) con el texto, el botón (con su estado de carga y el aviso del resultado, como el de confirmar el cierre) y el comando; la página del cambio lo muestra en lugar de las pestañas (`change/change-page.ts`).
- Docs: ARCHITECTURE §15 (el registro con `lost` y la acción del servidor).

## Archivos

- modificar packages/cli/src/flow/lost.ts — el texto de la spec en `LostChange`
- modificar packages/cli/src/server/records.ts — los cambios sin carpeta como registros con `lost`
- modificar packages/cli/src/server/http.ts — la acción `POST /api/changes/<id>/restore`
- crear packages/cli/test/server-restore.test.ts — los registros y la acción de punta a punta
- modificar packages/ui/src/data/records.ts — `lost` en `ChangeRecord` y `ChangeView`
- modificar packages/ui/src/data/views.ts — `lost` pasa del registro a la vista
- modificar packages/ui/src/data/source.ts — `restoreFolder`, rechazado en solo lectura
- modificar packages/ui/src/data/server.ts — `restoreFolder` con el servidor
- crear packages/ui/src/data/lost-folder.test.ts — `lost` en la vista y `restoreFolder` con el servidor y en solo lectura
- modificar packages/ui/src/inbox/inbox-row.ts — la marca «Sin carpeta»
- crear packages/ui/src/change/lost-folder.ts — el panel de la recuperación
- modificar packages/ui/src/change/change-page.ts — el panel en lugar de las pestañas
- crear packages/ui/src/change/lost-folder.test.ts — la marca, el panel y el botón
- modificar docs/ARCHITECTURE.md — el registro con `lost` y la acción del servidor

## Tareas

- [ ] T1: El servidor trae los cambios sin carpeta y recupera su carpeta
  - files: packages/cli/src/flow/lost.ts, packages/cli/src/server/records.ts, packages/cli/src/server/http.ts, packages/cli/test/server-restore.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server-restore.test.ts test/server.test.ts test/restore.test.ts && pnpm --filter @baquia-dev/specty typecheck && pnpm lint
- [ ] T2: `lost` y `restoreFolder` en los datos de la UI
  - files: packages/ui/src/data/records.ts, packages/ui/src/data/views.ts, packages/ui/src/data/source.ts, packages/ui/src/data/server.ts, packages/ui/src/data/lost-folder.test.ts
  - ac: AC3, AC5
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/lost-folder.test.ts --include src/data/views.test.ts --include src/data/server.test.ts && pnpm lint
- [ ] T3: La marca, el panel y el botón en la UI, y la documentación
  - files: packages/ui/src/inbox/inbox-row.ts, packages/ui/src/change/lost-folder.ts, packages/ui/src/change/change-page.ts, packages/ui/src/change/lost-folder.test.ts, docs/ARCHITECTURE.md
  - ac: AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/change/lost-folder.test.ts --include src/change/change-page.test.ts --include src/inbox/inbox-row.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: Leer las ramas en cada lectura de los cambios hace más lento el servidor con muchas ramas. Mitigación: es la misma lectura que `status` (un proceso de git para todas las ramas marcadas sin carpeta), y el servidor solo vuelve a leer cuando cambian los archivos.
- R2: Una pantalla que espera las carpetas de los cambios recibe uno sin carpeta. Mitigación: `folder` ya es opcional en el registro de la UI, y la página de un cambio sin carpeta no abre sus pestañas.
