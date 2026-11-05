---
kind: standard
follows:
  - 20261106-la-bandeja-guarda-solo-el-resumen-de-los
---

# Core da el resumen de un cambio y la UI lo deriva con él

## Objetivo

Hoy las reglas del resumen de un cambio viven solo en la UI, en `data/views.ts`. Ese resumen es lo que muestran la fila de la Bandeja y la cabecera de una épica: el título (o el id), la épica y los cortes, el inicio y el fin, el tamaño con sus motivos, las tareas y la pestaña con la que se abre. Con este cambio, esas reglas pasan a core en una sola función, y la UI deriva con ella la vista de cada cambio, sin que cambie nada de lo que muestra. Es el primer paso de C2 de P178: el cambio siguiente (C2b) hará que el servidor mande en cada página de terminados el resumen de cada cambio, hecho con esa misma función, en lugar del registro completo.

## Fuera de alcance

- Cambiar lo que da `GET /api/changes/finished` o `SpectyData.finished`, o lo que guarda la Bandeja: lo hace C2b, junto con ARCHITECTURE §15 y `docs/ui.md`.
- Cambiar lo que muestra la UI: la fila, la cabecera de una épica, la página de un cambio y sus pestañas se ven igual.
- El título de la épica de un corte y el de su corte: los sigue resolviendo quien lista los cambios (`deriveViews` en la UI), porque dependen de otros cambios.
- Lo demás que deriva `views.ts` (decisión, supuestos de alto impacto, revisión, progreso, historial, avisos…): no lo necesita una lista de terminados.
- Llevar el resumen a `@baquia-dev/specty-core/light`: necesita `computeSize` con la configuración por defecto, que carga el esquema con zod. Además, el hilo principal de la UI nunca calcula un resumen: lo hacen el worker, el chunk perezoso de `views.ts` y, en C2b, el servidor.

## Supuestos

- A1: El resumen usa las mismas reglas que hoy `data/views.ts`, así que la vista que deriva la UI no cambia. El título es el de la spec o, sin él, el id; la épica y el corte salen del frontmatter, y los cortes, de la sección Cortes, con su id y su título (ninguno si no tiene).
- A2: El inicio es el primer `change.created` de la auditoría o, sin él, su primera línea o, sin auditoría, `phaseSince`. El fin solo existe si el cambio está hecho o cancelado: la última entrada `change.closed`, `change.cancelled`, `retro.confirmed` o `change.accepted`, o, sin ninguna, `phaseSince`.
- A3: El nivel del tamaño es el de `state.size` o, sin él, el de `computeSize` con la configuración por defecto; sus motivos salen siempre de `computeSize`, en español y en inglés. Las tareas hechas son las de la sección Tareas cuyo estado es `done`, sobre el total. La pestaña va por la fase: `draft` y `review`, Spec; `testing`, `implementing` y `adjusting`, Progreso; `acceptance` y `closing`, Aceptación; `done` y `cancelled`, Historial.
- A4: El resumen de core lleva de la épica solo su id y su corte. La UI le pone de título el id de la épica, como hoy, y `deriveViews` lo cambia por el de la épica cuando la tiene cargada, con el título del corte.
- A5: La función recibe la auditoría como líneas sin tipo (`readonly unknown[]`), igual que `auditViewOf`, y solo lee de cada una `ts` y `event`; ignora una línea sin `ts`. Así la usan igual la UI, con sus `AuditRecord`, y el servidor de C2b, con las líneas de `audit.jsonl` tal como las lee.
  - impacto: alto
- A6: `ChangeTab` pasa a ser de core, y `data/records.ts` lo reexporta con el mismo nombre. `initialTab` también pasa a core, y `data/views.ts` lo reexporta: sus tests lo importan de allí y no cambian.

## Criterios de aceptación

- AC1: CUANDO core resume un cambio a partir de su spec, su estado, desde cuándo está en su fase y su auditoría ENTONCES da su id, su título (o su id), su tipo, su épica (id y corte), sus cortes si es una épica, su fase, desde cuándo, su inicio y, si terminó, su fin, su tamaño con sus motivos en español y en inglés, sus tareas hechas y totales, y la pestaña con la que se abre, con las reglas de A1 a A3.
- AC2: CUANDO la UI deriva la vista de un cambio ENTONCES toma esos campos del resumen de core y la vista no cambia: los tests de la UI que ya existían pasan sin cambios.
  - test: manual

## Diseño

- `packages/core/src/summary.ts`, con la forma de `cards/audit-view.ts`:
  - `SummarySource`: `{ spec, state, phaseSince, audit }`. Recibe la spec ya leída, como `auditViewOf`, para que cada lado la lea con su parser: la UI en el worker y el servidor con `parseSpec`.
  - `ChangeSummary`: `id`, `title`, `kind`, `epic?` (`id`, `slice?`), `slices?`, `phase`, `phaseSince`, `createdAt`, `closedAt?`, `size` (`level` y `reasons` en `es` y `en`), `tasks` (`done` y `total`) y `tab`.
  - `summarizeChange(source)`: el resumen con las reglas de A1 a A3.
  - `ChangeTab` e `initialTab(phase)`: la pestaña con la que se abre la página de un cambio, por su fase.
