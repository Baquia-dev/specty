---
kind: standard
epic: 20261029-mcp-apps-la-ui-de-specty-en-el-chat-solo-para-ve
slice: C3
---

# La aceptación del cambio se ve en el chat con su verificación y su cierre

## Objetivo

Tercer y último corte de la épica de MCP Apps. Cuando el cambio pasa a aceptación, la vista del chat muestra la pestaña Aceptación con la verificación completa de `specty accept` en vivo y, al final, el cierre. Hoy le faltan dos cosas:
- `specty accept` verifica sin dejar su ejecución en vivo, así que ni el chat ni `specty ui` la ven mientras corre.
- La vista pierde el cambio al cerrarse, porque se archiva y su carpeta desaparece, y tampoco encuentra el que `specty_new` crea en su propia carpeta.

## Fuera de alcance

- Decidir desde el chat, incluido «Ejecutar» la verificación completa: el botón sigue desactivado, con su motivo, como en `specty ui` de solo lectura.
- La última verificación completa de un cambio archivado: su registro no lleva `verify.full`, como hoy en `specty ui`.
- Cambiar lo que reciben los clientes sin MCP Apps.

## Supuestos

- A1: La pestaña Aceptación ya muestra la verificación completa en vivo cuando la fuente se la da por `watchRun` sin tarea, y el cierre en `closing` y `done` (C1 y C2). Este corte solo hace que llegue la verificación de `specty accept` y que la vista no pierda el cambio.
  - impacto: alto
- A2: La verificación de `specty accept` usa el mismo archivo en vivo que la de `specty task done` (`specty/runs/<cambio>.json`), sin `task`. El servidor de `specty ui` ya trata una ejecución sin tarea como la completa, así que también la ve en vivo.
- A3: Con `change`, el servidor busca el cambio entre los abiertos de todas las worktrees y, si no está, en el archivo de la carpeta. Si la carpeta pedida ya no existe, como la worktree de un cambio cerrado, usa la del servidor. Sin `change`, todo sigue como en C2.
  - impacto: alto
- A4: La vista lee el id de la primera línea de la tarjeta, `SPECTY · <id> · <fase>`, que llevan todas las tarjetas de un cambio. Si no la trae, sigue con la carpeta.
- A5: `cli/test/mcp-app.test.ts` (C1 y C2) pasa a admitir `change` en el esquema de `specty_view`, y `ui/src/data/mcp-app.test.ts` (C2) a esperar el id en las preguntas de cada segundo, con el permiso de la persona (2026-10-29).
- A6: En `done` la vista no vuelve a preguntar (C2): un cambio terminado ya no se mueve.

## Criterios de aceptación

- AC1: CUANDO `specty accept` ejecuta la verificación completa ENTONCES la deja en vivo mientras corre, sin tarea, como `specty task done` deja la de su tarea, y la quita al terminar.
- AC2: CUANDO la vista pide `specty_view` con el id de un cambio ENTONCES el servidor da ese cambio aunque viva en otra carpeta del repositorio o ya esté archivado, también si la carpeta pedida ya no existe, y responde que nada cambió si la huella coincide.
- AC3: CUANDO la vista ya muestra un cambio ENTONCES cada pregunta lleva su id, así que al cerrarse lo sigue mostrando, terminado y con su cierre, y deja de preguntar.
- AC4: CUANDO el resultado de una herramienta nombra el cambio en la cabecera de su tarjeta (`SPECTY · <id>`) ENTONCES la vista lee ese cambio por su id, como el que crea `specty_new` en su propia carpeta.

## Diseño

- Verificación en vivo (CLI):
  - `runLive` acepta una tarea indefinida y entonces escribe la ejecución sin `task`.
  - `LiveRun.task` pasa a ser opcional, y `readRuns` acepta las dos formas.
  - `specty accept` verifica con `runLive` en lugar de `execute`, con las mismas opciones.
  - `server/runs.ts` copia la ejecución sin `pid`.
- `specty_view` (`mcp/app.ts`):
  - Acepta `{ folder, since, change }`.
  - Con `change`, abre la sesión en la carpeta o, si no puede, en la del servidor. Busca el cambio con `locateChanges` y, si no está, con `loadChange`.
  - La huella sale de la carpeta del cambio, abierto o archivado.
  - `mcp/tools.ts` añade `change` al esquema, y `commands/mcp.ts` lo pasa.
- UI (`data/mcp-app.ts`):
  - La vista guarda el id del cambio que muestra y lo manda en cada pregunta.
  - El id de la cabecera del resultado de una herramienta tiene preferencia, porque es el cambio que la herramienta acaba de tocar.

## Archivos

