---
kind: standard
epic: 20261028-fase-3-auditoria-y-ecosistema
slice: C4
---

# `specty mcp` expone los comandos del agente como herramientas

## Objetivo

Hoy un agente solo llega a Specty por la shell. `specty mcp` es un servidor MCP por stdio que ofrece los comandos del agente como herramientas: un agente sin shell, o que prefiere herramientas, puede seguir el flujo igual (ARCHITECTURE §6). Cada herramienta ejecuta el mismo comando de la CLI, así que da la misma tarjeta, con el mismo bloqueo y las mismas reglas, y ninguna toma las decisiones de la persona.

## Fuera de alcance

- Registrar el servidor en la configuración de cada agente, y que `doctor` y `uninstall` lo conozcan (corte C5).
- Recursos, prompts, MCP Apps, el transporte HTTP y las notificaciones de progreso.
- Cancelar una herramienta en curso.

## Supuestos

- A1: El servidor habla JSON-RPC 2.0 por stdio, un mensaje por línea, sin el SDK de MCP: solo necesita `initialize`, `ping`, `tools/list` y `tools/call`, y la CLI se empaqueta en un solo archivo.
  - impacto: medio
- A2: Cada herramienta construye la línea del comando y la ejecuta con `runCli` en la carpeta `folder` (o en la del servidor), con la salida capturada y una terminal que nunca pregunta. Así la tarjeta, el bloqueo del cambio y el código de salida son los de la CLI, sin código duplicado.
  - impacto: alto
- A3: Las herramientas son las de los comandos del agente que trabajan en una carpeta: `next`, `new`, `propose`, `review`, `check`, `task done`, `scope add`, `adjust`, `integrate` y `retro`. `enter` no se ofrece, porque liga una conversación de shell a una carpeta y con MCP basta con `folder`.
- A4: Las acciones de la persona (`approve`, `reject`, `accept`, `close`, `cancel`, `delegate`) no tienen herramienta, tampoco en modo delegado, en el que el agente sigue usando la CLI.
  - impacto: alto
- A5: El servidor responde con la versión del protocolo que pide el cliente si la conoce (`2024-11-05`, `2025-03-26`, `2025-06-18` o `2025-11-25`) y, si no, con la más reciente que conoce. Los mensajes se atienden de uno en uno, en orden.
- A6: Las descripciones de las herramientas y de sus argumentos van en inglés, como las de los comandos en `--help`; las tarjetas que devuelven siguen el idioma del repositorio.

## Criterios de aceptación

- AC1: CUANDO un cliente envía `initialize` a `specty mcp` por stdio ENTONCES responde con la versión del protocolo que pidió (o la más reciente que conoce), la capacidad `tools` y el nombre y la versión de Specty; responde `{}` a `ping`, no responde a las notificaciones y da el error de JSON-RPC a una línea que no es JSON (-32700) o a un método desconocido (-32601).
- AC2: CUANDO el cliente pide `tools/list` ENTONCES recibe `specty_next`, `specty_new`, `specty_propose`, `specty_review`, `specty_check`, `specty_task_done`, `specty_scope_add`, `specty_adjust`, `specty_integrate` y `specty_retro`, cada una con su descripción y el esquema JSON de sus argumentos (todas con `folder`), y ninguna para aprobar, rechazar, aceptar, cerrar, cancelar o delegar.
- AC3: CUANDO el agente llama a una herramienta ENTONCES recibe como texto la misma salida que el comando de la CLI daría en `folder` (o en la carpeta del servidor), y la respuesta lleva `isError: true` si el comando sale con 1 o 2.
- AC4: CUANDO una llamada nombra una herramienta que no existe, o le falta un argumento obligatorio o tiene uno de otro tipo ENTONCES responde con el error -32602, que nombra el problema, sin ejecutar nada.

## Diseño

- `mcp/protocol.ts`: leer una línea, responder y los errores de JSON-RPC, y la negociación de `initialize`.
- `mcp/tools.ts`: la tabla de herramientas. Cada una tiene nombre, descripción, esquema de argumentos y la función que da la línea del comando a partir de los argumentos ya validados: opciones primero y `--` antes de los posicionales, para que un título que empieza por `-` no se lea como opción.
- `commands/mcp.ts` registra `specty mcp`. Lee las líneas de `CliEnvironment.input` (stdin) y atiende cada mensaje. Para `tools/call`, ejecuta `runCli`, que recibe de `program.ts` para no crear un ciclo de imports, con `cwd` en la carpeta y la salida capturada. Lo que el comando escribe en stderr sigue yendo a stderr.
- `main.ts` pasa `process.stdin` como `input`.

## Archivos

- crear packages/cli/src/mcp/protocol.ts — JSON-RPC por líneas y la negociación de `initialize`
- crear packages/cli/src/mcp/tools.ts — las herramientas, sus esquemas y su línea de comando
- crear packages/cli/src/commands/mcp.ts — el comando `specty mcp`
- modificar packages/cli/src/program.ts — `input` en el entorno y registrar `mcp`
- modificar packages/cli/src/main.ts — stdin como `input`
- crear packages/cli/test/mcp.test.ts — un cliente MCP contra el servidor
- modificar docs/ARCHITECTURE.md — §6: el servidor MCP

## Tareas

- [ ] T1: El servidor MCP y sus herramientas
  - files: packages/cli/src/mcp/protocol.ts, packages/cli/src/mcp/tools.ts, packages/cli/src/commands/mcp.ts, packages/cli/src/program.ts, packages/cli/src/main.ts, packages/cli/test/mcp.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty typecheck && pnpm --filter @baquia-dev/specty exec vitest run test/mcp.test.ts
- [ ] T2: Documentar el servidor MCP
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/mcp.test.ts
  - type: docs

## Riesgos

- R1: `task done` y `accept` corren la verificación, que puede tardar minutos, y un cliente MCP puede cortar la llamada antes. Mitigación: la documentación lo dice; la verificación sigue y su resultado queda en la auditoría, y `specty_next` lo muestra.
- R2: Un `console.log` o una salida que se escape a stdout rompería el protocolo. Mitigación: la salida del comando se captura siempre, y la prueba lee stdout línea a línea como JSON.
