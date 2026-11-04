---
kind: standard
epic: 20261104-epicas-y-features-con-subagentes
slice: C1
---

# Cada subagente de Claude Code trabaja en la carpeta de su cambio

## Objetivo

Hoy el guard reconoce una conversación por el `session_id` de sus hooks, y los subagentes de Claude Code envían el de la sesión que los lanzó. Por eso el guard los trata como a esa sesión: no pueden trabajar en la carpeta de otro cambio, y si entraran en una moverían a la sesión principal con ellos. Con este corte, el guard distingue a cada subagente por su `agent_id`, lo deja entrar con `specty enter` en la carpeta de un cambio y lo ata a ella sin mover a la sesión que lo lanzó. Además, `specty new --subagent` crea un cambio sin atar a nadie, y la tabla de capacidades dice qué herramientas pueden repartir los cortes de una épica entre subagentes. Es la base de la épica: la tarjeta que reparte los cortes llega en C2.

## Fuera de alcance

- La tarjeta de la épica que reparte los cortes y la clave `subagents` de la configuración (C2).
- Codex, OpenCode y Cursor (C6, C7 y C8): aquí quedan en la tabla sin la capacidad.
- Que el guard bloquee a un subagente que usa `EnterWorktree` o `specty new` sin `--subagent`: va en un cambio aparte, anotado en la memoria, para no pasar del tamaño de un corte.
- Reescribir las acciones de un subagente de Claude Code (A3).
- `ExitWorktree` desde un subagente: no pasa por el guard.
- Los frentes de la memoria tomados desde un subagente, y el consumo de los subagentes en la línea de coste del cierre.
- Cambiar la regla de `specty new` de la épica `20261104-sesiones-con-su-carpeta`: sin `--subagent`, `new` sigue atando la conversación de una épica al corte que empieza.

## Supuestos

- A1: Claude Code envía `agent_id` solo en los eventos de un subagente (o de un compañero de equipo dentro del proceso), nunca en los de la sesión principal. La documentación solo lo dice de `agent_type`, así que AC7 lo comprueba con Claude Code real.
  - impacto: alto
- A2: En los comandos de un subagente, `CLAUDE_CODE_SESSION_ID` es el de la sesión que lo lanzó (no está documentado). Por eso `specty new` ejecutado por un subagente ataría a la sesión principal al cambio nuevo, y existe `--subagent`.
- A3: Un subagente de Claude Code arranca en la carpeta de la conversación principal, y su `cd` no dura entre comandos (documentado). El guard le bloquea con la ruta o el comando buenos lo que caería fuera de su carpeta, pero no se lo reescribe: en Claude Code, reescribir una acción exige responder «allow», y eso saltaría los permisos de la persona.
  - impacto: alto
- A4: Los eventos sin `agent_id`, de la sesión principal o de las demás herramientas, se juzgan como hoy.

## Criterios de aceptación

- AC1: CUANDO un evento de Claude Code trae `agent_id` ENTONCES el guard lo trata como una conversación propia, distinta de la de su `session_id`: su enlace a una carpeta y sus pasos en `specty status` son suyos.
- AC2: CUANDO un subagente de Claude Code ejecuta `specty enter <id>` de un cambio con carpeta ENTONCES el guard lo ata a esa carpeta sin tocar el enlace de la sesión que lo lanzó, y a la sesión principal le sigue pidiendo `EnterWorktree`.
- AC3: CUANDO un subagente atado a la carpeta de un cambio escribe un archivo o ejecuta un comando ENTONCES el guard lo juzga con las reglas de ese cambio, y bloquea lo que caería fuera de esa carpeta con la misma ruta dentro de ella o con el comando precedido de `cd` a ella.
- AC4: CUANDO un subagente atado a un cambio abierto intenta entrar en la carpeta de otro ENTONCES el guard se lo impide como a una sesión, y cuando su cambio se cierra puede entrar en otro.
- AC5: CUANDO se ejecuta `specty new --subagent` ENTONCES crea el cambio sin atar a la conversación que lo ejecuta, y su SIGUIENTE pide entrar con `specty enter <id>`.
- AC6: CUANDO se muestra la tabla de capacidades (ARCHITECTURE §10) ENTONCES trae la columna «Cortes en subagentes», con Claude Code en «sí» y Gemini CLI, Antigravity y Devin (Windsurf) en «no posible» con su motivo.
- AC7: CUANDO Claude Code real lanza un subagente contra el modelo guionizado ENTONCES los eventos de la sesión principal no traen `agent_id` y los del subagente sí, y el subagente entra en la carpeta de un corte mientras la sesión principal sigue atada a la épica.

## Diseño

