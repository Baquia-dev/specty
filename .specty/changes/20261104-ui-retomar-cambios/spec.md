---
kind: standard
follows:
  - 20261104-ui-carpeta-perdida
---

# La UI marca los cambios sin conversación y dice cómo retomarlos

## Objetivo

`specty status` ya dice qué cambios que esperan al agente no tienen una conversación en su carpeta: los huérfanos (`orphan`) y los que su conversación dejó (`away`). La UI no: la persona ve el cambio «espera al agente» y no sabe que nadie lo está llevando ni cómo retomarlo. Con este cambio, la fila de la Bandeja lo marca, y la página del cambio muestra cómo retomarlo con cada agente, con un botón para copiar cada orden. Es el AC13 de la épica `20261104-sesiones-con-su-carpeta`, el último que le queda.

## Fuera de alcance

- Refrescar las marcas solo porque pasa el tiempo: el servidor avisa a la UI cuando cambian los archivos de los cambios, y la actividad de las conversaciones no está entre ellos; la marca se actualiza con la siguiente lectura.
- Retomar el cambio desde la UI: la UI no abre agentes, solo dice cómo y lo copia.
- Los cambios sin carpeta, que ya tienen su propia página desde el cambio anterior.

## Supuestos

- A1: El servidor añade a cada registro de un cambio abierto las marcas `orphan` y `away` tal como las calcula `status` (`openChanges`): solo existen cuando el cambio espera al agente.
  - impacto: alto
- A2: Cómo retomarlo, con cada agente, es la orden que abre ese agente en la carpeta del cambio, la misma que propone `specty new` (Codex con `codex -C`, OpenCode, Cursor, y Gemini CLI y Antigravity tras `cd`), y para Claude Code `cd "<carpeta>" && claude`; desde una sesión ya abierta, `EnterWorktree` con `name: "<id>"` en Claude Code y `specty enter <id>` en las demás. Una vez dentro, el agente sigue con `specty next`.
  - impacto: medio
- A3: Las órdenes y sus textos viven en la UI, en español y en inglés, como los demás textos de sus pantallas; copiar usa el portapapeles del navegador y avisa al terminar o si no puede.
- A4: La página de un cambio marcado muestra cómo retomarlo encima de sus pestañas, sin quitarlas: los archivos del cambio están en su carpeta.

## Criterios de aceptación

- AC1: CUANDO un cambio abierto espera al agente y es huérfano, o su conversación salió de su carpeta ENTONCES `GET /api/changes` lo trae con `orphan: true` o con `away` (`tool` y `ago`), y no los trae en un cambio que alguien lleva.
- AC2: CUANDO la UI lista un cambio huérfano o cuya conversación salió de su carpeta ENTONCES su fila en la Bandeja lo marca: «Ninguna conversación lo lleva», o «Su conversación (<agente>) salió de su carpeta».
- AC3: CUANDO la persona abre la página de ese cambio ENTONCES ve, encima de sus pestañas, cómo retomarlo con cada agente (la orden que lo abre en su carpeta y, desde una sesión abierta, `EnterWorktree` o `specty enter`), y que después el agente sigue con `specty next`.
- AC4: CUANDO la persona pulsa el botón de copiar de una orden ENTONCES la orden queda en el portapapeles y la UI lo confirma, o dice que no pudo copiarla.

## Diseño

- CLI: `server/records.ts` añade a cada registro abierto `orphan` y `away` de `openChanges`, por id.
- UI, datos: `orphan` y `away` en `ChangeRecord` y `ChangeView` (`data/records.ts`, `data/views.ts`).
- UI, pantallas: la marca en la fila de la Bandeja (`inbox/inbox-row.ts`); un panel `sp-resume-hints` (`change/resume-hints.ts`) con una línea por agente, su orden y un botón «Copiar»; la página lo muestra encima de las pestañas (`change/change-page.ts`).
- Docs: ARCHITECTURE §15.

## Archivos

- modificar packages/cli/src/server/records.ts — `orphan` y `away` en los registros de los cambios abiertos
- crear packages/cli/test/server-holds.test.ts — las marcas en `GET /api/changes`
- modificar packages/ui/src/data/records.ts — `orphan` y `away` en `ChangeRecord` y `ChangeView`
- modificar packages/ui/src/data/views.ts — las marcas pasan del registro a la vista
- modificar packages/ui/src/inbox/inbox-row.ts — la marca en la fila
- crear packages/ui/src/change/resume-hints.ts — cómo retomarlo con cada agente, con «Copiar»
- modificar packages/ui/src/change/change-page.ts — el panel encima de las pestañas
- crear packages/ui/src/change/resume-hints.test.ts — la marca, el panel y copiar
- modificar docs/ARCHITECTURE.md — las marcas en los registros y en la UI

## Tareas

- [x] T1: El servidor trae las marcas de los cambios sin conversación
  - files: packages/cli/src/server/records.ts, packages/cli/test/server-holds.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server-holds.test.ts test/server-restore.test.ts test/server.test.ts && pnpm --filter @baquia-dev/specty typecheck && pnpm lint
- [x] T2: La marca en la Bandeja y cómo retomarlo en la página, y la documentación
  - files: packages/ui/src/data/records.ts, packages/ui/src/data/views.ts, packages/ui/src/inbox/inbox-row.ts, packages/ui/src/change/resume-hints.ts, packages/ui/src/change/change-page.ts, packages/ui/src/change/resume-hints.test.ts, docs/ARCHITECTURE.md
  - ac: AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/change/resume-hints.test.ts --include src/change/lost-folder.test.ts --include src/change/change-page.test.ts --include src/data/views.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: Calcular las marcas en cada lectura de los cambios cuesta lo que un `status`. Mitigación: el servidor solo vuelve a leer cuando cambian los archivos de los cambios.
- R2: Una orden para un agente cambia de forma en una versión nueva de ese agente. Mitigación: son las mismas que ya propone `specty new`, comprobadas con cada herramienta.
