---
kind: standard
follows:
  - 20261104-frenos-de-los-frentes
---

# El fin de una sesión libera su frente

## Objetivo

Resuelve P58: hoy, tras un `/clear` en Claude Code, la conversación nueva es otra, y el frente sigue siendo de la vieja durante `memory.orphanAfterMin` (60 min), así que el guard no deja a la nueva tomarlo. Con un hook `SessionEnd` de Claude Code, el guard libera el frente de la conversación que termina, sea por `/clear`, al salir o por cualquier otro motivo. De paso resuelve P56: `enforce/guard.ts` (302 líneas de código) pasa lo que juzga `specty enter` dentro de un comando a un archivo propio.

## Fuera de alcance

- El fin de sesión de los demás agentes (Gemini CLI, Cursor, Codex, OpenCode): va con P57, que estudia qué da cada uno.
- Que la conversación nueva herede el frente de la anterior: tras el `/clear` queda libre y la nueva lo toma con `specty front take`.
- Borrar la actividad de la conversación que termina, o los archivos viejos de `activity/` (P3).
- Rehacer los hooks de este repositorio: `specty doctor` avisará y `specty init` los rehace (P7, lo decide la persona).

## Supuestos

- A1: Claude Code llama al hook `SessionEnd` al terminar una sesión, también con `/clear`, con el `session_id` de la conversación que termina, y no espera nada de su salida. Su hook se instala sin matcher, como los de las worktrees, para que salte con cualquier motivo.
  - impacto: alto
- A2: Al terminar, el guard solo borra los registros de los frentes que lleva esa conversación (herramienta y conversación); no anota un paso, para que una conversación que termina no parezca viva, y no responde nada.
- A3: `specty doctor` avisa cuando los hooks de Claude Code no tienen `SessionEnd`, con una línea propia que pide `specty init`, como cuando falta `SessionStart`.
- A4: `enterCommand` y `unreachable` pasan tal cual a `enforce/enter-command.ts`, con su propio tipo de llamada (`agent`, `environment`, `session`, `event`), que la `Call` del guard cumple.

## Criterios de aceptación

- AC1: CUANDO `specty init` instala los hooks de Claude Code ENTONCES su archivo de ajustes lleva `SessionEnd` sin matcher, con el guard de Claude Code.
- AC2: CUANDO Claude Code avisa del fin de la conversación que lleva un frente ENTONCES el frente queda sin dueño, el guard no responde nada y otra conversación lo toma enseguida; los frentes de otras conversaciones siguen como estaban.
- AC3: CUANDO los ajustes de Claude Code no tienen el hook `SessionEnd` de Specty ENTONCES `specty doctor` lo avisa y pide ejecutar `specty init`; tras `init`, el aviso desaparece.
- AC4: CUANDO el guard juzga un comando con `specty enter <id>` ENTONCES decide lo mismo que antes de mover su código a `enforce/enter-command.ts`.

## Diseño

- CLI, `agents/adapter.ts`: `EventKind` gana `ended`, una conversación que termina.
- CLI, `agents/claude-code.ts`: `SessionEnd` sin matcher en sus eventos; `kind` lo da como `ended`; `doctor` da `claude-session-end` si falta.
- Core, `cards/doctor.ts` y `cards/doctor-agents.ts`: el código `claude-session-end` y su texto en español y en inglés.
- CLI, `store/front-owners.ts`: `releaseConversation(git, tool, conversation)`, que borra los registros de los frentes que lleva esa conversación.
- CLI, `enforce/fronts.ts`: `endConversation(session, tool, event)`, que los libera.
- CLI, `enforce/guard.ts`: con `ended`, libera y responde vacío sin anotar el paso; `enterCommand` y `unreachable` se van a `enforce/enter-command.ts`.

## Archivos

