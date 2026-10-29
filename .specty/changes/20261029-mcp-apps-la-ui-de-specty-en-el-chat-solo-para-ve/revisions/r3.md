---
kind: epic
---

# MCP Apps: la UI de Specty en el chat, solo para ver

## Objetivo

Hoy la persona ve un cambio en la terminal o abriendo `specty ui` en el navegador. MCP Apps (la extensión `io.modelcontextprotocol/ui` de MCP, estable desde el 2026-01-26) deja que un servidor MCP muestre una aplicación dentro del chat de los anfitriones que la soportan: Claude, VS Code con Copilot, Goose y otros. Con esta épica, cada herramienta de Specty que el agente llama sobre un cambio muestra en el chat la UI de Specty abierta solo en la pestaña de ese momento:
- la Spec mientras se escribe y se revisa;
- el Progreso mientras se escriben los tests y el código, en vivo y fijado si el anfitrión lo permite;
- la Aceptación, con su verificación y, al final, el cierre.

Es solo para ver: las decisiones siguen en la terminal o en `specty ui`.

## Fuera de alcance

- Decidir desde el chat (aprobar, decidir el alcance, aceptar, cerrar): el servidor MCP lo arranca el agente y no puede saber si un clic lo dio una persona. Irá con su propio ADR (decisión de la persona, 2026-10-29).
- La bandeja, la pestaña Historial y la navegación entre cambios dentro del chat.
- Cambiar lo que reciben los clientes sin la extensión, como Claude Code en la terminal o Codex CLI.
- La extensión de VS Code, que lleva otra sesión, el modo equipo y WebAuthn.

## Supuestos

- A1: Solo para ver, por decisión de la persona del 2026-10-29: la vista no tiene botones de decisión y dice, en su lugar, el comando de la terminal o `specty ui`.
  - impacto: alto
- A2: La vista aparece con cada herramienta del agente que trabaja sobre un cambio: `specty_new`, `specty_next`, `specty_propose`, `specty_task_done`, `specty_scope_add`, `specty_adjust`, `specty_integrate`, `specty_retro` y `specty_review`. No aparece con `specty_check`, que no es de un cambio.
  - impacto: alto
- A3: La pestaña sale de la fase en la que queda el cambio tras el comando: Spec en `draft` y `review`; Progreso en `testing`, `implementing` y `adjusting`; Aceptación en `acceptance`, `closing` y `done`, para que el cierre se vea al final; e Historial solo en `cancelled`.
- A4: «Fijar» es pedir al anfitrión el modo `pip` (`ui/request-display-mode`) cuando lo ofrece. Si no, la vista queda en línea y se actualiza mientras está abierta, y la siguiente herramienta muestra el estado nuevo.
  - impacto: alto
- A5: La vista pide los datos con una herramienta solo de la app (`visibility: ["app"]`, que el modelo no ve) que solo lee. Devuelve lo mismo que `/api/changes` del servidor local para ese cambio, más la verificación en curso. Mientras el cambio puede moverse, la vista pregunta cada segundo, como la UI web con su servidor local. La pregunta lleva la huella de lo último que recibió, y el servidor solo devuelve los datos completos si cambiaron, más las líneas nuevas de la verificación. Así el retraso no pasa de un segundo y cada consulta es barata. Deja de preguntar al desmontarse.
- A6: La vista es el bundle de la UI de Angular (ADR 0003) empaquetado en un único HTML con todo incrustado, porque la CSP por defecto de MCP Apps no deja cargar archivos, conectar a la red ni crear un worker desde `blob:`. Sin worker, deriva los datos en el hilo principal, y usa las fuentes del sistema en lugar de Geist.
  - impacto: alto
- A7: Un cliente que no declara la extensión en `initialize` recibe las herramientas sin `_meta.ui` y los mismos textos que hoy.

## Criterios de aceptación