- La conversación de un subagente es `<session_id>--<agent_id>`. Lo hace el `normalize` del módulo de Claude Code, que además conserva `agent_id`. Así, todo lo que el guard guarda por conversación (el enlace de `sessions/<conversación>.json`, los pasos de `status`, los frentes) es del subagente, y la regla «una conversación, un cambio abierto» le vale como a una sesión.
- `subagentOf(event)` en `enforce/actions.ts` dice si el evento viene de un subagente. Para ese evento, `entersOnItsOwn` no aplica: el guard lo juzga con la sesión de la carpeta a la que está atado, como a las herramientas que entran con `specty enter`, y deja pasar ese comando.
- Lo que caería fuera de su carpeta se bloquea con lo que ya existe: `foreignDenial` con la misma ruta dentro, y `elsewhereDenial` con `cd '<carpeta>' && …`. No se reescribe (A3).
- `specty new --subagent` no llama a `bindNew`, y `carryOnText` le da el SIGUIENTE de `specty enter <id>` en cualquier herramienta.
- `AGENT_CAPABILITIES` gana `subagentSlices`, con la columna «Cortes en subagentes» / «Slices in subagents». Claude Code queda en «sí». Gemini CLI queda en «no posible»: sus hooks traen el `session_id` de la sesión principal sin nada que distinga al subagente. Antigravity y Devin (Windsurf), también: sus hooks no documentan las acciones de sus subagentes (consultado el 2026-11-04). Las demás herramientas quedan sin ella («—») hasta su corte.
- Prueba con Claude Code real:
  - `fakeModel` acepta un guion por subagente, que elige por una marca en el encargo del subagente, y responde a cada conversación por su cuenta.
  - Un hook de prueba en los ajustes del repositorio temporal guarda cada evento que recibe.
  - La sesión principal trabaja en la carpeta de una épica aprobada, atada a ella con `--session-id`, y lanza un subagente que entra en la carpeta de un corte ya creado y escribe allí.
- Documentos: ARCHITECTURE §6 (`new --subagent`) y §10 (los subagentes en el guard y la tabla).

## Archivos

- modificar packages/cli/src/agents/claude-code.ts — un evento con `agent_id` es la conversación de un subagente
- modificar packages/cli/src/enforce/actions.ts — `subagentOf`, el subagente de un evento
- modificar packages/cli/src/enforce/sessions.ts — un subagente trabaja en la carpeta a la que está atado, también en Claude Code
- modificar packages/cli/src/enforce/enter-command.ts — `specty enter` de un subagente de Claude Code
- modificar packages/cli/src/commands/new.ts — `--subagent` no ata a la conversación que lo ejecuta
- modificar packages/cli/src/commands/agent-commands.ts — la opción `--subagent` de `new`
- modificar packages/core/src/cards/new.ts — con `--subagent`, el SIGUIENTE pide `specty enter`
- modificar packages/core/src/capabilities.ts — la columna «Cortes en subagentes»
- crear packages/cli/test/subagents.test.ts — el guard y `new` con subagentes de Claude Code
- modificar packages/cli/test/agent-e2e.test.ts — Claude Code real lanza un subagente que entra en un corte
- modificar packages/cli/test/fake-model.ts — un guion por subagente
- modificar packages/core/test/capabilities.test.ts — la columna nueva

## Tareas

- [x] T1: Un subagente de Claude Code entra con `specty enter` y trabaja en la carpeta de su cambio
  - files: packages/cli/src/agents/claude-code.ts, packages/cli/src/enforce/actions.ts, packages/cli/src/enforce/sessions.ts, packages/cli/src/enforce/enter-command.ts, packages/cli/test/subagents.test.ts, packages/cli/test/agent-e2e.test.ts, packages/cli/test/fake-model.ts
  - ac: AC1, AC2, AC3, AC4, AC7
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/subagents.test.ts && pnpm --filter @baquia-dev/specty exec vitest run test/agent-e2e.test.ts -t AC7
- [ ] T2: `specty new --subagent` crea el cambio sin atar a quien lo ejecuta
  - files: packages/cli/src/commands/new.ts, packages/cli/src/commands/agent-commands.ts, packages/core/src/cards/new.ts, packages/cli/test/subagents.test.ts
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/subagents.test.ts
- [ ] T3: La tabla de capacidades dice qué herramientas reparten los cortes entre subagentes
  - files: packages/core/src/capabilities.ts, packages/core/test/capabilities.test.ts
  - ac: AC6
  - verify: pnpm typecheck && pnpm --filter @baquia-dev/specty-core exec vitest run test/capabilities.test.ts

## Riesgos

- R1: Claude Code cambia los campos que envían sus hooks dentro de un subagente. Mitigación: AC7 lo comprueba con la versión instalada.
- R2: La épica abierta `20261104-sesiones-con-su-carpeta` también toca los enlaces de sesión (`enforce/sessions.ts`). Mitigación: este corte no cambia su regla de `new` (usa `--subagent`), y al cerrar los conflictos van a `specty integrate`.
- R3: La prueba con Claude Code real depende de cómo trata el modo sin interfaz a un subagente en segundo plano. Mitigación: el guion de la sesión principal espera al subagente antes de terminar; como los demás E2E, se salta sin Claude Code instalado.
- R4: Hasta el cambio de las redes de seguridad, un subagente que use `EnterWorktree` o olvide `--subagent` movería a la sesión principal. Mitigación: el encargo de C2 trae los comandos exactos, y ese cambio va antes de usar C2 en serio.
