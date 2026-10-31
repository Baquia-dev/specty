---
kind: standard
---

# Tiempos de ejecución y estado en la Bandeja para épicas y cambios

## Objetivo

Mostrar en la Bandeja el tiempo total transcurrido o duración para cada elemento de la lista (incluyendo épicas, especificaciones individuales y cambios quick), y para los elementos en curso mostrar dos tiempos: el tiempo transcurrido en su estado o fase actual y su tiempo total de ejecución acumulado.

## Fuera de alcance

- Modificar las pantallas internas de detalle del cambio (`sp-change-page`, pestañas de progreso, aceptación o historial).
- Modificar el formato de los registros físicos en disco (`audit.jsonl` o `state.json`).

## Supuestos

- A1: Para cambios finalizados (`done` o `cancelled`), el tiempo total es la diferencia entre su creación (`change.created` o primer evento de auditoría) y su finalización (`change.closed`, `change.cancelled`, `retro.confirmed` o `change.accepted`), con respaldo en `phaseSince`.
- A2: Para cambios en curso, el tiempo en estado específico corresponde a la duración desde `phaseSince` hasta el instante actual (`now`), y el tiempo total de ejecución corresponde a la duración desde `createdAt` hasta `now`.
- A3: Para bloques de épica en la Bandeja (`block.kind === "epic"`), la cabecera muestra el tiempo total de la épica junto al conteo de cambios, calculado desde el inicio de la épica (o su corte más temprano) hasta su cierre o `now` si está en curso.
- A4: El formato visual bilingüe para los tiempos utiliza las duraciones legibles de Specty (`formatDuration`), mostrando para cambios en curso «Fase: <tiempo>» / «Phase: <tiempo>» y «Total: <tiempo>» / «Total: <tiempo>», y para cambios finalizados «Total: <tiempo>» / «Total: <tiempo>».

## Criterios de aceptación

- AC1: CUANDO se deriva `ChangeView` para cualquier cambio ENTONCES incluye `createdAt` (obtenido de `change.created`, del primer evento de auditoría o de `phaseSince`) y, si el cambio ha finalizado (`done` o `cancelled`), `closedAt` (obtenido del evento de cierre o de `phaseSince`).
- AC2: CUANDO se visualiza una fila `sp-inbox-row` para un cambio en curso ENTONCES muestra bajo o junto a la insignia de fase dos tiempos: el tiempo en la fase actual («Fase: <duración>») y el tiempo total de ejecución acumulado («Total: <duración>»).
- AC3: CUANDO se visualiza una fila `sp-inbox-row` para un cambio finalizado (en «Recientes», sea spec individual, quick o épica) ENTONCES muestra el tiempo total que duró («Total: <duración>»).
- AC4: CUANDO un bloque visual de épica se muestra en la Bandeja ENTONCES la cabecera del bloque (`data-epic-header`) muestra el tiempo total de la épica (`data-epic-duration`) junto al conteo de cambios.

## Diseño

- **Modelo y derivación (`packages/ui/src/data/records.ts`, `packages/ui/src/data/views.ts`)**:
  - Extender `ChangeView` con `createdAt: string` y `closedAt?: string`.
  - En `deriveView`, resolver `createdAt` buscando el evento `change.created` en `audit`, con respaldo en el primer evento de `audit` o en `record.phaseSince`.
  - Para estados finalizados (`done` o `cancelled`), resolver `closedAt` buscando el evento de cierre en `audit` (`change.closed`, `change.cancelled`, `retro.confirmed`, `change.accepted`), con respaldo en `record.phaseSince`.
- **Fila de la Bandeja (`packages/ui/src/inbox/inbox-row.ts`)**:
  - En `InboxRow`, computar `isFinished`, `phaseTime` y `totalTime` utilizando `formatDuration` y el reloj `now()`.
  - Para elementos en curso, mostrar `phaseTime` con `data-phase-time` («Fase: ...») y `totalTime` con `data-total-time` («Total: ...»), conservando el atributo `data-since` para compatibilidad.
  - Para elementos finalizados, mostrar únicamente `totalTime` con `data-total-time` («Total: ...»).
- **Cabecera de épicas en la Bandeja (`packages/ui/src/inbox/inbox.ts`)**:
  - En `Inbox`, calcular `epicDuration(changes)` a partir del inicio de la épica (o corte más antiguo) hasta el final (o `now()` si está en curso), formateado como «Total: ...».
  - Renderizar `data-epic-duration` en `data-epic-header` junto a `data-epic-count`.
- **Documentación (`docs/ui.md`)**:
  - Documentar en la sección de la Bandeja los tiempos mostrados para cambios en curso, finalizados y épicas.

## Archivos

- modificar packages/ui/src/data/records.ts — añadir createdAt y closedAt en ChangeView
- modificar packages/ui/src/data/views.ts — derivar createdAt y closedAt a partir de auditoría y estado
- modificar packages/ui/src/data/views.test.ts — pruebas de derivación de createdAt y closedAt en ChangeView
- modificar packages/ui/src/inbox/inbox-row.ts — mostrar tiempo en fase y tiempo total en filas en curso, y duración en finalizadas
- modificar packages/ui/src/inbox/inbox-row.test.ts — pruebas de visualización de tiempos en filas de la Bandeja
- modificar packages/ui/src/inbox/inbox.ts — mostrar tiempo total en cabeceras de bloques de épica
- modificar packages/ui/src/inbox/inbox.test.ts — pruebas de visualización de duración de épicas en la Bandeja
- modificar docs/ui.md — documentar los tiempos en curso, totales y de épicas en la Bandeja

## Tareas

- [ ] T1: Derivar createdAt y closedAt en ChangeView
  - files: packages/ui/src/data/records.ts, packages/ui/src/data/views.ts, packages/ui/src/data/views.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/views.test.ts
- [ ] T2: Mostrar tiempo en fase y tiempo total de ejecución en inbox-row
  - files: packages/ui/src/inbox/inbox-row.ts, packages/ui/src/inbox/inbox-row.test.ts
  - ac: AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/inbox/inbox-row.test.ts
- [ ] T3: Mostrar tiempo total de épicas en inbox y actualizar documentación
  - files: packages/ui/src/inbox/inbox.ts, packages/ui/src/inbox/inbox.test.ts, docs/ui.md
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/inbox/inbox.test.ts
