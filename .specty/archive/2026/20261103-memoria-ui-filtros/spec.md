---
kind: standard
follows:
  - 20261103-memoria-ui-c7
---

# La página Memoria busca, filtra y se actualiza sola

## Objetivo

La página «Memoria» de `specty ui` ya enseña la memoria de Specty y quién lleva cada cambio, pero sin la barra de la maqueta aprobada y sin enterarse de lo que se anota mientras está abierta. Con este cambio gana la búsqueda, el filtro por tipo y la casilla para ver las entradas hechas y descartadas, y se actualiza sola cuando alguien escribe en la memoria. Es el segundo cambio del corte C7 de la épica y resuelve la entrada P23 de la memoria.

## Fuera de alcance

- Descartar, mantener o marcar hecha una entrada desde la UI: va en el cambio siguiente (P24).
- Guardar la búsqueda o el filtro entre visitas.

## Supuestos

- A1: La búsqueda compara sin tildes ni mayúsculas (`fold` de core) con el id y el texto de cada entrada, su cita y el cambio de origen o el que la tomó, y con el id y el título de cada cambio. Una sección que se queda sin filas no sale.
  - impacto: alto
- A2: El filtro por tipo (Todas, Pendientes, Mejoras, Recordatorios, Decisiones) deja solo las entradas de ese tipo; con un tipo elegido, los cambios (los que esperan a la persona y quién lleva cada uno) no salen, porque no son entradas.
  - impacto: alto
- A3: «Ver hechas y descartadas» añade al final la sección «Hechas y descartadas», con cada entrada cerrada por fecha y su estado, también filtrada.
- A4: La página se actualiza sola porque la firma que vigila `GET /api/events` (`fingerprint`) incluye la punta de la rama de la memoria: escribir en ella emite `changes`, como cambiar un archivo de un cambio.
- A5: Si el filtro no deja nada, la página lo dice («Nada coincide con el filtro.») en vez de decir que la memoria está vacía.

## Criterios de aceptación

- AC1: CUANDO la persona escribe en la búsqueda de la página «Memoria» ENTONCES solo quedan las entradas y los cambios que la contienen, sin tildes ni mayúsculas, y las secciones que se quedan vacías no salen.
- AC2: CUANDO elige un tipo de entrada ENTONCES solo quedan las entradas de ese tipo, sin los cambios.
- AC3: CUANDO marca «Ver hechas y descartadas» ENTONCES la página añade la sección «Hechas y descartadas» con su estado; y si el filtro no deja nada, lo dice.
- AC4: CUANDO alguien escribe en la memoria con la página abierta ENTONCES el servidor emite `changes` y la página vuelve a leerla.

## Diseño

- `memory/memory-view.ts`: `memorySections(record, filter?)` con `MemoryFilter` (`query`, `kind` y `closed`), y la sección `closed` con los ítems `closed`. Sin filtro, igual que antes.
- `memory/memory-page.ts`: la barra (búsqueda con `fold`, `sp-segmented` para el tipo y la casilla), con señales que alimentan `memorySections`, y el aviso cuando el filtro no deja nada.
- `server/events.ts`: `fingerprint` añade `memory <punta>` con `git rev-parse --verify -q refs/heads/<memory.branch>`.

## Archivos

- modificar packages/ui/src/memory/memory-view.ts — el filtro y la sección de las cerradas
- modificar packages/ui/src/memory/memory-page.ts — la barra y el aviso
- modificar packages/cli/src/server/events.ts — la punta de la memoria en la firma
- crear packages/ui/src/memory/memory-filter.test.ts — el filtro de las secciones
- crear packages/ui/src/memory/memory-toolbar.test.ts — la barra en la página
- crear packages/cli/test/server/memory-events.test.ts — la firma cambia al escribir en la memoria
- modificar docs/ARCHITECTURE.md — la barra y la punta de la memoria en `GET /api/events`

## Tareas

- [x] T1: El filtro de las secciones
  - files: packages/ui/src/memory/memory-view.ts, packages/ui/src/memory/memory-filter.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/memory/memory-filter.test.ts --include src/memory/memory-view.test.ts && pnpm lint
- [x] T2: La barra de la página
  - files: packages/ui/src/memory/memory-page.ts, packages/ui/src/memory/memory-toolbar.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/memory/memory-toolbar.test.ts --include src/memory/memory-page.test.ts && pnpm typecheck && pnpm lint
- [x] T3: La página se actualiza sola, y la documentación
  - files: packages/cli/src/server/events.ts, packages/cli/test/server/memory-events.test.ts, docs/ARCHITECTURE.md
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server/memory-events.test.ts test/server/live.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: La firma lanza un proceso de git más cada segundo — solo mientras alguien escucha `GET /api/events`, como ya pasa con las worktrees.

## Cierre

### Resumen

La página «Memoria» de `specty ui` tiene la barra de la maqueta aprobada: una búsqueda que compara sin tildes ni mayúsculas con los ids, los textos, las citas, los cambios de origen y los títulos de los cambios; un filtro por tipo de entrada (Todas, Pendientes, Mejoras, Recordatorios y Decisiones), que con un tipo elegido deja fuera los cambios; y la casilla «Ver hechas y descartadas», que añade esa sección al final. Si el filtro no deja nada, la página lo dice. Además se actualiza sola: la firma que vigila `GET /api/events` incluye la punta de la rama de la memoria, así que escribir en ella emite `changes`. Es el segundo cambio del corte C7.

### Desviaciones

- Ninguna respecto al plan.
- Al crear el cambio, el freno de duplicados lo comparó con su propia épica por la petición; se creó con `--distinct-from 20261030-memoria-de-specty`, y la mejora quedó en la memoria como P25.

### Decisiones

- El filtro vive en `memorySections`, que sin filtro da lo mismo que antes, así que la página y sus tests anteriores no cambian.

### Pendientes

- P24: las acciones de la persona en la página «Memoria», el último cambio del corte C7.
- P25: el freno de duplicados no debería comparar un cambio que sigue a un corte con la épica de ese corte.
