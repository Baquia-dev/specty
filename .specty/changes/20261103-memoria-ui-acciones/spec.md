---
kind: standard
follows:
  - 20261103-memoria-ui-filtros
---

# La persona descarta, mantiene o marca hechas las entradas desde la página Memoria

## Objetivo

La página «Memoria» de `specty ui` enseña lo que le toca a la persona, pero para decidirlo tiene que ir a la terminal. Con este cambio puede decidirlo en la propia página, como en la maqueta aprobada: «Descartar» abre un diálogo con el motivo, «Mantener» deshace la propuesta de un agente y «Marcar hecho» cierra un recordatorio. Solo funciona si arrancó `specty ui` desde su terminal; si no, la página lo dice. Es el último cambio del corte C7 y del AC12 de la épica, y resuelve la entrada P24 de la memoria.

## Fuera de alcance

- Añadir entradas o tomarlas desde la UI: siguen siendo de `specty memory add` y `specty new --resolves`.
- Recuperar una entrada descartada.

## Supuestos

- A1: Cada acción es un `POST /api/memory/<id>/drop|keep|done` (`drop` con `{ reason }` opcional), con la seguridad de las demás acciones de la persona (cookie, `Origin`, CSRF y servidor arrancado desde una terminal interactiva), en la cola de acciones del servidor. La CLI la ejecuta con la persona decidiendo en pantalla (`onScreen`), así que `drop` descarta de verdad, como desde su terminal. Un rechazo de Specty responde 409 con su tarjeta.
  - impacto: alto
- A2: «Descartar» sale en las propuestas de un agente y, al pasar el puntero o con el foco, en los pendientes, las mejoras y las decisiones; abre un diálogo con el motivo, que trae el de la propuesta si la hay. «Mantener» sale en las propuestas y «Marcar hecho» en los recordatorios. Las entradas cerradas y los cambios no tienen acciones.
  - impacto: alto
- A3: Sin acciones (servidor arrancado por el agente), los botones no salen y la página dice que es de solo lectura y cómo arrancarla para decidir.
- A4: Tras cada acción, la página avisa con un mensaje breve y vuelve a leer la memoria; con el servidor, también le llega el evento `changes` de la memoria.

## Criterios de aceptación

- AC1: CUANDO la persona descarta una entrada desde la página «Memoria», con `specty ui` arrancado desde su terminal ENTONCES queda descartada con su motivo, como con `specty memory drop` desde su terminal, y deja de salir entre las abiertas.
- AC2: CUANDO la persona pulsa «Mantener» en una propuesta de descartar o «Marcar hecho» en un recordatorio ENTONCES la entrada vuelve a estar abierta o queda hecha, y la página se actualiza.
- AC3: CUANDO `specty ui` lo arrancó el agente, sin terminal interactiva ENTONCES el servidor rechaza esas acciones, y la página no enseña sus botones y dice que es de solo lectura.

## Diseño

- CLI:
  - `commands/memory.ts` exporta `personMemoryAction(session, id, verb, reason)`, que ejecuta `dropEntry`, `keepEntry` o `markDone` con su `writerOf`.
  - `server/actions.ts` exporta `parseMemoryAction(pathname, body)` y `memoryAction(session, action)`, que llama a `personMemoryAction` con `onScreen(session)`.
  - `server/http.ts`: `act` despacha `/api/memory/<id>/<verb>` en la cola, como `/api/delegation`.
- UI:
  - `SpectyData.memoryAction(id, verb, reason?)`, que sin servidor se niega por solo lectura; `ServerData` hace el `POST` y `FixtureData` cambia su memoria de ejemplo y avisa.
  - `memory/drop-entry.ts`, nuevo: el diálogo «Descartar <id>» con el texto de la entrada y el motivo.
  - `memory/memory-page.ts`: los botones por fila con `Decisions.allowed()`, el aviso de solo lectura, y el mensaje tras cada acción.

## Archivos

- modificar packages/cli/src/commands/memory.ts — `personMemoryAction`
- modificar packages/cli/src/server/actions.ts — `parseMemoryAction` y `memoryAction`
- modificar packages/cli/src/server/http.ts — despacha las acciones de la memoria
- modificar packages/ui/src/data/source.ts — `SpectyData.memoryAction`
- modificar packages/ui/src/data/server.ts — el `POST` al servidor
- modificar packages/ui/src/data/fixtures.ts — las acciones en el prototipo
- crear packages/ui/src/memory/drop-entry.ts — el diálogo de descartar
- modificar packages/ui/src/memory/memory-page.ts — los botones y el aviso de solo lectura
- crear packages/cli/test/server/memory-actions.test.ts — las acciones con el servidor real
- crear packages/ui/src/memory/memory-actions.test.ts — las acciones en la página, y el modo de solo lectura
- modificar docs/ARCHITECTURE.md — las acciones de la memoria en el servidor y en la página

## Tareas

- [x] T1: Las acciones de la memoria en el servidor
  - files: packages/cli/src/commands/memory.ts, packages/cli/src/server/actions.ts, packages/cli/src/server/http.ts, packages/cli/test/server/memory-actions.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server/memory-actions.test.ts test/server/actions.test.ts test/memory-drop.test.ts && pnpm lint
- [ ] T2: Las acciones en la página «Memoria», y la documentación
  - files: packages/ui/src/data/source.ts, packages/ui/src/data/server.ts, packages/ui/src/data/fixtures.ts, packages/ui/src/memory/drop-entry.ts, packages/ui/src/memory/memory-page.ts, packages/ui/src/memory/memory-actions.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/memory/memory-actions.test.ts --include src/memory/memory-page.test.ts --include src/memory/memory-toolbar.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: Un clic por error descarta una entrada — «Descartar» pasa por un diálogo con el motivo, y la entrada queda en la rama con su historia (`specty memory --all`).
- R2: Un agente con el enlace del servidor descarta en nombre de la persona — solo hay acciones si la persona arrancó `specty ui` desde su terminal, como con las demás decisiones.
