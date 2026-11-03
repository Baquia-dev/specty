---
kind: standard
---

# Mensajes entre sesiones de cualquier agente

## Objetivo

Que una sesión, de cualquier agente, o la persona desde su terminal, pueda dejarle un mensaje a la sesión que trabaja en otro cambio con `specty message <id> "<texto>"`, y que a esa sesión le llegue sola, tras su siguiente comando, por el canal de avisos que ya tiene cada agente con guard. Hoy dos sesiones en paralelo solo se coordinan a través de la persona.

## Fuera de alcance

- Mensajes a la carpeta principal o a una conversación concreta: el destino es la sesión de un cambio abierto.
- Avisar al que envía de si alguna sesión trabaja ahora en ese cambio, y verlos en `status` o en la UI.
- Borrar los mensajes que nadie recogió de un cambio que se cierra o se cancela.
- Agentes sin guard: no tienen un evento tras cada comando por el que llegue el mensaje.

## Supuestos

- A1: El mensaje vive en `.git/common/specty/messages/<id>/`, un archivo por mensaje con quién lo deja (persona o agente, su herramienta, el cambio de su carpeta y la carpeta), el texto y la hora. Es estado vivo y compartido por todas las worktrees, como los bloqueos, y no va a la rama de la memoria.
  - impacto: alto
- A2: Llega por el veredicto del guard tras un comando de shell: Claude Code y Codex lo leen en la salida 2, Cursor en `additional_context`, Gemini CLI y Devin en `additionalContext`, OpenCode añadido al resultado, y Antigravity en su siguiente llamada al modelo, como los avisos de hoy. Se toma una vez: quien lo recibe lo borra.
  - impacto: alto
- A3: Solo se mira si hay mensajes con una lectura de la carpeta `messages/`; el cambio de la carpeta se resuelve solo cuando hay alguno, para no hacer más lento cada comando.

## Criterios de aceptación

- AC1: CUANDO una sesión ejecuta `specty message <id> "<texto>"` y `<id>` es un cambio abierto ENTONCES el mensaje queda para la sesión que trabaja en la carpeta de ese cambio, con quién lo deja y cuándo, y la salida lo confirma.
- AC2: CUANDO la sesión que trabaja en la carpeta de ese cambio termina su siguiente comando de shell ENTONCES su agente recibe los mensajes que esperaban, con quién los dejó, cuándo y cómo responderle, y no los vuelve a recibir.
- AC3: CUANDO el texto está vacío o `<id>` no es un cambio abierto ENTONCES no deja nada y la salida dice por qué y qué hacer.

## Diseño

- Core, `cards/messages.ts`: `messageLeftCard(id, text, ctx)`, `messageRefusalCard(refusal, ctx)` y `messagesNote(messages, ctx)`, el texto que recibe el agente, con `MessageView` (`at`, `text` y `from`: `actor`, `tool?`, `change?`, `folder`).
- CLI:
  - `store/messages.ts`: `leaveMessage(git, id, message)`, `anyMessages(git)` y `takeMessages(git, id)`, que lee y borra en orden de llegada; si otro proceso borró antes un archivo, ese mensaje es suyo.
  - `commands/message.ts`: el comando, que busca el cambio con `locateChanges`, y `withMessages(session, verdict)`, que el guard usa tras un comando: si hay mensajes para el cambio abierto de la carpeta, los añade al texto del veredicto, que pasa a no permitir para que llegue al modelo.
  - `commands/agent-commands.ts` lo registra; `enforce/guard.ts` llama a `withMessages` en el evento tras un comando.

## Archivos

- crear packages/core/src/cards/messages.ts — las tarjetas de `specty message` y el texto de los mensajes que llegan
- modificar packages/core/src/cards/index.ts — exporta sus funciones
- crear packages/core/test/cards/messages.test.ts — los textos en español y en inglés
- crear packages/cli/src/store/messages.ts — guardar y tomar los mensajes de un cambio
- crear packages/cli/src/commands/message.ts — el comando y la entrega tras un comando
- modificar packages/cli/src/commands/agent-commands.ts — registra `message`
- modificar packages/cli/src/enforce/guard.ts — entrega los mensajes tras un comando de shell
- crear packages/cli/test/message.test.ts — dejar un mensaje y las negativas
- crear packages/cli/test/message-delivery.test.ts — la entrega tras el siguiente comando, una sola vez
- modificar docs/formats.md — `messages/<id>/` en `.git/common/specty/`
- modificar docs/ARCHITECTURE.md — el comando y la entrega
- modificar docs/dominio.md — el término «Mensaje»

## Tareas

- [x] T1: Los textos de los mensajes
  - files: packages/core/src/cards/messages.ts, packages/core/src/cards/index.ts, packages/core/test/cards/messages.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/messages.test.ts && pnpm lint
- [ ] T2: `specty message` deja el mensaje
  - files: packages/cli/src/store/messages.ts, packages/cli/src/commands/message.ts, packages/cli/src/commands/agent-commands.ts, packages/cli/test/message.test.ts
  - ac: AC1, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/message.test.ts && pnpm typecheck && pnpm lint
- [ ] T3: El guard entrega los mensajes tras un comando, y la documentación
  - files: packages/cli/src/commands/message.ts, packages/cli/src/enforce/guard.ts, packages/cli/test/message-delivery.test.ts, docs/formats.md, docs/ARCHITECTURE.md, docs/dominio.md
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/message-delivery.test.ts test/enforce.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: Un mensaje llega como si fuera un aviso del guard — el texto empieza diciendo que es un mensaje de otra sesión y de quién, y no pide deshacer nada.
- R2: Dos sesiones en la misma carpeta — lo recibe la primera que termina un comando; la otra no.