- modificar packages/cli/src/agents/adapter.ts — el tipo de evento de una conversación que termina
- modificar packages/cli/src/agents/claude-code.ts — el hook `SessionEnd` y su aviso de doctor
- modificar packages/core/src/cards/doctor.ts — el código del aviso de `SessionEnd`
- modificar packages/core/src/cards/doctor-agents.ts — el texto del aviso de `SessionEnd`
- modificar packages/cli/src/store/front-owners.ts — liberar los frentes de una conversación
- modificar packages/cli/src/enforce/fronts.ts — el fin de una conversación libera sus frentes
- modificar packages/cli/src/enforce/guard.ts — responde al fin de una conversación; sin lo que juzga `specty enter` en un comando
- crear packages/cli/src/enforce/enter-command.ts — lo que juzga `specty enter` dentro de un comando, movido del guard
- crear packages/cli/test/session-end-hook.test.ts — el hook `SessionEnd` que instala `init` y el aviso de doctor
- crear packages/cli/test/session-end.test.ts — el fin de una conversación y `specty enter` en un comando, de punta a punta
- modificar docs/formats.md — el fin de una conversación libera su frente
- modificar docs/ARCHITECTURE.md — el hook `SessionEnd` de Claude Code

## Tareas

- [x] T1: El hook `SessionEnd` de Claude Code y su aviso de doctor
  - files: packages/cli/src/agents/adapter.ts, packages/cli/src/agents/claude-code.ts, packages/core/src/cards/doctor.ts, packages/core/src/cards/doctor-agents.ts, packages/cli/test/session-end-hook.test.ts
  - ac: AC1, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/session-end-hook.test.ts test/setup.test.ts test/agents.test.ts && pnpm lint
- [x] T2: El fin de una conversación libera sus frentes, y `specty enter` en un comando fuera del guard
  - files: packages/cli/src/store/front-owners.ts, packages/cli/src/enforce/fronts.ts, packages/cli/src/enforce/guard.ts, packages/cli/src/enforce/enter-command.ts, packages/cli/test/session-end.test.ts
  - ac: AC2, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/session-end.test.ts test/enter.test.ts test/front-guard.test.ts test/session-start.test.ts && pnpm typecheck && pnpm lint && pnpm exec knip
- [x] T3: La documentación del fin de una sesión
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC1, AC2
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: Si Claude Code no llama a `SessionEnd` (se cierra a la fuerza), el frente se libera como hasta ahora, a los `memory.orphanAfterMin` minutos — nada empeora.
- R2: Las instalaciones de antes no tienen el hook hasta que la persona ejecuta `specty init` — `doctor` lo avisa.

## Cierre

### Resumen

`specty init` instala en Claude Code un hook `SessionEnd` sin matcher. Cuando una conversación termina, sea con `/clear`, al salir o por otro motivo, el guard borra los registros de los frentes que llevaba (`endConversation` y `releaseConversation`), no anota un paso y no responde nada. Otra conversación toma el frente enseguida, sin esperar `memory.orphanAfterMin`. `specty doctor` avisa, con su propia línea, cuando faltan los hooks de `SessionEnd`, y pide `specty init`. Lo que juzga `specty enter` dentro de un comando pasó a `enforce/enter-command.ts`, y `guard.ts` bajó de 302 a 271 líneas de código (P56).

### Desviaciones

- T2 y T3 del primer borrador se juntaron antes de aprobar: con `policy.tests: contract` cada tarea necesita sus tests, y las dos tocaban `guard.ts`.
- Que una conversación que termina no anota un paso se comprueba en `noted`, que recibe el tipo de evento, y no en `guard`: la condición en `guard` lo dejaba con complejidad 13.

### Decisiones

- `EventKind` gana `ended`, y el adaptador de cada agente decide qué evento lo es; hoy solo Claude Code lo da.
- `enter-command.ts` define su propio tipo de llamada (`agent`, `environment`, `session`, `event`) en vez de exportar la `Call` del guard.

### Pendientes

- P7: los hooks de este repositorio aún no tienen `SessionEnd`; `specty doctor` lo avisará hasta que la persona ejecute `specty init`.
- P57: el fin de sesión de los demás agentes (Gemini CLI tiene `SessionEnd`; Cursor, Codex y OpenCode, sin comprobar) va con el estudio de lo que da cada uno.
