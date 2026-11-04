---
kind: standard
---

# Los mensajes que esperan, a la vista

## Objetivo

`specty message` deja el mensaje sin decir si alguna sesión trabaja ahora en ese cambio, y ni `specty status` ni la UI dicen cuántos mensajes esperan. Con este cambio, quien envía sabe si una sesión lleva ahora el cambio o si el mensaje esperará a la que lo retome, y `status`, su `--json` y la página «Memoria» cuentan los mensajes que esperan en cada cambio abierto.

## Fuera de alcance

- Leer o borrar los mensajes desde `status` o la UI: siguen llegando a la sesión del cambio tras su siguiente comando.
- Avisar a la sesión del cambio en el momento: el mensaje le llega como hoy, tras su siguiente comando.
- Mostrar los mensajes en otras páginas de la UI que no sean «Memoria».

## Supuestos

- A1: Una sesión «trabaja ahora» en un cambio cuando la actividad de `.git/common/specty/activity/` tiene un paso en su carpeta en los últimos `memory.orphanAfterMin` minutos: el mismo `holder` que ya calcula `status`, sin huérfano.
  - impacto: alto
- A2: Los mensajes que esperan son los archivos de `messages/<id>/`: la sesión los borra al leerlos, así que contarlos dice cuántos quedan.

## Criterios de aceptación

- AC1: CUANDO se deja un mensaje para un cambio cuya carpeta tuvo un paso de una sesión en los últimos `memory.orphanAfterMin` minutos ENTONCES `specty message` dice qué agente lo lleva ahora y hace cuánto dio su último paso.
- AC2: CUANDO se deja un mensaje para un cambio en cuya carpeta ninguna sesión dio un paso en ese tiempo ENTONCES `specty message` dice que ahora ninguna sesión trabaja en él y que el mensaje le llegará a la que lo retome.
- AC3: CUANDO un cambio abierto tiene mensajes que esperan ENTONCES su línea de `specty status` dice cuántos, en español y en inglés, y `specty --json status` los da en `messages`; sin mensajes, la línea no dice nada.
- AC4: CUANDO la página «Memoria» muestra un cambio abierto con mensajes que esperan ENTONCES la línea bajo el cambio dice cuántos esperan.

## Diseño

- Core:
  - `StatusEntry.messages?: number`, los mensajes que esperan; solo si hay alguno.
  - `statusLine` (`cards/status.ts`) añade «· 2 mensajes esperan» / «· 2 messages waiting» (singular con uno).
  - `messageLeftCard(id, text, ctx, holder?)` (`cards/messages.ts`): tras la línea de hoy, «Ahora lo lleva claude-code (último paso hace 2 min).» o «Ahora ninguna sesión trabaja en ese cambio: le llegará a la que lo retome.»
- CLI:
  - `store/messages.ts`: `waitingCount(git, id)` cuenta los `.json` de `messages/<id>/`.
  - `commands/status.ts`: `openChanges` añade `messages` a cada cambio con alguno (solo mira si `anyMessages`).
  - `commands/message.ts`: busca el cambio en `openChanges` (abierto o no, y su `holder`) y pasa el `holder` a la tarjeta si no es huérfano y su último paso cae en `memory.orphanAfterMin`.
- UI: `memory/memory-lines.ts` `changeLine` añade «N mensajes esperan» / «N messages waiting».

## Archivos

- modificar packages/core/src/cards/status.ts — `messages` en `StatusEntry` y en la línea de `status`
- modificar packages/core/src/cards/messages.ts — quién lleva el cambio al dejar el mensaje
- modificar packages/cli/src/store/messages.ts — contar los mensajes que esperan
- modificar packages/cli/src/commands/status.ts — los mensajes de cada cambio abierto
- modificar packages/cli/src/commands/message.ts — quién lleva el cambio, a la tarjeta
- modificar packages/ui/src/memory/memory-lines.ts — los mensajes bajo el cambio
- crear packages/core/test/cards/messages-waiting.test.ts — las tarjetas en español y en inglés
- crear packages/cli/test/message-holder.test.ts — `message` y `status` con y sin sesión, con y sin mensajes
- crear packages/ui/src/memory/memory-messages.test.ts — la línea del cambio con mensajes
- modificar docs/ARCHITECTURE.md — lo que dicen `message` y `status` de los mensajes
- modificar docs/formats.md — `messages` en `status --json`

## Tareas

- [x] T1: Las tarjetas dicen quién lleva el cambio y cuántos mensajes esperan
  - files: packages/core/src/cards/status.ts, packages/core/src/cards/messages.ts, packages/core/test/cards/messages-waiting.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/messages-waiting.test.ts test/cards/messages.test.ts test/cards/status-holder.test.ts && pnpm typecheck && pnpm lint
- [x] T2: `message` y `status` miran la actividad y los mensajes
  - files: packages/cli/src/store/messages.ts, packages/cli/src/commands/status.ts, packages/cli/src/commands/message.ts, packages/cli/test/message-holder.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/message-holder.test.ts test/message.test.ts test/status-json.test.ts test/status-away.test.ts && pnpm typecheck && pnpm lint && pnpm exec knip
- [x] T3: La página «Memoria» cuenta los mensajes que esperan
  - files: packages/ui/src/memory/memory-lines.ts, packages/ui/src/memory/memory-messages.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/memory/memory-messages.test.ts --include src/memory/memory-lines.test.ts && pnpm typecheck && pnpm lint
- [x] T4: La documentación
  - files: docs/ARCHITECTURE.md, docs/formats.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: `status` lee la carpeta de mensajes de cada cambio — solo si `anyMessages` encuentra alguno, una lectura de carpeta.
