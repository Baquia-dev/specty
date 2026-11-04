---
kind: standard
epic: 20261104-epicas-y-features-con-subagentes
slice: C8
---

# Cada subagente de Cursor trabaja en la carpeta de su cambio

## Objetivo

La tabla de capacidades aún no deja a Cursor repartir los cortes de una épica entre subagentes, porque nadie había comprobado cómo ve el guard a sus subagentes. Cada subagente de Cursor envía sus eventos con un `conversation_id` propio, y el guard ya guarda por conversación la carpeta en la que trabaja cada una. Con este corte, una prueba con eventos de la forma real de Cursor demuestra que un subagente entra con `specty enter` en la carpeta de su cambio y trabaja allí sin mover a la conversación principal, y la tabla dice «sí» para Cursor.

## Fuera de alcance

- La tarjeta de la épica que reparte los cortes y su encargo (C2), y los subagentes de Codex y OpenCode (C6 y C7).
- `subagentStart` y `subagentStop`: llegan con el `conversation_id` de la conversación principal (un bug que Cursor confirmó el 2026-06-12), así que Specty no los instala ni decide nada con ellos.
- Los subagentes aislados de Cursor, en una worktree propia o en la nube: el encargo los lanza en la copia de la conversación principal, que es lo que Cursor hace por defecto.
- Una prueba con Cursor real: su modelo va siempre por su servidor, así que no se puede guionizar.

## Supuestos

- A1: Desde Cursor 2.4, los eventos de herramientas de un subagente (`preToolUse`, `postToolUse`) traen un `conversation_id` nuevo, un `session_id` igual a él, `transcript_path` nulo y ningún campo que lo enlace a la conversación que lo lanzó (su foro: Cursor lo confirmó como bug el 2026-06-12 y seguía abierto el 2026-09-25). Al guard le basta con ese id propio.
  - impacto: alto
- A2: `beforeShellExecution` dentro de un subagente trae también su `conversation_id`, como su `preToolUse`. La documentación no dice qué hooks disparan dentro de un subagente, y su foro cuenta que una regla de los hooks sobre `Shell` bloquea también a los subagentes.
  - impacto: alto
- A3: Un subagente arranca en la carpeta del espacio de trabajo de Cursor, no en la del cambio en el que entró la conversación principal, porque esa la emula el guard con un `cd` delante de cada comando.

## Criterios de aceptación

- AC1: CUANDO un subagente de Cursor, con su propio `conversation_id`, ejecuta `specty enter <id>` de un cambio con carpeta ENTONCES el guard lo ata a ella: sus comandos van allí, y los de la conversación que lo lanzó siguen yendo a la carpeta en la que ella entró.
- AC2: CUANDO un subagente de Cursor atado a la carpeta de un cambio ejecuta un comando ENTONCES `preToolUse` lo lleva allí con un `cd` (`updated_input`), y `beforeShellExecution` deja pasar el que va a su carpeta y bloquea, con el `cd` bueno, el que correría fuera de ella, también en la carpeta de la conversación que lo lanzó.
- AC3: CUANDO un subagente de Cursor atado a la carpeta de un cambio escribe, borra o lee fuera de ella ENTONCES el guard se lo bloquea con la misma ruta dentro de la carpeta, y dentro lo juzga con las reglas de ese cambio.
- AC4: CUANDO termina un comando de un subagente de Cursor atado a la carpeta de un cambio ENTONCES el guard le avisa de lo que cambió allí fuera de su tarea.
- AC5: CUANDO un subagente de Cursor atado a un cambio abierto intenta entrar en la carpeta de otro ENTONCES el guard se lo impide como a una conversación, otro subagente puede entrar en ella, y cuando su cambio termina queda libre.
- AC6: CUANDO se muestra la tabla de capacidades (ARCHITECTURE §10) ENTONCES Cursor dice «sí» en «Cortes en subagentes».

## Diseño

