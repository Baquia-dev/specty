---
kind: standard
epic: 20261030-memoria-de-specty
slice: C7
---

# La memoria de Specty y quién lleva cada cambio en specty ui

## Objetivo

La memoria de Specty y quién lleva cada cambio solo se ven en la terminal, con `specty memory` y `specty status`. Con este corte, `specty ui` gana la página «Memoria», con la maqueta que aprobó la persona el 2026-11-03: «Te toca» (las entradas que un agente propuso descartar, los cambios que esperan su decisión y los recordatorios), «Quién lleva cada cambio» (con los huérfanos), los pendientes y las mejoras, y las decisiones. Es la primera parte del AC12 de la épica, de solo lectura.

## Fuera de alcance

- La búsqueda, el filtro por tipo, ver las entradas hechas y descartadas, y que la página se actualice sola al escribir en la memoria: van en el cambio que sigue a este.
- Descartar, mantener o marcar hecha una entrada desde la UI, con su diálogo y el aviso de solo lectura: van en otro cambio después.
- Las notas de la bitácora (`change.noted`) en la página de cada cambio.

## Supuestos

- A1: `GET /api/memory` da `{ entries, changes }`: todas las entradas de la rama de la memoria (`readMemory`) y los cambios abiertos de todas las worktrees como los ve `specty status` (`openChanges`, con quién lo lleva y si es huérfano). Es una lectura, también para el servidor que arrancó el agente.
  - impacto: alto
- A2: «Te toca» junta las entradas propuestas para descartar (con quién lo propuso y su motivo), los cambios que esperan a la persona y los recordatorios abiertos, por ese orden. Una entrada que sale en «Te toca» no se repite debajo.
  - impacto: alto
- A3: «Pendientes y mejoras» lista los abiertos por fecha, con su id, su tipo, la primera línea de su texto, el cambio que la tomó si alguno lo hizo, y su origen (cambio, quién y día); «Decisiones» lista las abiertas con la cita de la persona. Una sección sin nada no sale; sin nada en ninguna, la página dice que la memoria está vacía.
- A4: Las filas siguen el estilo de la Bandeja: sin líneas entre ellas, con el resaltado suave al pasar el puntero o con el foco, y las secciones con su divisor. Cada cambio enlaza con su página.
- A5: El prototipo (`FixtureData`, sin servidor) trae una memoria de ejemplo con cada caso.

## Criterios de aceptación

- AC1: CUANDO la UI pide `GET /api/memory` con la sesión ENTONCES recibe todas las entradas de la memoria y los cambios abiertos con su fase, a quién esperan, quién los lleva y si son huérfanos.
- AC2: CUANDO la persona abre la página «Memoria» de `specty ui` ENTONCES ve «Te toca» con las propuestas de descartar, los cambios que esperan su decisión y los recordatorios, y «Quién lleva cada cambio» con cada cambio abierto, quién lo lleva o que es huérfano, y el enlace a su página.
- AC3: CUANDO la memoria tiene pendientes, mejoras o decisiones abiertas ENTONCES la página las lista en sus secciones con su id, su tipo, su texto, quién las tomó y su origen, y la cita de cada decisión; sin entradas ni cambios, dice que la memoria está vacía.

## Diseño

- CLI: `readApi` (`server/http.ts`) sirve `/api/memory` con `readMemory` y `openChanges`.
- UI:
  - `data/records.ts`: `MemoryRecord` (`entries` y `changes`, con los tipos de core).
  - `SpectyData.memory()`, que sin servidor no da nada; `ServerData` lo lee de `/api/memory` y lo valida (`isMemoryRecord` en `data/server-answers.ts`); `FixtureData` da la memoria de ejemplo de `data/sample-memory.ts`.
  - `memory/memory-view.ts`: `memorySections(record)`, las secciones de la página en orden, sin repetir entradas.
  - `memory/memory-page.ts`: la página, que lee `memory()` con un `resource` y lo vuelve a leer con cada evento de `subscribe`, como el modo delegado.
  - `app/routes.ts` (`/memory`) y `app/shell.ts` (el enlace «Memoria» junto a «Bandeja»).

## Archivos

- modificar packages/cli/src/server/http.ts — `GET /api/memory`
- modificar packages/ui/src/data/records.ts — `MemoryRecord`
- modificar packages/ui/src/data/source.ts — `SpectyData.memory()`
- modificar packages/ui/src/data/server.ts — la lee del servidor
- modificar packages/ui/src/data/server-answers.ts — `isMemoryRecord`
- modificar packages/ui/src/data/fixtures.ts — la da en el prototipo
- crear packages/ui/src/data/sample-memory.ts — la memoria de ejemplo
- crear packages/ui/src/memory/memory-view.ts — las secciones de la página
- crear packages/ui/src/memory/memory-page.ts — la página «Memoria»
- modificar packages/ui/src/app/routes.ts — la ruta `/memory`
- modificar packages/ui/src/app/shell.ts — el enlace en la navegación
- crear packages/cli/test/server/memory.test.ts — `GET /api/memory` con la memoria real
- crear packages/ui/src/memory/memory-view.test.ts — las secciones, su orden y sin repetir
- crear packages/ui/src/memory/memory-page.test.ts — la página con la memoria de ejemplo y vacía
- modificar docs/ARCHITECTURE.md — `GET /api/memory` y la página «Memoria»

