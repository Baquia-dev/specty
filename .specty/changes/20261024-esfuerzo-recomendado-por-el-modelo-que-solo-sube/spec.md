---
kind: standard
follows:
  - 20261024-revision-independiente-del-resultado-antes-de-ac
---

# Esfuerzo recomendado por el modelo, que solo sube

## Objetivo

El modelo que redacta la spec puede recomendar más esfuerzo que el que calcula Specty, con su motivo: para revisar la spec y el alcance, en el frontmatter (`effort: { review, reason }`), y para implementar cada tarea, en su campo `effort: <nivel> — <motivo>`. Specty toma siempre el mayor de los dos, así que el modelo puede subirlo pero no bajarlo, igual que el tamaño. El motivo se ve junto al esfuerzo recomendado, y una revisión en `max` también pide la revisión independiente antes de aprobar.

## Fuera de alcance

- Mostrar el esfuerzo del modelo en la UI, que hoy oculta esa pista.
- Cambiar la tabla de esfuerzo por herramienta (`presets/effort.yaml`).
- Partir `cards/work.ts` o `guard/decide.ts`: este cambio no los toca.

## Supuestos

- A1: Los niveles son los de siempre (`low`, `medium`, `high`, `max`); un nivel que no existe es un error de la spec, como un `type` desconocido.
  - impacto: medio
- A2: El esfuerzo de implementación del cambio, el de la línea «implementación X», es el mayor entre el que da su tamaño y los que el modelo pone en sus tareas; el de cada tarea, el mayor entre el suyo calculado y el del modelo.
  - impacto: medio
- A3: Un nivel del modelo por debajo del calculado no se aplica y no avisa: el esfuerzo es una recomendación, no un límite, y el motivo solo aparece cuando sube algo.
- A4: El motivo de una tarea va tras ` — `, como el de los archivos, y es opcional; el del frontmatter es obligatorio.

## Criterios de aceptación

- AC1: CUANDO una spec trae `effort: { review: max, reason: <r> }` en el frontmatter o `effort: high — <m>` en una tarea ENTONCES el parser los lee, el serializador los escribe en forma canónica, y un nivel desconocido da un error con los niveles válidos.
- AC2: CUANDO el modelo recomienda más que Specty ENTONCES `propose` y `approve` muestran el mayor, con «(el modelo lo sube: <r>)», y la tarjeta de la tarea su nivel; CUANDO recomienda menos ENTONCES se queda el de Specty.
- AC3: CUANDO la revisión recomendada queda en `max` y la persona configuró `review.command` ENTONCES `propose` pide `specty review` antes de la aprobación, aunque el cambio no sea L ni XL.
- AC4: CUANDO alguien lee formats.md §1 y ARCHITECTURE §11 ENTONCES encuentra los dos campos y que el modelo solo puede subir el esfuerzo.

## Diseño

- Core, spec: `Frontmatter.effort` (`review`, `reason`) y `Task.effort` (`level`, `reason?`); el tipo `EffortLevel` y la lista de niveles pasan a `spec/model.ts`, y `sizing/effort.ts` los reexporta.
- Core, `sizing/effort.ts`: `recommendEffort(level, spec?)` y `recommendTaskEffort` toman el máximo; `EffortRecommendation.reason` lleva el motivo del modelo cuando sube algo, y `effortLine` lo muestra.
- CLI: `propose` y `approve` pasan la spec a `recommendEffort`; la recomendación de revisión de `propose` también salta con la revisión en `max`.

## Archivos

- modificar packages/core/src/spec/model.ts — los campos `effort` y los niveles
- modificar packages/core/src/spec/frontmatter.ts — leer `effort` del frontmatter
- modificar packages/core/src/spec/read-tasks.ts — leer el campo `effort` de una tarea
- modificar packages/core/src/spec/vocabulary.ts — `effort` entre los campos de tarea
- modificar packages/core/src/spec/serialize.ts — escribir los dos campos
- modificar packages/core/test/spec/parse.test.ts — lectura y error de nivel
- modificar packages/core/test/spec/arbitraries.ts — ida y vuelta con los campos nuevos
- modificar packages/core/src/sizing/effort.ts — el máximo y el motivo
- modificar packages/core/src/cards/text.ts — el motivo en la línea de esfuerzo
- modificar packages/core/test/sizing/sizing.test.ts — el esfuerzo que solo sube
- modificar packages/cli/src/commands/propose.ts — la spec en el esfuerzo y la revisión en `max`
- modificar packages/cli/src/commands/approve.ts — la spec en el esfuerzo
- modificar packages/cli/test/review.test.ts — `propose` con la revisión en `max`
- modificar docs/formats.md — §1: los campos `effort`
- modificar docs/ARCHITECTURE.md — §11: el esfuerzo del modelo solo sube

## Tareas

- [x] T1: Los campos de esfuerzo en la spec
  - files: packages/core/src/spec/model.ts, packages/core/src/spec/frontmatter.ts, packages/core/src/spec/read-tasks.ts, packages/core/src/spec/vocabulary.ts, packages/core/src/spec/serialize.ts, packages/core/test/spec/parse.test.ts, packages/core/test/spec/arbitraries.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/spec
- [x] T2: El esfuerzo del modelo solo sube
  - files: packages/core/src/sizing/effort.ts, packages/core/src/cards/text.ts, packages/core/test/sizing/sizing.test.ts, packages/cli/src/commands/propose.ts, packages/cli/src/commands/approve.ts, packages/cli/test/review.test.ts
  - ac: AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/sizing test/cards && pnpm --filter @baquia-dev/specty exec vitest run test/review.test.ts
- [ ] T3: Documentar el esfuerzo del modelo
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC4
  - verify: pnpm check
  - type: docs
