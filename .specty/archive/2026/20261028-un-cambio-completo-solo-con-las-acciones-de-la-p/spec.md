---
kind: quick
---

# Un cambio completo solo con las acciones de la persona en la UI

## Objetivo

El criterio de salida de la fase F2 (ARCHITECTURE §18) es «un cambio completo sin abrir el Markdown». Cada decisión de la persona ya tiene su acción en el servidor de la UI y su test, pero por separado, y en el que recorre alcance, aceptación y cierre la spec se aprueba desde la terminal. Este cambio añade un test que recorre un cambio entero con `policy.tests: contract`, en el que el agente usa la CLI y la persona solo las acciones de la UI: confirmar el supuesto, aprobar la spec, aprobar los tests, decidir el alcance, aceptar y confirmar el cierre. Con ese test en verde, F2 pasa a estar hecha.

## Archivos

- crear packages/cli/test/server/lifecycle.test.ts — el recorrido completo por el servidor de la UI
- modificar docs/ARCHITECTURE.md — §18: F2 hecha, con el test que lo demuestra

## Tareas

- [x] T1: Un cambio completo solo con las acciones de la persona en la UI
  - files: packages/cli/test/server/lifecycle.test.ts, docs/ARCHITECTURE.md
  - verify: pnpm lint && pnpm --filter @baquia-dev/specty build && pnpm --filter @baquia-dev/specty exec vitest run test/server/lifecycle.test.ts
  - type: test

## Cierre

### Resumen

lifecycle.test.ts recorre un cambio con contract de review a done con la persona solo en el servidor de la UI (supuesto, spec, tests, alcance, aceptar, cerrar); pasa a la primera; ARCHITECTURE §18: F2 hecha