- Identidad: `conversationOf` toma el `session_id` del evento o, sin él, el `conversation_id`. En los eventos de un subagente de Cursor los dos son su id nuevo (A1), así que el guard ya lo trata como una conversación propia, sin un `normalize` como el de Claude Code (`<session_id>--<agent_id>`): su enlace en `sessions/`, sus pasos para `status` y su frente son suyos, y le vale la regla «una conversación, un cambio abierto».
- Entrar y trabajar: el subagente entra con `specty enter <id>`, como la conversación principal (A3). Desde ahí el guard ya le pone el `cd` delante de cada comando de `Shell`, juzga `beforeShellExecution` con su carpeta, le bloquea los archivos con la ruta buena y comprueba tras cada comando lo que cambió en ella.
- Tipos de las tareas: como el guard ya hace todo esto, su prueba no puede fallar antes del código. T1 es de tipo `test`: su prueba llega al implementar, en un archivo nuevo (ADR 0014), y el módulo de Cursor solo gana el comentario que explica por qué no necesita `normalize`, salvo que la prueba encuentre un fallo. T2 es la feature: declara la capacidad, y su test es el que se ve fallar en la fase de tests.
- La prueba envía al guard eventos con la forma de los de Cursor: los campos comunes de sus hooks (`conversation_id`, `generation_id`, `model`, `cursor_version`, `workspace_roots`, `user_email`, `transcript_path`), el `session_id` que llega en la práctica y los de cada hook (`tool_name`, `tool_input`, `tool_use_id` y `cwd`; `command` y `sandbox` en `beforeShellExecution`). Los de un subagente llevan un `conversation_id` nuevo, `transcript_path` nulo y nada que lo enlace a la conversación principal.
- Documentos: ARCHITECTURE §10 gana un párrafo «Subagentes (Cursor)», y su tabla se regenera desde `capabilityTable("es")`.

## Archivos

- crear packages/cli/test/cursor-subagents.test.ts — el guard con subagentes de Cursor, con eventos de su forma real
- modificar packages/cli/src/agents/cursor.ts — por qué cada subagente es ya una conversación propia, y lo que la prueba pida corregir
- modificar packages/core/src/capabilities.ts — Cursor en «sí» en «Cortes en subagentes»
- modificar packages/core/test/capabilities.test.ts — la fila de Cursor y su capacidad
- modificar docs/ARCHITECTURE.md — §10: los subagentes de Cursor y la tabla

## Tareas

- [x] T1: Una prueba con eventos de la forma real de Cursor demuestra que cada subagente trabaja en la carpeta de su cambio
  - files: packages/cli/test/cursor-subagents.test.ts, packages/cli/src/agents/cursor.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/cursor-subagents.test.ts && pnpm --filter @baquia-dev/specty typecheck && pnpm lint
  - type: test
- [x] T2: La tabla de capacidades dice que Cursor reparte los cortes de una épica entre subagentes
  - files: packages/core/src/capabilities.ts, packages/core/test/capabilities.test.ts, docs/ARCHITECTURE.md
  - ac: AC6
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/capabilities.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: A2 es falso, y el `beforeShellExecution` de un subagente llega con el `conversation_id` de la conversación principal: el guard bloquearía el comando que `preToolUse` ya llevó a la carpeta del subagente. Mitigación: el bloqueo dice el comando y la carpeta, así que se ve en el primer comando; queda en la memoria comprobarlo con Cursor real.
- R2: Cursor arregla su bug como lo hace Claude Code, con el `conversation_id` de la conversación principal y un id del subagente. Mitigación: §10 dice de qué depende el guard, y bastaría con darle a Cursor un `normalize` como `asSubagentConversation`.
- R3: Cursor envía a veces los eventos de herramientas con `conversation_id` y `session_id` vacíos (su foro, 2026-07-30), y el guard los juzga como de una conversación sin carpeta: un comando así de un subagente correría sin el `cd`. Mitigación: la comprobación tras el comando sigue avisando de lo que cambie fuera del flujo; queda en la memoria.
- R4: C6 y C7 cambian a la vez las mismas líneas de la tabla y de `capabilities.test.ts`. Mitigación: al incorporar main, la tabla se regenera y el conflicto se resuelve en `specty integrate`.
