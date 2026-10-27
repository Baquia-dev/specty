---
kind: standard
epic: 20261026-los-agentes-entran-en-la-carpeta-del-cambio-sin
slice: C1
---

# Una conversación entra en la carpeta de un cambio con specty enter

## Objetivo

Hoy solo Claude Code liga su sesión a la carpeta de un cambio (`EnterWorktree`). Con este corte, el agente de cualquier herramienta con el guard de Specty ejecuta `specty enter <id>`, y el guard liga su conversación a la carpeta del cambio, con la misma regla: una conversación trabaja un solo cambio abierto a la vez.

Desde ahí, el guard la mantiene en esa carpeta. Juzga cada acción con las reglas de ese cambio, y bloquea lo que iría a otra carpeta con la ruta o el comando para hacerlo allí. El comando imprime la tarjeta del cambio. Que cada herramienta lleve sola sus acciones a la carpeta, sin que el agente cambie las rutas, viene en los cortes siguientes.

## Fuera de alcance

- Reescribir las acciones para que ocurran en la carpeta del cambio: lo hace cada herramienta en su corte (C2 a C6).
- Las lecturas: el guard aún no las ve, así que en este corte el agente debe leer con las rutas de la carpeta del cambio.

## Supuestos

- A1: Cada herramienta da a sus hooks un id estable de la conversación (`session_id`, o `conversation_id` en Cursor), con el que el guard guarda la ligadura en la carpeta común de git, como ya hace con `EnterWorktree`.
  - impacto: alto
- A2: La carpeta de un cambio creado con `specty new` es `<carpeta de worktrees>/<id>`, y `namedWorktree` la encuentra por el id.

## Criterios de aceptación

- AC1: CUANDO el agente de una herramienta con el guard (que no es Claude Code) ejecuta `specty enter <id>` y el cambio tiene carpeta ENTONCES el guard liga su conversación a esa carpeta, y el comando imprime la tarjeta del cambio allí. Si la conversación ya trabaja en otro cambio abierto, el guard lo bloquea como a `EnterWorktree`, salvo los cortes de su épica.
- AC2: CUANDO `specty enter <id>` nombra un cambio sin carpeta ENTONCES el comando lo dice y no liga nada.
- AC3: CUANDO una conversación ligada escribe un archivo fuera de la carpeta de su cambio ENTONCES el guard lo bloquea y le da la misma ruta dentro de esa carpeta.
- AC4: CUANDO una conversación ligada ejecuta un comando que correría fuera de la carpeta de su cambio ENTONCES el guard lo bloquea y le dice cómo ejecutarlo allí (`cd '<carpeta>' && …`). Dentro de la carpeta, lo juzga con las reglas de ese cambio.
- AC5: CUANDO el agente de Claude Code ejecuta `specty enter <id>` ENTONCES el guard lo bloquea y le pide `EnterWorktree` con `name: "<id>"`.

## Diseño

- `analyzeShell` anota el id de cada `specty enter` (`enters`) y la carpeta donde corre cada comando que no es `cd` (`runsIn`).
- El guard trata un comando con `specty enter <id>` como la entrada de `EnterWorktree`: busca la carpeta del cambio, aplica `sessionDenial` y, si lo deja, liga la conversación (`bindSession`, ahora por `conversationOf`). Para Claude Code, que entra por su cuenta (su «Worktree por nombre» es «sí»), lo bloquea con el SIGUIENTE de `EnterWorktree`.
- Para una conversación ligada de un agente que no entra por su cuenta, el guard abre la sesión en la carpeta del cambio, aunque la herramienta trabaje en otra:
  - una ruta fuera de ella es ajena (`ForeignPath`), y su denegación da la misma ruta dentro (`instead`);
  - un comando que correría fuera se bloquea (`ShellFacts.elsewhere`).

  Claude Code queda como estaba: su carpeta de trabajo ya es la del cambio, y tras `ExitWorktree` sigue donde está.
- `specty enter <id>` (comando del agente) abre la sesión en la carpeta del cambio e imprime lo que diría allí `specty next`, tras una línea que dice dónde trabaja ahora la conversación.

## Archivos

