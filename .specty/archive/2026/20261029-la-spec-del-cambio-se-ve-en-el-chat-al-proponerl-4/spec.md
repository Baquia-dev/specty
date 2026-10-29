---
kind: standard
epic: 20261029-mcp-apps-la-ui-de-specty-en-el-chat-solo-para-ve
slice: C1
---

# La spec del cambio se ve en el chat al proponerla

## Objetivo

Primer corte de la épica de MCP Apps. Cuando un anfitrión que soporta MCP Apps (Claude, VS Code con Copilot, Goose…) llama a `specty_new` o a `specty_propose`, el chat muestra la UI de Specty abierta solo en la pestaña Spec del cambio. Es solo para ver: la vista no tiene botones de decisión y dice cómo decidir en la terminal o en `specty ui`. Para eso, la UI funciona sin Web Worker, se empaqueta en un único HTML que respeta la CSP por defecto de MCP Apps, habla con el anfitrión por `postMessage`, y el servidor MCP negocia la extensión, sirve la vista y le da los datos con una herramienta que el modelo no ve.

## Fuera de alcance

- Refrescar la vista sola, fijarla (`pip`) y responder a la vista mientras otra herramienta sigue en marcha: corte C2.
- Las pestañas Progreso y Aceptación en vivo: cortes C2 y C3. La vista ya abre la pestaña de la fase, pero sin refrescarse.
- Decidir desde el chat, por decisión de la persona en la épica.
- Las fuentes Geist dentro de la vista: la CSP no deja cargarlas, así que usa las del sistema.

## Supuestos

- A1: La vista es el mismo bundle de Angular, arrancado en un modo embebido cuando el HTML trae la marca `<meta name="specty-data" content="mcp-app">`: sin enrutador, sin bandeja, sin cabecera de navegación y sin acciones, con una línea que dice el estado del cambio y qué hacer para decidir.
  - impacto: alto
- A2: El HTML único lo hace el build del CLI, que ya tiene esbuild, a partir del build de la UI: el de `--ui` o, en el monorepo, `packages/ui/dist/browser`. Reempaqueta sin división en chunks la entrada de la UI con todo lo que carga, mete el JS y el CSS en el HTML, quita `<base>` y las `@font-face` y añade la marca. Lo escribe como `mcp-app.html` junto al bundle. Las gramáticas y los temas de shiki se quedan fuera, porque en el chat no hay diffs que resaltar. Sin build de la UI, o si su `index.html` no carga ningún script, no lo escribe y el build sigue.
  - impacto: alto
- A3: El servidor busca la vista en `mcp-app.html` junto al script que nombra la invocación, si la nombra (los tests), y si no, junto al propio bundle. Sin ella, o sin la extensión en el cliente, todo queda como hoy.
- A4: Las herramientas del agente que trabajan sobre un cambio llevan `_meta.ui.resourceUri: "ui://specty/change"`, y su resultado lleva `structuredContent` con la carpeta en la que corrió. `specty_view` (`visibility: ["app"]`), con esa carpeta, devuelve el registro del cambio abierto allí, como `/api/changes`.
- A5: Sin Web Worker, o si crearlo falla, la UI deriva los datos en el hilo principal con un `import()` perezoso de la derivación, que la entrada ligera de core deja fuera del bundle inicial. El test de `data/fixtures.test.ts` que exigía un error sin worker pasa a exigir esto, con el permiso de la persona (2026-10-29).

## Criterios de aceptación

- AC1: CUANDO la UI arranca con la marca de MCP App y el anfitrión le pasa el resultado de una herramienta de un cambio en `draft` o en `review` ENTONCES muestra solo la pestaña Spec de ese cambio, sin bandeja, sin otras pestañas y sin acciones.
- AC2: CUANDO el cambio de la vista espera una decisión de la persona ENTONCES la vista no ofrece botones y dice qué comando ejecutar en la terminal o que la abra en `specty ui`.
- AC3: CUANDO el cliente declara MCP Apps en `initialize` y la vista existe ENTONCES `tools/list` enlaza las herramientas de un cambio con `ui://specty/change`, `resources/read` devuelve el HTML con `text/html;profile=mcp-app`, y `specty_view` devuelve el registro del cambio; sin la extensión, nada de eso aparece y las herramientas responden igual que hoy.
- AC4: CUANDO la UI no puede crear un Web Worker ENTONCES deriva los datos en el hilo principal.
- AC5: CUANDO el build del CLI encuentra un build de la UI ENTONCES escribe junto al bundle un único `mcp-app.html` con la marca, sin `<base>`, sin `@font-face` y sin referencias a otros archivos; si el `index.html` de ese build no carga ningún script, no lo escribe y el build termina bien.
- AC6: CUANDO el modelo pide la lista de herramientas o llama a `specty_view` ENTONCES `specty_view` lleva `visibility: ["app"]`, solo lee y no tiene argumentos que decidan nada.

