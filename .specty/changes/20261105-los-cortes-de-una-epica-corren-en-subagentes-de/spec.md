---
kind: standard
---

# Los cortes de una épica corren en subagentes de Antigravity

## Objetivo

Con Antigravity, la tarjeta de una épica aprobada reparte ya sus cortes entre subagentes, como con Claude Code, Codex, OpenCode y Cursor: `invoke_subagent` crea una conversación con su propio `conversationId` y los hooks se disparan para ella con ese id (P82, comprobado con `agy` 1.5.1, P148). La tarjeta pide lanzar cada encargo con `invoke_subagent` y `Workspace: "inherit"`, y el fin de turno de Specty deja de correr para el `Stop` de un subagente, que ya cierra sus tareas con `specty task done` (P151). Un E2E con `agy` real, que solo corre con `SPECTY_E2E_ANTIGRAVITY`, comprueba que el subagente entra en la carpeta de su corte sin mover a la conversación principal.

## Fuera de alcance

- P152: en modo print (`agy -p`), si la conversación principal termina su turno mientras su subagente corre, `agy` sale sin mandar el `Stop` con `fullyIdle: true`; queda como está.
- Devin (Windsurf) y Gemini CLI siguen sin cortes en subagentes (D3).
- Los subagentes lanzados con `Workspace: "branch"` o `"share"`.
- La tarjeta de la tarea que `PreInvocation` inyecta al subagente, que no cambia.
- La columna «Prueba de extremo a extremo» de Antigravity sigue en «no posible»: habla de un modelo simulado, y el E2E nuevo usa un modelo real.

## Supuestos

- A1: Lo único que distingue a un subagente de Antigravity es que su `lastUserInput` llega vacío; la conversación principal lo trae con el texto de la persona en todos los eventos de su turno, también tras la respuesta del subagente y tras el turno que Specty le devuelve con `continue` (visto con `agy` 1.5.1 en `PreInvocation`, `PreToolUse` y `Stop`). El `Stop` que sigue a un `continue` no llegó a verse, porque `agy -p` salió antes, y se supone igual.
  - impacto: alto
- A2: Un evento sin el campo `lastUserInput` (su editor u otra versión) es de una conversación principal: su fin de turno se comprueba como hoy.
- A3: Con `Workspace: "inherit"`, el `workspacePaths` del subagente es el de la conversación que lo lanzó (visto con `agy` 1.5.1), así que, con Antigravity abierto en la carpeta principal, las carpetas de los cortes (`.worktrees/`) quedan a su alcance y el guard le deja entrar con `specty enter`; con `branch`, Antigravity le daría una worktree suya y no la que prepara Specty.
- A4: El modelo de Antigravity puede lanzar varios `invoke_subagent` en un solo mensaje; si los lanza uno tras otro, la tarjeta sigue valiendo.
- A5: El E2E usa un modelo real (`gemini-3.8-flash-low`) con `--mode accept-edits --sandbox` y, en `--settings` (solo para esa sesión), `toolPermission: "proceed-in-sandbox"` y `read_file(<carpeta del bundle>)`, porque el sandbox de `agy` oculta lo que está fuera del espacio de trabajo y en modo print deniega lo que pediría permiso; nunca `--dangerously-skip-permissions`. Los hooks y el prompt llaman al bundle de la rama (`DIST`), que hay que construir antes.

## Criterios de aceptación

- AC1: CUANDO se genera la tabla de capacidades (`capabilityTable`, y ARCHITECTURE §10) ENTONCES Antigravity tiene «sí» en «Cortes en subagentes», y Devin (Windsurf) sigue en «no posible» con su motivo.
- AC2: CUANDO se pide desde Antigravity la tarjeta de una épica aprobada con cortes listos o huérfanos ENTONCES trae un encargo por corte y su `SIGUIENTE:` pide lanzar cada uno con `invoke_subagent` y `Workspace: "inherit"`, en español y en inglés, dentro del presupuesto de la tarjeta; con las demás herramientas el texto no cambia.
- AC3: CUANDO el `Stop` de Antigravity llega con `lastUserInput` vacío (el de un subagente) y `specty check --changed` falla ENTONCES responde `{"decision":"stop"}` sin el informe y sin dejar el turno pendiente; el `Stop` con el texto de la persona, o sin ese campo, se sigue comprobando como hoy.
- AC4: CUANDO la conversación principal de Antigravity entra con `specty enter` en un cambio y lanza con `invoke_subagent` y `Workspace: "inherit"` un subagente que entra con `specty enter` en el cambio de un corte y escribe su spec ENTONCES el guard ata la conversación del subagente a la carpeta del corte, la de la principal sigue en la suya, la spec queda en la carpeta del corte y el subagente termina su turno sin que se le devuelva aunque `specty check --changed` falle allí (con eventos de esa forma, y con `agy` real cuando `SPECTY_E2E_ANTIGRAVITY` da su ruta).

