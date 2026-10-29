---
kind: standard
epic: 20261029-mcp-apps-la-ui-de-specty-en-el-chat-solo-para-ve
slice: C2
---

# El progreso del cambio se ve en vivo en el chat mientras se programa

## Objetivo

Segundo corte de la épica de MCP Apps. Mientras el agente escribe los tests y el código, la vista del chat muestra el Progreso al día: pregunta cada segundo, y solo trae datos si algo cambió. Sigue mostrando la verificación en vivo, también mientras `specty_task_done` está en marcha, y pide quedar fijada si el anfitrión lo permite.

El corte arregla además lo que mostró la prueba en anfitriones reales (2026-10-29):
- En Claude Desktop el modelo recibía el `structuredContent` en lugar del texto de la tarjeta, y perdía el SIGUIENTE.
- En Claude Desktop la vista se quedaba en «Esperando el cambio…» con los datos ya servidos.
- En VS Code la vista intentaba crear un worker que no carga.

## Fuera de alcance

- La pestaña Aceptación en vivo, con la verificación completa y el cierre: corte C3.
- Decidir desde el chat, por decisión de la persona en la épica.
- Cambiar lo que reciben los clientes sin MCP Apps.

## Supuestos

- A1: La vista toma la carpeta de los argumentos de la llamada (`ui/notifications/tool-input`), que el anfitrión le manda antes del resultado. Sin `folder`, pregunta sin carpeta, y el servidor usa la suya, como la herramienta. Si un resultado trae `structuredContent.folder`, también lo acepta.
  - impacto: alto
- A2: La huella de un cambio es el tamaño y la hora de sus archivos (`spec.md`, `state.json`, `audit.jsonl`, `comments.json`) más la verificación en curso. `since` es una huella, no una decisión, así que `specty_view` sigue sin poder cambiar nada.
- A3: Un cambio se mueve solo en `testing`, `implementing`, `adjusting`, `acceptance` y `closing`; la vista pregunta solo entonces. En las demás fases espera a una persona o ya terminó, y la próxima herramienta abre otra vista.
  - impacto: alto
- A4: `specty_view` y `ping` se atienden fuera de la fila: las herramientas del agente siguen una detrás de otra y se responden en el orden en que llegaron.
- A5: `cli/test/mcp-app.test.ts`, de C1, pasa a exigir que las herramientas del agente no lleven `structuredContent` y que `specty_view` acepte también `since`, con el permiso de la persona (2026-10-29).

## Criterios de aceptación

- AC1: CUANDO el cliente declara MCP Apps ENTONCES las herramientas del agente responden solo con el texto de su tarjeta, sin `structuredContent`, y la vista lee el cambio de la carpeta que llega en los argumentos de la llamada.
- AC2: CUANDO la vista pide `specty_view` con la huella de lo último que recibió ENTONCES el servidor responde que nada cambió si es así; si no, responde el registro, la huella nueva y la verificación en curso. En los dos casos manda los datos también como texto JSON.
- AC3: CUANDO la vista pide `specty_view` mientras una herramienta del agente sigue en marcha ENTONCES el servidor le responde sin esperar a que termine.
- AC4: CUANDO la vista muestra un cambio en `testing`, `implementing`, `adjusting`, `acceptance` o `closing` ENTONCES vuelve a preguntar cada segundo, con su huella, y se actualiza cuando algo cambia; en `draft`, `review`, `done` o `cancelled` no vuelve a preguntar.
- AC5: CUANDO el anfitrión ofrece `pip` y el cambio está en `testing`, `implementing` o `adjusting` ENTONCES la vista pide quedar fijada.
- AC6: CUANDO la vista no puede leer el cambio, porque no hay ninguno abierto en la carpeta o porque la respuesta no se entiende ENTONCES lo dice, en lugar de quedarse en «Esperando el cambio…».
- AC7: CUANDO la UI arranca en modo embebido ENTONCES deriva en el hilo principal sin intentar crear un worker, y solo avisa de su tamaño después de `ui/notifications/initialized`.

## Diseño

- Servidor (`commands/mcp.ts`):
  - El resultado de una herramienta del agente vuelve a ser solo su texto.
  - Los mensajes se leen sin esperar: una herramienta del agente entra en una fila que responde en orden, y `specty_view` y `ping` se responden en cuanto se calculan.
  - Al terminar la entrada, el servidor espera a que acabe lo pendiente.
- `mcp/app.ts`:
  - `specty_view({ folder?, since? })` da la huella del cambio de la carpeta, que se calcula con `stat`, sin leer los archivos.
  - Si `since` coincide con la huella, responde `{ fingerprint, unchanged: true }`. Si no, responde `{ fingerprint, records, run? }`, con `run` leído de `readRuns`.
  - El texto de la respuesta es el mismo objeto en JSON.
