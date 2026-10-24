---
kind: standard
---

# Las decisiones delegadas se ven en la UI

## Objetivo

En modo delegado, el agente toma las decisiones de la persona, y la auditoría ya lo marca (`data.delegated: true`, y el canal `delegated` en la aprobación), pero la UI no lo distingue: la nota de aprobación dice «Aprobada el … · Ana» como si Ana hubiera aprobado, y el historial no cuenta que decidió el agente. Con este cambio, la nota dice que aprobó el agente de esa persona, y cada decisión delegada del historial lo dice también.

## Fuera de alcance

- El interruptor del modo delegado en la UI: necesita acciones en el servidor local, que todavía solo lee.
- Cambiar cómo la CLI registra las decisiones delegadas.

## Supuestos

- A1: Una aprobación es delegada cuando `state.approved.channel` es `delegated`, y una línea de la auditoría lo es cuando `data.delegated` es `true` (formats.md §4); `approved.by` sigue siendo la persona que delegó.
  - impacto: alto
- A2: La nota de aprobación dice «Aprobada el {fecha} por el agente de {persona}» y, en el historial, cada decisión delegada lleva el detalle «Por delegación: lo decidió el agente», sin otro detalle de canal.

## Criterios de aceptación

- AC1: CUANDO la spec se aprobó por delegación ENTONCES la nota de aprobación dice que la aprobó el agente de la persona, en español y en inglés; las demás aprobaciones siguen igual.
- AC2: CUANDO el historial muestra una decisión que el agente tomó por delegación (aprobar, decidir el alcance, aceptar, cerrar o cancelar) ENTONCES la entrada lleva el detalle «Por delegación: lo decidió el agente».

## Diseño

- `data/views.ts` lleva a la vista si la aprobación fue delegada; `data/revision.ts` lo dice en la nota.
- `data/history.ts` añade el detalle a las líneas con `data.delegated`. Como está en 299 líneas, sus utilidades de texto pasan a `data/history-text.ts`.

## Archivos

- modificar packages/ui/src/data/records.ts — la aprobación de la vista dice si fue delegada
- modificar packages/ui/src/data/views.ts — llevar el canal delegado a la vista
- modificar packages/ui/src/data/revision.ts — la nota de una aprobación delegada
- modificar packages/ui/src/data/revision.test.ts — tests de la nota
- crear packages/ui/src/data/history-text.ts — utilidades de texto del historial
- modificar packages/ui/src/data/history.ts — decisiones delegadas en el historial
- modificar packages/ui/src/data/history.test.ts — tests del historial
- modificar docs/ui.md — Historial: las decisiones delegadas

## Tareas

- [x] T1: La nota de una aprobación delegada
  - files: packages/ui/src/data/records.ts, packages/ui/src/data/views.ts, packages/ui/src/data/revision.ts, packages/ui/src/data/revision.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/revision.test.ts --include src/data/views.test.ts
- [x] T2: Las decisiones delegadas en el historial
  - files: packages/ui/src/data/history-text.ts, packages/ui/src/data/history.ts, packages/ui/src/data/history.test.ts, docs/ui.md
  - ac: AC2
  - verify: pnpm check

## Cierre

### Resumen

La UI distingue las decisiones que el agente tomó por la persona en modo delegado. La nota de una aprobación delegada dice «Aprobada el 21 oct por el agente de Ana Gómez» («Approved on Oct 21 by Ana Gómez's agent»), o «· por el agente de …» cuando la aprobada es una revisión anterior, y en el historial cada línea de la auditoría con `data.delegated` (aprobar, decidir el alcance, aceptar, cerrar o cancelar) lleva el detalle «Por delegación: lo decidió el agente».

### Desviaciones

- `views.test.ts` comprueba también que la vista lleve `approved.delegated`, como test junto a `views.ts`.

### Decisiones

- El detalle del historial sale de `data.delegated`, que la CLI escribe en todas las decisiones delegadas, y no del canal de la aprobación: así vale igual para el alcance, la aceptación, el cierre y la cancelación.
- Las utilidades de texto del historial pasaron a `history-text.ts` para que `history.ts`, que estaba en 299 líneas, tenga sitio.

### Pendientes

- El interruptor del modo delegado en la UI, cuando el servidor local admita acciones.