- `packages/core/src/index.ts` exporta `summarizeChange`, `initialTab` y los tipos `ChangeSummary`, `ChangeTab` y `SummarySource`.
- `packages/ui/src/data/views.ts`:
  - `deriveView` toma del resumen de core el id, el título, el tipo, la épica (con el id de título), los cortes, la fase, `phaseSince`, el inicio y el fin, el tamaño, las tareas y la pestaña; el esfuerzo lo recomienda con su nivel.
  - Desaparecen `TABS`, `timestampsOf`, `FINISH_EVENTS`, `epicIn` y `slicesIn`. `initialTab` se reexporta desde core.
- `packages/ui/src/data/records.ts`: `ChangeTab` se importa de core como tipo y se reexporta; el resto del archivo no cambia.

## Archivos

- crear packages/core/src/summary.ts — el resumen de un cambio y la pestaña con la que se abre
- modificar packages/core/src/index.ts — exporta `summarizeChange`, `initialTab` y sus tipos
- crear packages/core/test/summary.test.ts — el resumen de un cambio, regla por regla
- modificar packages/ui/src/data/views.ts — deriva la vista con el resumen de core
- modificar packages/ui/src/data/records.ts — `ChangeTab` es el de core

## Tareas

- [x] T1: Core da el resumen de un cambio
  - files: packages/core/src/summary.ts, packages/core/src/index.ts, packages/core/test/summary.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/summary.test.ts test/light.test.ts test/listing.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint && pnpm sources
  - type: refactor
- [x] T2: La UI deriva la vista de un cambio con el resumen de core
  - files: packages/ui/src/data/views.ts, packages/ui/src/data/records.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch && pnpm typecheck && pnpm lint && pnpm knip
  - type: refactor

## Riesgos

- R1: Un detalle de las reglas que cambie al moverlas, como la línea de la auditoría que cuenta como inicio, cambiaría lo que muestra la UI sin que nadie lo note. Mitigación: T2 ejecuta la suite entera de la UI, cuyos tests de `views.ts`, de la Bandeja y de los terminados comprueban esas horas, el tamaño, las tareas y la pestaña, y el test de core comprueba cada regla por separado.

## Cierre

### Resumen

Las reglas del resumen de un cambio pasan de `packages/ui/src/data/views.ts` a core, en `packages/core/src/summary.ts`. Allí, `summarizeChange({ spec, state, phaseSince, audit })` da el id, el título (o el id), el tipo, la épica (id y corte), los cortes de una épica, la fase y `phaseSince`. Da también el inicio y, si terminó, el fin, el tamaño con sus motivos en español y en inglés, las tareas hechas y totales, y la pestaña con la que se abre. `initialTab` y `ChangeTab` también pasan a core, y el índice exporta todo con los tipos `ChangeSummary` y `SummarySource`. `deriveView` toma esos campos del resumen de core, con el id de la épica como su título hasta que `deriveViews` encuentra la épica, y recomienda el esfuerzo con su nivel. Desaparecen `TABS`, `timestampsOf`, `FINISH_EVENTS`, `epicIn` y `slicesIn`. `views.ts` reexporta `initialTab`, y `records.ts` reexporta `ChangeTab`. Lo que muestra la UI no cambia: la suite entera de la UI pasó sin tocar ningún test, igual que `pnpm typecheck`, `pnpm lint` y `pnpm knip`, y `pnpm check` en la aceptación. El test de core comprueba cada regla por separado.

### Desviaciones

- Ninguna.

### Decisiones

- El resumen de core no lleva el título de la épica ni el de su corte: solo los sabe quien tiene la épica cargada (`deriveViews` en la UI y, en C2b, el servidor).
- Una línea de la auditoría con `ts` y sin `event` cuenta como primera línea para el inicio, como antes en la UI, que tomaba el `ts` de la primera sin mirar su evento.
- `FINISH_EVENTS` es una lista de `unknown` para comparar con ella el evento de una línea sin tipo sin hacer un cast.
- `views.ts` importa el `ChangeSummary` de core como `CoreChangeSummary`, para no confundirlo con el `ChangeSummary` de la UI, que lleva el título de la épica.
- El resumen va solo en el índice de core y no en `light`: necesita `computeSize` con la configuración por defecto, que carga zod, y el hilo principal de la UI nunca lo calcula.

### Pendientes

- P178 sigue abierto: lo resuelve C2b, que hará que `GET /api/changes/finished` y `SpectyData.finished` den el resumen de cada cambio con `summarizeChange`, en lugar del registro completo. Hoy la primera página pesa 682.121 bytes por 30 cambios, sobre 539 terminados.