- modificar packages/cli/src/commands/accept.ts — la verificación completa con `runLive`
- modificar packages/cli/src/flow/live-run.ts — una ejecución sin tarea
- modificar packages/cli/src/store/runs.ts — `task` opcional
- modificar packages/cli/src/server/runs.ts — copia la ejecución sin `pid`
- crear packages/cli/test/accept-live.test.ts — AC1
- modificar packages/cli/src/mcp/app.ts — el cambio por su id, en otra carpeta o archivado
- modificar packages/cli/src/mcp/tools.ts — `change` en el esquema de `specty_view`
- modificar packages/cli/src/commands/mcp.ts — pasa `change`
- crear packages/cli/test/mcp-app-change.test.ts — AC2
- modificar packages/cli/test/mcp-app.test.ts — el esquema con `change` (A5)
- modificar packages/ui/src/data/mcp-app.ts — el id en cada pregunta y el de la cabecera
- modificar packages/ui/src/data/mcp-app.test.ts — AC3 y AC4, y las preguntas de C2 con el id (A5)
- modificar docs/ARCHITECTURE.md — §6 y la verificación en vivo
- modificar docs/ui.md — la vista en el chat

## Tareas

- [x] T1: `specty accept` deja su verificación completa en vivo
  - files: packages/cli/test/accept-live.test.ts, packages/cli/src/commands/accept.ts, packages/cli/src/flow/live-run.ts, packages/cli/src/store/runs.ts, packages/cli/src/server/runs.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/accept-live.test.ts test/live-run.test.ts && pnpm --filter @baquia-dev/specty typecheck && pnpm lint
- [x] T2: `specty_view` da el cambio por su id, también cerrado o en otra carpeta
  - files: packages/cli/test/mcp-app-change.test.ts, packages/cli/test/mcp-app.test.ts, packages/cli/src/mcp/app.ts, packages/cli/src/mcp/tools.ts, packages/cli/src/commands/mcp.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/mcp-app-change.test.ts test/mcp-app.test.ts test/mcp-app-live.test.ts test/mcp.test.ts && pnpm --filter @baquia-dev/specty typecheck && pnpm lint && pnpm knip
- [x] T3: La vista sigue al cambio por su id hasta su cierre
  - files: packages/ui/src/data/mcp-app.test.ts, packages/ui/src/data/mcp-app.ts, docs/ARCHITECTURE.md, docs/ui.md
  - ac: AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/mcp-app.test.ts && pnpm --filter @baquia-dev/specty-ui typecheck && pnpm lint && pnpm knip

## Riesgos

- R1: La cabecera de la tarjeta cambia de formato y la vista deja de leer el id. Mitigación: el test de C2 (AC1 de `cli/test/mcp-app.test.ts`) ya fija que la tarjeta empieza por `SPECTY · <id>`, y sin cabecera la vista sigue con la carpeta.
- R2: Cuando la huella cambia, `changeRecords` lee todos los cambios, también los archivados. Mitigación: solo pasa cuando algo cambió, y C3 mide el tiempo con los más de 300 cambios de este repositorio.

## Cierre

### Resumen

La vista del chat muestra la aceptación del cambio en vivo y lo sigue hasta su cierre. `specty accept` deja su verificación completa en el mismo archivo en vivo que `specty task done`, sin tarea, así que la ven mientras corre tanto la vista del chat como `specty ui`. `specty_view` acepta `change`: da ese cambio aunque viva en otra worktree o ya esté archivado, también si la carpeta pedida desapareció. La vista manda en cada pregunta el id del cambio que muestra, o el que nombra la cabecera de la tarjeta de la herramienta, como el que crea `specty_new` en su propia carpeta. Con esto la épica tiene sus tres pestañas en el chat: Spec, Progreso y Aceptación.

### Desviaciones

- Ninguna sobre el plan. Al aceptar, main ya traía el cambio «accept incorpora main antes de su verificación», que también toca `commands/accept.ts`. Se incorporó sin conflictos y `runLive` sigue en su sitio.

### Decisiones

- Con `change`, el servidor busca primero entre los cambios abiertos de todas las worktrees (`locateChanges`) y después en el archivo (`loadChange`). Si la carpeta pedida ya no se puede abrir, usa la del servidor, y solo cuando la vista nombra un cambio. Sin `change`, todo sigue como en C2.
- La vista lee el id de la primera línea de la tarjeta con `SPECTY · <fecha>-<nombre>`. El «SPECTY · …» de un test de C1 no lo cumple, y la vista sigue con la carpeta.
- Leer todos los registros (`changeRecords`) tarda unos 0,4 s con los más de 300 cambios de este repositorio, medido con `/api/changes`. Solo pasa cuando la huella cambia, y la siguiente pregunta espera un segundo tras cada respuesta.
- El botón «Ejecutar» de la verificación completa sigue desactivado en el chat, con su motivo, como en `specty ui` de solo lectura: un test existente lo fija así.

### Pendientes

- Probar en VS Code y en Claude Desktop con el bundle de main reconstruido: la spec, el progreso y la aceptación, y un `specty_new` con worktree.
- El cierre y el cierre de la épica, que ya tiene sus tres cortes.