## Diseño

- `core/src/capabilities.ts`: `subagentSlices` de Antigravity pasa a `yes`; `UNDOCUMENTED_SUBAGENTS` queda solo para Devin (Windsurf).
- `core/src/cards/epic.ts`: `subagentsNext`, cuando hay encargos que lanzar, añade tras «un subagente por encargo con su texto tal cual» cómo lanzarlo en Antigravity (`invoke_subagent` con `Workspace: "inherit"`, no `branch`), con el estilo del `ExitWorktree` de Claude Code. Va una vez en el `SIGUIENTE:`, no en cada encargo, para no gastar presupuesto por corte.
- `cli/src/agents/antigravity.ts`: `stop.acts` no actúa con `lastUserInput === ""`; `agent-stop` responde entonces `pass` (`{"decision":"stop"}`) sin ejecutar el check ni tocar `pending/`.
- `cli/test/antigravity-e2e.test.ts`: `describe.skipIf` sin `SPECTY_E2E_ANTIGRAVITY`; repositorio temporal con `init --tools antigravity` y `check --install`, dos cambios con `new --worktree` (el del corte con `--subagent`), el `check --changed` en rojo en la carpeta del corte, y un prompt que pide a la principal entrar en el primero y lanzar el subagente. Comprueba las ligaduras de `sessions/<conversationId>.json` (los ids salen del `stream-json` de `agy`), la spec en la carpeta del corte y que no queda `pending/<subagente>.stop`.

## Archivos

- modificar packages/core/src/capabilities.ts — Antigravity reparte los cortes en subagentes
- modificar packages/core/test/capabilities.test.ts — la fila de Antigravity y el motivo que queda solo para Devin (Windsurf)
- modificar packages/core/src/cards/epic.ts — el `SIGUIENTE:` dice cómo lanzar los encargos en Antigravity
- modificar packages/core/test/cards/epic.test.ts — la tarjeta de la épica desde Antigravity
- modificar packages/core/test/cards/budget.test.ts — el presupuesto de la tarjeta con seis encargos también desde Antigravity
- modificar packages/cli/src/agents/antigravity.ts — el fin de turno salta el `Stop` de un subagente
- modificar packages/cli/test/antigravity-turn.test.ts — el fin de turno de un subagente y su entrada en la carpeta de su corte, con eventos de `agy` 1.5.1
- crear packages/cli/test/antigravity-e2e.test.ts — el E2E con `agy` real, que solo corre con `SPECTY_E2E_ANTIGRAVITY`
- modificar docs/ARCHITECTURE.md — la tabla de capacidades, «Subagentes» (Antigravity), la tarjeta de la épica (§7) y el fin de turno de Antigravity

## Tareas

- [x] T1: Antigravity reparte los cortes de una épica en subagentes
  - files: packages/core/test/capabilities.test.ts, packages/core/src/capabilities.ts, docs/ARCHITECTURE.md
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/capabilities.test.ts
- [ ] T2: La tarjeta de la épica pide lanzar los encargos con `invoke_subagent` y `Workspace: "inherit"` en Antigravity
  - files: packages/core/test/cards/epic.test.ts, packages/core/test/cards/budget.test.ts, packages/core/src/cards/epic.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/epic.test.ts test/cards/budget.test.ts
- [ ] T3: El fin de turno salta el `Stop` de un subagente de Antigravity
  - files: packages/cli/test/antigravity-turn.test.ts, packages/cli/test/antigravity-e2e.test.ts, packages/cli/src/agents/antigravity.ts
  - ac: AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/antigravity-turn.test.ts test/antigravity-e2e.test.ts test/check-agent-stop.test.ts && pnpm typecheck && pnpm lint
  - type: fix
- [ ] T4: La documentación
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: El modelo real no sigue el prompt del E2E de forma fiable — el test solo corre con la variable; se ejecuta una vez antes de aceptar y, si falla por el modelo tras dos intentos, se anota como pendiente.
- R2: Una versión de `agy` que mande `lastUserInput` vacío a la conversación principal dejaría su fin de turno sin comprobar — A1 sale de sondear `agy` 1.5.1; el campo ausente se trata como hoy.