- UI, `data/mcp-app.ts`:
  - Con `tool-input` lee el cambio; con `tool-result` lo vuelve a leer, porque la herramienta ya lo cambió.
  - Mientras la fase se mueve, programa la siguiente pregunta un segundo después de cada respuesta. Para con `ui/resource-teardown`.
  - Si la respuesta no trae `structuredContent`, la lee del texto. Si no hay registro o no se entiende, `changes()` rechaza con un motivo bilingüe.
  - `watchRun` da la verificación en curso.
  - Declara `inline` y `pip`, y pide `pip` cuando el anfitrión lo ofrece y la fase es de Progreso.
  - Avisa del tamaño con un `ResizeObserver` que empieza tras `initialized`.
- `app/embedded.ts`:
  - Exporta `embeddedProviders()`, que reúne la fuente y el `DERIVER` en el hilo principal, y `main.ts` lo usa.
  - Muestra el motivo del error del almacén cuando lo hay.
  - Ya no avisa del tamaño: eso pasa a la fuente.
- `data/changes-store.ts`: exporta el derivador en el hilo principal.

## Archivos

- modificar packages/cli/src/commands/mcp.ts — sin `structuredContent` en las herramientas del agente; `specty_view` y `ping` fuera de la fila
- modificar packages/cli/src/mcp/app.ts — la huella, `unchanged`, la verificación en curso y el texto JSON de `specty_view`
- modificar packages/cli/test/mcp-app.test.ts — AC1 y AC2, y lo de C1 que cambia (A5)
- crear packages/cli/test/mcp-app-live.test.ts — AC3 y la verificación en curso
- modificar packages/ui/src/data/mcp-app.ts — `tool-input`, preguntar cada segundo, `pip`, el texto JSON, el error, el tamaño y `watchRun`
- modificar packages/ui/src/data/mcp-app.test.ts — AC1, AC4, AC5, AC6 y AC7 desde la fuente
- modificar packages/ui/src/app/embedded.ts — `embeddedProviders()` y el mensaje de error
- modificar packages/ui/src/app/embedded.test.ts — AC6 y AC7 en la vista
- modificar packages/ui/src/main.ts — arranca con `embeddedProviders()`
- modificar packages/ui/src/data/changes-store.ts — exporta el derivador en el hilo principal
- modificar docs/ARCHITECTURE.md — §6: MCP Apps
- modificar docs/ui.md — la vista en el chat
- modificar docs/decisions/0015-mcp-apps-solo-para-ver.md — `structuredContent` y `since`

## Tareas

- [x] T1: El servidor da a la vista lo que cambió, mientras el agente trabaja
  - files: packages/cli/src/commands/mcp.ts, packages/cli/src/mcp/app.ts, packages/cli/test/mcp-app.test.ts, packages/cli/test/mcp-app-live.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/mcp-app.test.ts test/mcp-app-live.test.ts test/mcp.test.ts && pnpm typecheck && pnpm lint && pnpm knip
- [x] T2: La fuente de la vista pregunta cada segundo y pide quedar fijada
  - files: packages/ui/src/data/mcp-app.ts, packages/ui/src/data/mcp-app.test.ts
  - ac: AC1, AC4, AC5, AC6, AC7
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/mcp-app.test.ts && pnpm --filter @baquia-dev/specty-ui typecheck && pnpm lint && pnpm knip
- [x] T3: La vista arranca sin worker y dice por qué no puede leer el cambio
  - files: packages/ui/src/app/embedded.ts, packages/ui/src/app/embedded.test.ts, packages/ui/src/main.ts, packages/ui/src/data/changes-store.ts, docs/ARCHITECTURE.md, docs/ui.md, docs/decisions/0015-mcp-apps-solo-para-ver.md
  - ac: AC6, AC7
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/app/embedded.test.ts --include src/data/fixtures.test.ts && pnpm --filter @baquia-dev/specty-ui typecheck && pnpm lint && pnpm knip

## Riesgos

- R1: Muchas vistas en una conversación preguntan a la vez. Mitigación: solo en las fases que se mueven, una pregunta por segundo y vista, y con huella, que no lee los archivos si nada cambió.
- R2: Un anfitrión que no reenvía las preguntas de la vista mientras la herramienta que la abrió sigue en marcha. Mitigación: la vista lee de nuevo con el resultado de la herramienta; C2 lo vuelve a probar en VS Code y en Claude Desktop.
