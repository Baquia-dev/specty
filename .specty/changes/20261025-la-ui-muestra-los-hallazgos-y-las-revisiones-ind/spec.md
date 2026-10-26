---
kind: standard
---

# La UI muestra los hallazgos y las revisiones independientes

## Objetivo

`specty task done --finding` guarda lo que el agente aprendió en cada tarea, y `specty review` pide a otro modelo una revisión independiente de la spec o del resultado. El agente ve las dos cosas en sus tarjetas, pero la persona, que decide en la UI, no ve ninguna. Ahora la pestaña Aceptación muestra los hallazgos de las tareas y la revisión independiente del resultado, y la pestaña Spec, la de la spec, con su texto.

## Fuera de alcance

- Pedir una revisión desde la UI.
- Dar formato Markdown al texto de una revisión: va como texto, tal cual.
- Los hallazgos de los cambios que este sigue.

## Supuestos

- A1: De cada tarea cuentan los hallazgos de su último `task.completed`, como los avisos.
- A2: De cada objetivo, la spec o el resultado, se muestra la última revisión con respuesta; una que falló no tiene texto y no se muestra.
- A3: El servidor lee el texto de cada revisión del archivo que anota `review.completed` (en `reviews/` del cambio) y lo sirve con el cambio.

## Criterios de aceptación

- AC1: CUANDO las tareas anotaron hallazgos ENTONCES Aceptación los lista en su propia sección, cada uno con su tarea, y explica que el cierre los lleva a Pendientes.
- AC2: CUANDO hay una revisión independiente del resultado ENTONCES Aceptación la muestra con su revisión, cuándo se hizo y su texto, y recuerda que es información y que decide la persona.
- AC3: CUANDO hay una revisión independiente de la spec ENTONCES la pestaña Spec la muestra igual, encima de las secciones.
- AC4: CUANDO el servidor sirve un cambio ENTONCES incluye el texto de sus revisiones (`reviews`), y ARCHITECTURE §15 y docs/ui.md lo cuentan.

## Archivos

- modificar packages/cli/src/server/records.ts — las revisiones con su texto
- modificar packages/cli/test/server.test.ts — el servidor las sirve
- modificar packages/ui/src/data/records.ts — `ReviewRecord`, `FindingView` y la vista del cambio
- crear packages/ui/src/data/findings.ts — los hallazgos de cada tarea
- crear packages/ui/src/data/findings.test.ts — su prueba
- modificar packages/ui/src/data/views.ts — los hallazgos y la última revisión de cada objetivo
- crear packages/ui/src/acceptance/acceptance-findings.ts — la sección Hallazgos
- crear packages/ui/src/acceptance/acceptance-findings.test.ts — su prueba
- crear packages/ui/src/review/independent-review.ts — una revisión independiente
- crear packages/ui/src/review/independent-review.test.ts — su prueba
- modificar packages/ui/src/acceptance/acceptance-tab.ts — los hallazgos y la revisión del resultado
- modificar packages/ui/src/review/spec-review.ts — la revisión de la spec
- modificar docs/ui.md — Aceptación y Revisión de spec
- modificar docs/ARCHITECTURE.md — §15: `reviews`

## Tareas

- [x] T1: El servidor sirve el texto de las revisiones
  - files: packages/cli/src/server/records.ts, packages/cli/test/server.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server.test.ts
- [x] T2: La vista del cambio trae los hallazgos y las revisiones
  - files: packages/ui/src/data/records.ts, packages/ui/src/data/findings.ts, packages/ui/src/data/findings.test.ts, packages/ui/src/data/views.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/findings.test.ts --include src/data/views.test.ts
- [ ] T3: Aceptación y Spec los muestran
  - files: packages/ui/src/acceptance/acceptance-findings.ts, packages/ui/src/acceptance/acceptance-findings.test.ts, packages/ui/src/review/independent-review.ts, packages/ui/src/review/independent-review.test.ts, packages/ui/src/acceptance/acceptance-tab.ts, packages/ui/src/review/spec-review.ts, docs/ui.md, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm check