## Diseño

- `data/changes-store.ts`: el `DERIVER` crea el worker dentro de un `try`; sin `Worker`, o si falla, usa `import("./views")` en el hilo principal.
- `data/mcp-app.ts`: `McpAppData`, que habla JSON-RPC 2.0 por `postMessage` con `window.parent`. Envía `ui/initialize` y `ui/notifications/initialized`, escucha `ui/notifications/tool-result` para saber la carpeta, llama a `specty_view` con `tools/call` y avisa del tamaño con `ui/notifications/size-changed`. `readOnly()` da el motivo bilingüe que dice cómo decidir.
- `app/embedded.ts`: la raíz del modo embebido. Muestra el título y la fase del cambio, la línea de A1 y solo la pestaña de la fase: Spec en `draft` y `review`, Progreso en `testing`, `implementing` y `adjusting`, y Aceptación en `acceptance`, `closing` y `done`. Usa los componentes de las pestañas de la página del cambio.
- `main.ts`: con la marca, arranca `Embedded` con `McpAppData`, sin enrutador; si no, como hoy.
- `cli/mcp-app.mjs`: el empaquetador de A2, que llama `build.mjs`. Su test ejecuta el build con `--ui` sobre un build de UI mínimo y `--outdir` temporal.
- Servidor: `mcp/app.ts` busca la vista (A3) y arma los datos de `specty_view` con `changeRecords`. `protocol.ts` lee `capabilities.extensions["io.modelcontextprotocol/ui"]` del cliente y declara `resources`. `commands/mcp.ts` atiende `resources/list` y `resources/read` y añade `structuredContent` a los resultados. `tools.ts` añade `_meta.ui` y `specty_view` cuando el cliente tiene la extensión.
- ADR 0015 «MCP Apps, solo para ver»: por qué y qué haría falta para decidir desde el chat.

## Archivos

- modificar packages/ui/src/data/changes-store.ts — el `DERIVER` sin worker
- modificar packages/ui/src/data/fixtures.test.ts — AC4: sin worker, deriva en el hilo principal en lugar de dar error
- crear packages/ui/src/data/mcp-app.ts — la fuente de datos de la MCP App
- crear packages/ui/src/data/mcp-app.test.ts — AC1 y AC2 desde la fuente, con un anfitrión simulado
- crear packages/ui/src/app/embedded.ts — la vista embebida
- crear packages/ui/src/app/embedded.test.ts — AC1 y AC2 en la vista
- modificar packages/ui/src/main.ts — el modo embebido con la marca
- crear packages/cli/mcp-app.mjs — el HTML único
- modificar packages/cli/build.mjs — escribe `mcp-app.html` junto al bundle
- crear packages/cli/test/mcp-app-page.test.ts — AC5
- crear packages/cli/src/mcp/app.ts — la vista y sus datos
- modificar packages/cli/src/mcp/protocol.ts — la extensión y los recursos en `initialize`
- modificar packages/cli/src/mcp/tools.ts — `_meta.ui` y `specty_view`
- modificar packages/cli/src/commands/mcp.ts — `resources/list`, `resources/read` y `structuredContent`
- crear packages/cli/test/mcp-app.test.ts — AC3 y AC6
- crear docs/decisions/0015-mcp-apps-solo-para-ver.md — la decisión
- modificar docs/ARCHITECTURE.md — §6 (MCP) y §18 (F4)
- modificar docs/ui.md — la vista embebida

## Tareas

- [x] T1: La UI deriva sus datos sin worker cuando no puede crear uno
  - files: packages/ui/src/data/changes-store.ts, packages/ui/src/data/fixtures.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/fixtures.test.ts && pnpm lint
- [x] T2: La vista embebida muestra solo la pestaña del cambio, con los datos del anfitrión
  - files: packages/ui/src/data/mcp-app.ts, packages/ui/src/data/mcp-app.test.ts, packages/ui/src/app/embedded.ts, packages/ui/src/app/embedded.test.ts, packages/ui/src/main.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/mcp-app.test.ts --include src/app/embedded.test.ts && pnpm --filter @baquia-dev/specty-ui typecheck && pnpm lint && pnpm knip
