# 0015 · MCP Apps, solo para ver

- Estado: aceptada
- Fecha: 2026-10-29

## Contexto

MCP Apps (la extensión `io.modelcontextprotocol/ui`, estable desde el 2026-01-26) deja que un servidor MCP muestre una aplicación dentro del chat de los anfitriones que la soportan: Claude, VS Code con Copilot, Goose y otros. El anfitrión pinta un recurso `ui://` en un iframe aislado con una CSP restrictiva (sin red, sin archivos propios, sin workers desde `blob:`), y la vista habla con él por `postMessage` en JSON-RPC. Una herramienta enlaza su resultado con la vista mediante `_meta.ui.resourceUri`, y una herramienta con `visibility: ["app"]` solo la llama la vista: el modelo no la ve.

El [ADR 0003](0003-ui-web-local.md) dejó la capa de datos de la UI separada del transporte para reutilizar el mismo bundle aquí. La persona pidió ver en el chat la pestaña del paso en que va el agente: la Spec al proponerla, el Progreso mientras programa, la Aceptación con su verificación y su cierre.

El servidor MCP de Specty lo arranca el agente, por stdio. Specty no puede saber si una llamada a una herramienta la provoca un clic de la persona en la vista o el propio modelo: confía en que el anfitrión respete `visibility`.

## Decisión

- La vista en el chat es solo para ver. No tiene botones de decisión. Donde el cambio espera a la persona, dice qué comando ejecutar en la terminal o que lo abra en `specty ui`, donde sí decide: allí una persona arrancó el servidor desde su terminal.
- Con un cliente que declara la extensión en `initialize`, cada herramienta de un cambio (todas salvo `specty_check`) enlaza con `ui://specty/change`. Su resultado es solo el texto de su tarjeta: con un `structuredContent`, Claude Desktop se lo daba al modelo en lugar del texto (2026-10-29). La vista toma la carpeta de los argumentos de la llamada. Sin la extensión, o sin la página, el servidor es el de siempre.
- La página es el mismo bundle de Angular, empaquetado por el build del CLI en un único `mcp-app.html` junto al bundle: todo el JS y el CSS dentro, sin `@font-face` y sin las gramáticas de shiki, que en el chat no se usan. Una marca hace que la UI arranque en modo embebido: un cambio y la pestaña de su fase, sin enrutador ni bandeja.
- La vista lee el cambio con `specty_view` (`visibility: ["app"]`), que solo lee. Solo acepta la carpeta y la huella de lo que la vista ya tiene (`since`), que no decide nada. Manda los datos también como texto JSON, para el anfitrión que solo le da el texto a la vista.
- Mientras el cambio se mueve sin una persona, la vista pregunta cada segundo, con su huella, y el servidor le responde sin esperar a la herramienta del agente que esté en marcha.
- En modo embebido, la UI deriva sus datos en el hilo principal sin intentar crear un worker, con la derivación en un chunk que carga al necesitarla.

## Consecuencias

- Decidir desde el chat queda fuera hasta que Specty pueda comprobar que decide una persona, por ejemplo con WebAuthn o con una confirmación en la terminal. Lo hará otro ADR.
- La página pesa unos 1,4 MB, siempre el mismo recurso, que el anfitrión puede guardar.
- Cada vista de un cambio en marcha pregunta una vez por segundo. Si nada cambió, el servidor solo hace `stat` de cuatro archivos y no los lee.
- Los clientes de terminal (Claude Code, Codex CLI…) no cambian: no declaran la extensión.