- AC1: CUANDO un anfitrión que declara MCP Apps llama a `specty_propose` o a `specty_new` ENTONCES el chat muestra la UI de Specty con solo la pestaña Spec de ese cambio, sin bandeja ni otras pestañas.
- AC2: CUANDO la vista muestra una decisión pendiente de la persona ENTONCES no ofrece botones: dice qué comando ejecutar en la terminal o que la abra en `specty ui`.
- AC3: CUANDO el anfitrión no declara MCP Apps ENTONCES las herramientas no llevan `_meta.ui` y responden con el mismo texto que hoy.
- AC4: CUANDO la UI no puede crear un Web Worker ENTONCES deriva los datos en el hilo principal, con core en un chunk que carga al necesitarlo.
- AC5: CUANDO se construye el CLI ENTONCES el paquete lleva la vista en un único HTML que funciona con la CSP por defecto de MCP Apps.
- AC6: CUANDO el agente llama a `specty_task_done`, `specty_scope_add`, `specty_adjust` o `specty_next` con el cambio en `testing`, `implementing` o `adjusting` ENTONCES la vista muestra solo la pestaña Progreso, que se actualiza sola mientras está abierta, con la verificación en vivo.
- AC7: CUANDO el anfitrión ofrece el modo `pip` ENTONCES la vista del Progreso pide quedar fijada.
- AC8: CUANDO el cambio pasa a `acceptance`, `closing` o `done` ENTONCES la vista muestra solo la pestaña Aceptación, con la verificación completa en vivo y, una vez enviado, el cierre.
- AC9: CUANDO la vista pide sus datos ENTONCES usa una herramienta que el modelo no ve, que solo lee y que no deja decidir nada.
- AC10: CUANDO la vista pide sus datos mientras el agente ejecuta un comando largo, como la verificación de `specty_task_done` ENTONCES el servidor responde sin esperar a que el comando termine, y la vista refleja cada cambio en un segundo como mucho.

## Diseño

- Servidor (`cli/src/mcp/`): en `initialize` lee `capabilities.extensions["io.modelcontextprotocol/ui"]`. Con la extensión, `tools/list` añade `_meta.ui.resourceUri: "ui://specty/change"` a las herramientas de A2, `resources/read` sirve el HTML (`text/html;profile=mcp-app`) y el resultado de esas herramientas lleva, además del texto, `structuredContent` con el cambio, su carpeta y su pestaña. La herramienta `specty_view` (`visibility: ["app"]`) devuelve los datos con `changeRecords` del servidor local y la verificación en curso. Con la huella que manda la vista (la de `server/events.ts`), contesta «sin cambios» si nada se movió.
- Hoy el servidor atiende los mensajes de uno en uno. `specty_view` es de solo lectura, así que se atiende aparte, sin esperar a la herramienta del agente que esté en marcha (AC10). Las herramientas del agente siguen en fila.
- UI: una fuente de datos `McpAppData` que habla JSON-RPC por `postMessage` con el anfitrión: `ui/initialize`, `ui/notifications/tool-result`, `tools/call` a `specty_view`, `ui/request-display-mode` y `ui/notifications/size-changed`. La elige `dataSource` por una marca del HTML, como hoy con el servidor local. Un modo embebido muestra solo la pestaña del cambio, sin cabecera de navegación ni acciones.
- `DERIVER` sin worker: un `import()` perezoso de la derivación, que la entrada ligera de core (2c20665) deja fuera del bundle inicial.
- El HTML único: el build de producción reempaquetado con esbuild sin división en chunks, con el JS y el CSS dentro del HTML. El build del CLI lo copia a `dist`, como ya hace con la UI.
- Un ADR nuevo recoge la decisión: MCP Apps solo para ver, por qué, y qué haría falta para decidir desde el chat.

## Cortes

- C1: La spec del cambio se ve en el chat al proponerla
  - ac: AC1, AC2, AC3, AC4, AC5, AC9
- C2: El progreso del cambio se ve en vivo en el chat mientras se programa
  - ac: AC6, AC7, AC10
  - depends: C1
- C3: La aceptación del cambio se ve en el chat con su verificación y su cierre
  - ac: AC8
  - depends: C2

## Riesgos

- R1: Los anfitriones soportan MCP Apps de forma desigual (`pip`, el tamaño, el tema). Mitigación: la vista en línea siempre funciona, `pip` solo se pide si se ofrece, y sin la extensión todo sigue en texto (AC3).
- R2: Un HTML de alrededor de 1 MB en cada herramienta. Mitigación: es siempre el mismo recurso (`ui://specty/change`), que el anfitrión puede guardar; C1 mide su tamaño y el tiempo de carga.
- R3: Los datos del cambio (spec, diffs, salidas de verificación) viajan al anfitrión. Mitigación: es el mismo anfitrión que ya ve el código a través del agente, `structuredContent` no entra en el contexto del modelo, y `specty_view` solo lee.
- R4: C1 no cabe en un cambio de tamaño L. Mitigación: lleva cambios previos (sin worker, el HTML único, el servidor), cada uno con su test, como C2 de la épica de tests.
- R5: Un anfitrión que no reenvía las consultas de la vista mientras la herramienta que la abrió sigue en marcha. Mitigación: la vista muestra el estado al llegar el resultado de esa herramienta, y C2 comprueba con un anfitrión simulado que las consultas siguen respondiendo mientras tanto.
