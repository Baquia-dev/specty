---
kind: standard
---

# El ajuste de las tareas pendientes se reconoce sin tarea activa y en la descripción MCP

## Objetivo

Desde P258, `specty adjust` también se pide mientras se implementa, para corregir las tareas pendientes. Pero la tarjeta de `adjusting` solo lo reconoce si hay una tarea activa: pedido justo tras aprobar la spec, antes de que `next` active una, da la clasificación de aceptación, aunque `propose` lo limite con `pending-tasks-only` (P267). Y la descripción MCP de `specty_adjust` aún dice que el ajuste solo se pide en aceptación (P266). Con este cambio, la tarjeta reconoce ese ajuste con el mismo criterio que `propose`, y la descripción MCP nombra las dos fases.

## Fuera de alcance

- Que la regla de las tareas hechas y `pending-tasks-only` corran también en `review` (P191): va en un cambio propio.
- Cambiar qué admite un ajuste pedido mientras se implementa, o la tarjeta de `adjusting` de una épica.
- Traducir las descripciones de las herramientas MCP, que van en inglés como las demás.

## Supuestos

- A1: La tarjeta de `adjusting` reconoce el ajuste de las tareas pendientes con el criterio de `propose`: la revisión aprobada aún tiene tareas sin completar. La CLI lo calcula con la función que ya usa `checkAdjusting`, que core exporta (`adjustsPendingTasks`), y lo pasa a la tarjeta en `ChangeView.pendingTasksOnly`. No basta con mirar las tareas de la spec: en un ajuste pedido en aceptación, las tareas nuevas que el agente ya escribió aparecen sin hacer.
  - impacto: alto
- A2: Con este criterio, la tarea activa deja de decidir la tarjeta: una tarea activa siempre está en la revisión aprobada y sin completar, así que el ajuste pedido con ella se sigue reconociendo.
  - impacto: medio
- A3: La CLI solo lee la revisión aprobada en `adjusting` y para un cambio que no es una épica, cuya tarjeta no la usa.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO el agente ejecuta `specty adjust` en `implementing` antes de que `next` active una tarea, como justo tras aprobar la spec ENTONCES la tarjeta de `adjusting` pide corregir solo las tareas pendientes («CÓMO CORREGIRLAS») y no da la clasificación de aceptación.
- AC2: CUANDO se pide un ajuste con el resultado en aceptación y la spec ya añade una tarea nueva ENTONCES la tarjeta de `adjusting` sigue dando la clasificación («CÓMO CLASIFICARLA»).
- AC3: CUANDO un cliente MCP lista las herramientas ENTONCES la descripción de `specty_adjust` dice que el ajuste se pide con el resultado en aceptación o mientras se implementa, para corregir las tareas pendientes.

## Diseño

- `core/validate/phase.ts`: exporta `adjustsPendingTasks(approved, done)`, el criterio que ya usa `checkAdjusting`; `core/index.ts` lo publica.
- `core/cards/view.ts`: `ChangeView.pendingTasksOnly?: boolean`, en `adjusting`, el ajuste se pidió mientras se implementaban las tareas.
- `core/cards/work.ts`: `adjustingCard` da «CÓMO CORREGIRLAS» con `pendingTasksOnly`, en lugar de mirar si hay una tarea activa.
- `cli/flow/views.ts`: en `adjusting`, y si el cambio no es una épica, lee la revisión aprobada y calcula `pendingTasksOnly` con las tareas hechas del estado.
- `cli/mcp/tools.ts`: la descripción de `specty_adjust`.

## Archivos

- modificar packages/core/src/validate/phase.ts — exporta el criterio del ajuste de las tareas pendientes
- modificar packages/core/src/index.ts — lo publica para la CLI
- modificar packages/core/src/cards/view.ts — `ChangeView.pendingTasksOnly`
- modificar packages/core/src/cards/work.ts — la tarjeta de `adjusting` lo usa en lugar de la tarea activa
- modificar packages/core/test/cards/adjust.test.ts — la tarjeta sin tarea activa y la de aceptación con una tarea nueva
- modificar packages/cli/src/flow/views.ts — calcula `pendingTasksOnly` con la revisión aprobada
- modificar packages/cli/src/mcp/tools.ts — la descripción de `specty_adjust`
- modificar packages/cli/test/epic-adjust.test.ts — el ajuste justo tras aprobar y el de aceptación con una tarea nueva, de punta a punta
- modificar packages/cli/test/mcp.test.ts — la descripción de `specty_adjust`
- modificar docs/ARCHITECTURE.md — §12: cómo reconoce la tarjeta el ajuste de las tareas pendientes

## Tareas

- [ ] T1: La tarjeta de `adjusting` reconoce el ajuste de las tareas pendientes sin tarea activa
  - files: packages/core/src/validate/phase.ts, packages/core/src/index.ts, packages/core/src/cards/view.ts, packages/core/src/cards/work.ts, packages/core/test/cards/adjust.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/adjust.test.ts test/validate/phase.test.ts
  - type: fix
- [ ] T2: La CLI pasa a la tarjeta el ajuste de las tareas pendientes, y la descripción MCP nombra las dos fases
  - files: packages/cli/src/flow/views.ts, packages/cli/src/mcp/tools.ts, packages/cli/test/epic-adjust.test.ts, packages/cli/test/mcp.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/epic-adjust.test.ts test/mcp.test.ts && pnpm typecheck && pnpm lint
  - type: fix
- [ ] T3: La documentación de cómo se reconoce el ajuste de las tareas pendientes
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: grep -q 'pendingTasksOnly' docs/ARCHITECTURE.md
  - type: docs

## Riesgos

- R1: Leer la revisión aprobada en cada `next` en `adjusting` — es un archivo pequeño, y solo en esa fase y fuera de una épica.