## Tareas

- [x] T1: `GET /api/memory`
  - files: packages/cli/src/server/http.ts, packages/cli/test/server/memory.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server/memory.test.ts test/server/actions.test.ts && pnpm lint
- [x] T2: La memoria en los datos de la UI y las secciones de la página
  - files: packages/ui/src/data/records.ts, packages/ui/src/data/source.ts, packages/ui/src/data/server.ts, packages/ui/src/data/server-answers.ts, packages/ui/src/memory/memory-view.ts, packages/ui/src/memory/memory-view.test.ts
  - ac: AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/memory/memory-view.test.ts && pnpm lint
- [x] T3: La página «Memoria», la memoria de ejemplo y la documentación
  - files: packages/ui/src/data/fixtures.ts, packages/ui/src/data/sample-memory.ts, packages/ui/src/memory/memory-page.ts, packages/ui/src/app/routes.ts, packages/ui/src/app/shell.ts, packages/ui/src/memory/memory-page.test.ts, docs/ARCHITECTURE.md
  - ac: AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/memory/memory-page.test.ts --include src/memory/memory-view.test.ts --include src/inbox/inbox.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: Leer la memoria y los cambios abiertos en cada evento hace lenta la página — son los mismos procesos de git que `specty status` y `specty memory`, y solo con la página abierta.
- R2: La forma de `/api/memory` cambia con el corte y la UI se rompe — `isMemoryRecord` la valida y la página enseña el error, como la Bandeja.

## Cierre

### Resumen

`specty ui` tiene la página «Memoria» (`/memory`, junto a la Bandeja en la navegación), con la maqueta que aprobó la persona. «Te toca» junta las entradas que un agente propuso descartar (con quién y por qué), los cambios que esperan su decisión y los recordatorios. «Quién lleva cada cambio» lista los cambios abiertos con su fase, a quién esperan, quién los lleva o que son huérfanos, y el enlace a cada uno. Debajo van los pendientes y las mejoras abiertos por fecha, con quién los tomó y su origen, y las decisiones con su cita; una entrada no sale dos veces, y sin nada que enseñar la página dice que la memoria está vacía. Los datos llegan de `GET /api/memory` (`{ entries, changes }`, de `readMemory` y `openChanges`), y el prototipo trae una memoria de ejemplo. Es la parte de solo lectura del AC12 de la épica.

### Desviaciones

- Dos tests existentes de `packages/ui/src/app/shell.test.ts` fijaban la lista exacta de enlaces de la navegación; con el enlace «Memoria» se actualizaron para incluir `/memory`, con la autorización del usuario, pedida antes de tocarlos.
- `specty check` pidió acortar `sampleMemory`: los datos de ejemplo pasaron a constantes.
- Las lecturas de la API que solo miran la sesión (cambios, modo delegado y memoria) se sirven desde una tabla, para no subir la complejidad de `readApi`.

### Decisiones

- Los recordatorios salen solo en «Te toca», y no en una sección propia, para no repetirlos.
- El color de cada tipo de entrada toma prestado el de una fase (pendiente, borrador; mejora, implementación; recordatorio, aceptación; decisión, revisión), como en la maqueta.

### Pendientes

- Página «Memoria» de `specty ui`, segundo cambio del corte C7 de la épica «Memoria de Specty»: la barra con búsqueda, filtro por tipo (pendientes, mejoras, recordatorios, decisiones) y la casilla para ver las entradas hechas y descartadas, como en la maqueta aprobada; y que la página se actualice sola al escribir en la memoria, añadiendo la punta de la rama `specty-memory` a la firma de `fingerprint` en `packages/cli/src/server/events.ts`.
- Página «Memoria» de `specty ui`, tercer cambio del corte C7: las acciones de la persona, solo con `specty ui` arrancado desde su terminal (`context.actions`): «Descartar» con el diálogo del motivo (lleva el de la propuesta si la hay), «Mantener» para una propuesta y «Marcar hecho» para un recordatorio, por `POST` con la cookie y el CSRF como las demás acciones, con `dropEntry` y `keepEntry` de `packages/cli/src/commands/memory-drop.ts` en una sesión de persona (`onScreen`); y el aviso de solo lectura cuando no hay acciones.
