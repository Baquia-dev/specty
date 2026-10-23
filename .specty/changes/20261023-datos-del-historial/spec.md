---
kind: standard
follows:
  - 20261023-vista-de-cierre
---

# Datos del historial

## Objetivo

La vista de cada cambio trae su historia: los eventos de `audit.jsonl` como una línea de tiempo legible (quién, qué y cuándo), cada uno con su tipo para poder filtrar. Los cambios de ejemplo traen su historia completa, desde que se crearon hasta su fase actual.

## Fuera de alcance

- La pestaña Historial: va en el cambio siguiente.
- Exportar la historia y la vista de trazabilidad tipo blame.
- Que la CLI registre eventos nuevos, como el envío del cierre.

## Supuestos

- A1: Cada evento de `audit.jsonl` (formats.md §4) se vuelve una entrada con su momento, su actor (la persona, el agente con su herramienta, o Specty), un título en español e inglés («Aprobó la revisión 3», «Terminó T1») y sus detalles (el comentario, el comando y la duración, el commit y el resumen, las rutas y el motivo, la petición literal…). Un evento que no se conoce, o con datos incompletos, aparece con su nombre y lo que se pueda leer, sin perderse.
  - impacto: alto
- A2: Las entradas se agrupan en tipos para filtrar: spec (creación, propuestas, supuestos, cambios pedidos y aprobaciones), tareas, verificaciones (de tarea y completa), alcance, ajustes y cierre (aceptación, cierre enviado, cerrado, cancelado y retro). Lo que no encaja va en «otros».
  - impacto: alto
- A3: La historia va de lo más antiguo a lo más reciente, en el orden de `audit.jsonl`, como se lee una historia; la pestaña decide cómo agruparla.
- A4: El envío del cierre no tiene evento propio: la CLI registra un `spec.proposed` estando en cierre. Un `spec.proposed` después de `change.accepted` se cuenta como «Envió el cierre».
- A5: `records.ts` está en 300 líneas: la fuente de datos (`SpectyData` y `ActionError`) se muda a `data/source.ts`, y `records.ts` la reexporta, así no cambia nada de quien la importa.
- A6: Los cambios de ejemplo traen su historia: creación, propuesta y aprobación de la spec y, según su fase, tareas, alcance, ajustes, aceptación y cierre, coherente con lo que ya muestran (commits, verificaciones y solicitudes).

## Criterios de aceptación

- AC1: CUANDO un cambio tiene eventos ENTONCES su vista trae cada uno con su momento, su actor, su tipo, un título y sus detalles, del más antiguo al más reciente.
- AC2: CUANDO llega un evento desconocido o con datos incompletos ENTONCES aparece igual, con su nombre, sin romper la historia.
- AC3: CUANDO el agente envía el cierre ENTONCES la historia lo cuenta como el cierre enviado, no como otra propuesta de la spec.
- AC4: CUANDO se abre un cambio de ejemplo ENTONCES su historia va desde su creación hasta su fase actual.

## Diseño

- **Historia** (`data/history.ts`): `historyOf(audit)` devuelve las entradas `{ at, actor, tool?, type, title, details }`, con título y detalles bilingües. Pura: corre en el worker.
- **Vista** (`data/records.ts`, `data/views.ts`): `ChangeView.history`.
- **Fuente** (`data/source.ts`): `SpectyData` y `ActionError`, reexportados por `records.ts`.
- **Ejemplos** (`data/sample-history.ts`, `data/sample-records.ts`): la historia de cada cambio de ejemplo, unida por orden de tiempo a los eventos que ya traen.

## Archivos

- crear packages/ui/src/data/history.ts — la historia desde `audit.jsonl`
- crear packages/ui/src/data/history.test.ts — tests de la historia
- crear packages/ui/src/data/source.ts — la fuente de datos, fuera de `records.ts`
- modificar packages/ui/src/data/records.ts — reexporta la fuente; la historia en la vista
- modificar packages/ui/src/data/views.ts — la historia de cada cambio
- modificar packages/ui/src/data/views.test.ts — test de la historia en la vista
- crear packages/ui/src/data/sample-history.ts — la historia de los cambios de ejemplo
- modificar packages/ui/src/data/sample-records.ts — los ejemplos con su historia
- modificar packages/ui/src/data/sample-specs.test.ts — la historia de los ejemplos

## Tareas

- [x] T1: La historia de un cambio
  - files: packages/ui/src/data/history.ts, packages/ui/src/data/history.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/history.test.ts
- [ ] T2: La historia en la vista
  - files: packages/ui/src/data/source.ts, packages/ui/src/data/records.ts, packages/ui/src/data/views.ts, packages/ui/src/data/views.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/views.test.ts
- [ ] T3: La historia de los ejemplos
  - files: packages/ui/src/data/sample-history.ts, packages/ui/src/data/sample-records.ts, packages/ui/src/data/sample-specs.test.ts
  - ac: AC4
  - verify: pnpm check