- modificar packages/core/src/guard/shell.ts — `enters` y `runsIn`
- modificar packages/core/src/guard/decide.ts — `elsewhere` en los hechos de un comando
- modificar packages/core/src/guard/worktrees.ts — la ruta dentro de la carpeta (`instead`), el comando fuera de ella y `specty enter` en Claude Code
- crear packages/core/src/cards/enter.ts — lo que dice `specty enter`
- modificar packages/core/src/cards/index.ts — lo exporta
- modificar packages/core/src/index.ts — exporta la denegación de `specty enter` en Claude Code
- crear packages/cli/src/commands/enter.ts — el comando `specty enter`
- modificar packages/cli/src/commands/agent-commands.ts — lo registra
- modificar packages/cli/src/enforce/guard.ts — liga la conversación y la mantiene en la carpeta del cambio
- modificar packages/cli/src/enforce/sessions.ts — la ligadura por `conversationOf`, y la carpeta de una conversación ligada
- modificar packages/core/test/guard/shell.test.ts — `enters` y `runsIn`
- crear packages/cli/test/enter.test.ts — entrar, la ruta y el comando fuera de la carpeta, Claude Code (AC1 a AC5)
- modificar docs/ARCHITECTURE.md — `specty enter` (§6 y §10)
- modificar docs/formats.md — la ligadura también es de conversaciones de otros agentes

## Tareas

- [x] T1: El análisis de shell anota specty enter y dónde corre cada comando
  - files: packages/core/src/guard/shell.ts, packages/core/test/guard/shell.test.ts
  - ac: AC1, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/guard/shell.test.ts
- [x] T2: El guard liga la conversación y la mantiene en la carpeta del cambio
  - files: packages/core/src/guard/decide.ts, packages/core/src/guard/worktrees.ts, packages/core/src/index.ts, packages/cli/src/enforce/guard.ts, packages/cli/src/enforce/sessions.ts, packages/cli/test/enter.test.ts
  - ac: AC1, AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/enter.test.ts test/enforce.test.ts test/worktrees.test.ts test/worktree-hooks.test.ts
- [x] T3: specty enter imprime la tarjeta del cambio en su carpeta
  - files: packages/core/src/cards/enter.ts, packages/core/src/cards/index.ts, packages/cli/src/commands/enter.ts, packages/cli/src/commands/agent-commands.ts, packages/cli/test/enter.test.ts, docs/ARCHITECTURE.md, docs/formats.md
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/enter.test.ts

## Riesgos

- R1: Una conversación ligada que el agente olvida queda en la carpeta del cambio mientras ese cambio siga abierto. Mitigación: es la regla de `EnterWorktree`, y al cerrarse el cambio la carpeta desaparece y la ligadura deja de contar.
- R2: Sin reescritura (este corte), el agente tiene que usar las rutas y los `cd` de la carpeta del cambio. Mitigación: cada bloqueo le da la ruta o el comando exactos, y los cortes C2 a C6 lo hacen solos.

## Cierre

### Resumen

`specty enter <id>` liga la conversación de cualquier herramienta con guard, salvo Claude Code, a la carpeta del cambio, con la regla de `EnterWorktree`: una conversación, un cambio abierto, salvo los cortes de su épica. Desde entonces el guard responde a cada evento de esa conversación con la sesión de esa carpeta. Bloquea un archivo de fuera con la misma ruta dentro, y un comando que correría fuera con `cd '<carpeta>' && …`. El comando dice dónde trabaja ahora la conversación y lo que diría allí `specty next`; sin carpeta propia, lo dice y no se liga nada. A Claude Code el guard le pide `EnterWorktree` con `name`.

### Desviaciones

- La denegación para Claude Code no nombra `specty enter`: el test de los comandos citados exige que cada uno exista, y el comando llegó en T3. Dice que Claude Code entra con su propia herramienta.
- El comando que correría fuera se juzga justo después de las acciones de la persona y antes que el resto: dónde corre va antes que lo que hace.

### Decisiones

- Un comando cuya carpeta el análisis no sabe nombrar (un `cd` a una variable) no cuenta como de fuera, igual que las rutas que el guard no puede ubicar.
- `specty enter` corre en cualquier carpeta, porque es lo que mueve la conversación; el resto del mismo comando se juzga como siempre.
- La ruta equivalente se da para cualquier ruta de otra worktree, también de otro cambio.

### Pendientes

- `packages/cli/src/enforce/guard.ts` pasa el aviso de tamaño (316 líneas de código). C2 lo divide por responsabilidad al añadir la reescritura de acciones: lo que ubica rutas y comandos irá a su propio módulo.
- Las lecturas aún no pasan por el guard, y cada herramienta llevará sola sus acciones a la carpeta en los cortes C2 a C6.