- [x] T3: La UI se empaqueta en un único HTML para MCP Apps
  - files: packages/cli/mcp-app.mjs, packages/cli/build.mjs, packages/cli/test/mcp-app-page.test.ts
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/mcp-app-page.test.ts test/bundle.test.ts && pnpm lint && pnpm knip
- [x] T4: El servidor MCP sirve la vista y la enlaza a las herramientas de un cambio
  - files: packages/cli/src/mcp/app.ts, packages/cli/src/mcp/protocol.ts, packages/cli/src/mcp/tools.ts, packages/cli/src/commands/mcp.ts, packages/cli/test/mcp-app.test.ts, docs/decisions/0015-mcp-apps-solo-para-ver.md, docs/ARCHITECTURE.md, docs/ui.md
  - ac: AC3, AC6
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/mcp-app.test.ts test/mcp.test.ts && pnpm typecheck && pnpm lint && pnpm knip

## Riesgos

- R1: Algo de la UI que no funciona en el iframe aislado: el resaltado de código de shiki, que puede cargar WebAssembly, o una ruta de recursos. Mitigación: la pestaña Spec usa markdown sin shiki, y C1 abre el HTML empaquetado en un iframe con la CSP por defecto para comprobarlo.
- R2: El HTML único pesa en torno a 1 MB. Mitigación: siempre es el mismo recurso; el cierre de C1 anota su tamaño.

## Cierre

### Resumen

Con un anfitrión que declara MCP Apps, cada herramienta de un cambio de `specty mcp` muestra en el chat la UI de Specty, abierta solo en la pestaña de su fase, sin bandeja, sin pestañas y sin botones. Donde el cambio espera a la persona, la vista dice el comando de la terminal o `specty ui`. Las piezas:
- UI: el `DERIVER` deriva en el hilo principal cuando no hay worker; `McpAppData` habla con el anfitrión por `postMessage`; `app/embedded.ts` es la vista; `main.ts` la carga con `import()` cuando la página trae la marca.
- Página: el build del CLI empaqueta la UI en `mcp-app.html` (`mcp-app.mjs`), de 1,36 MB, sin referencias a otros archivos.
- Servidor: negocia la extensión, sirve `ui://specty/change`, enlaza las herramientas de un cambio, añade `structuredContent.folder` y ofrece `specty_view` solo a la vista.
- ADR 0015 y la documentación (ARCHITECTURE §6 y §18, `docs/ui.md`).

Lo comprobé en Chrome con un anfitrión simulado: la página, en un iframe con `sandbox="allow-scripts"` y la CSP por defecto de MCP Apps, saluda al anfitrión, pide `specty_view` y muestra la Spec y el Progreso con los datos reales de este cambio.

### Desviaciones (respecto al plan)

- El corte se rehízo tres veces (-2, -3 y -4):
  - en la primera spec, dos verificaciones ejecutaban `knip` o `typecheck` antes que sus tests, así que el envío de los tests no los veía fallar;
  - después, una tarea de arreglo hacía el cambio XL;
  - al final, un test que ya existía (`fixtures.test.ts`) exigía el error sin worker.

  El código se recuperó cada vez de la rama anterior.
- `mcp-app.test.ts` tuvo un fallo cuando ya estaba aprobado: `setUp(undefined)` usaba el valor por defecto y escribía la página. La persona lo desbloqueó (S1) en el intento -2, y aquí se envió ya corregido.
- Probándolo en Chrome salieron cuatro cosas que los tests no veían:
  - la vista tiene el selector `sp-root`, porque `bootstrapApplication` busca el elemento de la página;
  - la vista embebida se carga con `import()`, porque si no, el bundle de `specty ui` pasaba de su presupuesto de 1 MB;
  - el servidor busca la página junto al bundle (`import.meta.url`), porque `invocation.script` solo existe para `init` y `doctor`;
  - las gramáticas y los temas de shiki (2,6 MB de 3,8) salen de la página como módulos vacíos.
- Sin script que empaquetar, el build no escribe la página; `bundle.test.ts` lo exigía.
- `fixtures.test.ts`: el test que exigía un error sin worker pasa a exigir que se derive, con el permiso de la persona.

### Decisiones

- Las gramáticas se reconocen por su contenido (`"scopeName"`, `"tokenColors"`), porque en el build de Angular son chunks sin nombre. El sustituto exporta los mismos nombres que el original, porque unas gramáticas importan otras.
- `specty_view` lee todos los registros con `changeRecords` y se queda con el de la carpeta. Para una llamada por herramienta basta; C2, que consulta cada segundo, usará la huella.

### Pendientes

- C2: refrescar cada segundo con la huella, fijar la vista (`pip`) y atender `specty_view` mientras otra herramienta corre.
- La vista avisa de su tamaño antes de enviar `ui/notifications/initialized`. Conviene esperar a ese aviso: un anfitrión estricto podría ignorar los anteriores.
- Las capturas en Chrome headless fueron intermitentes: a veces la vista no llegaba a pedir `specty_view` antes de la captura. Lo atribuyo al reloj virtual de Chrome, no a la vista, pero falta probarlo en un anfitrión real (Claude Desktop o VS Code con Copilot).
