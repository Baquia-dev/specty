---
kind: standard
epic: 20261026-todos-los-agentes-al-nivel-de-claude-code
slice: C9
---

# Antigravity comprueba el fin de turno, trae la tarjeta en cada turno y no lee lo excluido

## Objetivo

Con el guard de C8, a Antigravity aún le faltan cuatro cosas que Claude Code ya tiene:
- Fin de turno: cuando `specty check --changed` falla, el agente sigue con el informe en vez de terminar.
- Tarjeta: la tarjeta de la tarea no vuelve si una compactación la recorta.
- Exclusión: el agente lee dependencias y código generado.
- Permisos: su sandbox no deja hacer los commits de Specty desde la carpeta de un cambio.

Este corte añade las cuatro. Como Antigravity no tiene evento de compactación, la tarjeta llega al empezar cada turno. También cierra un hueco que dejó C8: el guard juzga lo que el agente escribe en una tarea en marcha.

## Fuera de alcance

- Reconocer la terminal de Antigravity por su entorno: Antigravity CLI pone `HGEDITOR` y `JJ_EDITOR` a `false` en los comandos del agente, y eso va con C10, que también reconoce la de Windsurf. Mientras, los comandos de la persona los sigue frenando el guard antes de ejecutarse.
- Aprobar sin preguntar los comandos de Specty (`auto_approve`): el modo de revisión que eligió la persona sigue mandando; este corte solo abre el sandbox.
- `SessionStart`: la tarjeta del primer turno ya llega con su primera llamada al modelo.
- Probar con Antigravity de verdad: su modelo va siempre por su servidor.

## Supuestos

- A1: Según su documentación (revisada el 2026-10-26), el `Stop` de Antigravity es una lista de manejadores sin matcher que recibe `executionNum`, `terminationReason` (`model_stop`, `max_steps_exceeded` o `error`) y `fullyIdle`. Con `{"decision":"continue","reason":…}` el agente sigue, con la razón como mensaje de sistema; cualquier otro valor deja terminar. No marca el turno que ya volvió, así que la cuenta la lleva Specty, y Antigravity corta además los bucles con un límite propio.
  - impacto: alto
- A2: `invocationNum` vuelve a 0 con cada mensaje de la persona. Lo dicen pruebas de la comunidad con Antigravity CLI 1.2 y 1.3, no su documentación, que solo dice que la primera llamada es la 0; si contara toda la conversación, la tarjeta llegaría solo al empezarla.
  - impacto: alto
- A3: `.antigravityignore`, con la sintaxis de `.gitignore`, aparta esas rutas del indexador de Antigravity y de sus menciones con @, según su changelog y su foro. No consta que impida a `view_file` leer una de ellas si el agente la pide por su ruta.
- A4: El sandbox de terminal de Antigravity, activo por defecto en la app, solo deja escribir en las carpetas del proyecto, así que en la carpeta de un cambio deja fuera la carpeta común de git. No hay archivo de permisos en el proyecto: las reglas viven en la configuración de la app o en `~/.gemini/antigravity-cli/settings.json`. `PreToolUse` acepta `permissionOverrides`, una lista de recursos como `write_file(<ruta>)` que amplía los permisos de esa llamada.
  - impacto: alto
- A5: `manage_task` maneja las tareas en segundo plano (`Action`: `list`, `kill`, `status` o `send_input`, con `TaskId` e `Input`), y con `send_input` escribe `Input` en una tarea en marcha, que puede ser una shell.

## Criterios de aceptación

- AC1: CUANDO el agente de Antigravity termina su turno (`Stop` con `terminationReason: "model_stop"`) y `specty check --changed` falla ENTONCES el hook responde `{"decision":"continue","reason":…}` con el informe. El siguiente `Stop` de esa conversación responde `{"decision":"stop"}`, porque un turno que ya volvió puede terminar, y también lo hace un turno sin nada que corregir.
- AC2: CUANDO `specty check --install` corre en un repositorio con el guard de Antigravity ENTONCES añade `Stop` al hook `specty` de `.agents/hooks.json` una sola vez, y `specty init` lo conserva al reescribir el hook.
- AC3: CUANDO empieza un turno de Antigravity (su `PreInvocation` con `invocationNum` 0) en un repositorio con Specty ENTONCES el guard inyecta la tarjeta de `specty next` como `ephemeralMessage`, seguida del aviso pendiente si lo hay; las demás llamadas al modelo solo traen el aviso.
- AC4: CUANDO `specty check --install` corre en un repositorio que usa Antigravity ENTONCES escribe en `.antigravityignore` los globs de `checks.exclude` y `scope.generated`.
- AC5: CUANDO el guard deja pasar un comando de shell de Antigravity ENTONCES su respuesta lleva `permissionOverrides` con `write_file(<carpeta común de git>)` y `write_file(<carpeta de las worktrees>)`, para que el sandbox deje a los comandos de Specty hacer sus commits desde la carpeta de un cambio.
- AC6: CUANDO el agente de Antigravity escribe en una tarea en marcha (`manage_task` con `send_input`) un comando de la persona sin modo delegado ENTONCES el guard lo deniega como si lo ejecutara con `run_command`, y las demás acciones de `manage_task` pasan.
- AC7: CUANDO se lee la tabla de capacidades de ARCHITECTURE §10 ENTONCES Antigravity tiene el fin de turno, la exclusión y los permisos en «sí», y la tarjeta tras compactar en «indirecto», con cómo llega.

## Diseño

- Fin de turno: `AgentStop` gana dos campos opcionales:
  - `counts`: Specty lleva la cuenta por conversación, porque la herramienta no marca el turno que ya volvió;
  - `pass`: la respuesta que deja terminar el turno, para una herramienta que espera respuesta siempre.

  `agent-stop` normaliza la entrada con el módulo del agente. Con `counts`, deja `pending/<conversación>.stop` al mandar al agente de vuelta. Si lo encuentra en el siguiente fin de turno, lo quita y deja terminar, como `stop_hook_active`. Antigravity solo comprueba con `terminationReason: "model_stop"`. Su `Stop` va en el hook `specty`, y `init` lo conserva.
- Tarjeta: el tipo de evento `turn` es la primera llamada al modelo de un turno. El guard responde con la tarjeta de `next` y el aviso pendiente, y Antigravity da `turn` a su `PreInvocation` con `invocationNum` 0.
- Permisos: el veredicto «permitir» de un comando de shell lleva las carpetas que el sandbox de un agente con `grants` necesita. `sharedFolders(git)`, que da la carpeta común de git y la de las worktrees, pasa de `cursor.ts` a `flow/worktree.ts`, y Antigravity da esas carpetas como `permissionOverrides` con `write_file(...)`.
- `manage_task` con `send_input` se juzga como un comando de shell (`Input`); sus demás acciones no cambian nada. El matcher de `PreToolUse` lo incluye.

## Archivos

- modificar packages/cli/src/agents/adapter.ts — `counts` y `pass` en el fin de turno, el evento `turn` y las carpetas del veredicto para un agente con `grants`
- modificar packages/cli/src/agents/antigravity.ts — su fin de turno, la tarjeta en cada turno, las carpetas del sandbox y `manage_task`
- modificar packages/cli/src/agents/cursor.ts — usa `sharedFolders`
- modificar packages/cli/src/enforce/agent-stop.ts — la entrada normalizada, la cuenta por conversación y la respuesta que deja terminar
- modificar packages/cli/src/enforce/pending.ts — el turno devuelto (`stop`)
- modificar packages/cli/src/enforce/guard.ts — la tarjeta al empezar el turno y las carpetas del sandbox
- modificar packages/cli/src/flow/worktree.ts — `sharedFolders`
- modificar packages/cli/src/check/install-ignores.ts — `.antigravityignore`
- modificar packages/core/src/capabilities.ts — las celdas de Antigravity
- crear packages/cli/test/antigravity-turn.test.ts — el fin de turno, la tarjeta y las carpetas del sandbox (AC1, AC2, AC3, AC5)
- modificar packages/cli/test/antigravity.test.ts — `manage_task` y el matcher que lo incluye (AC6); un comando que pasa ahora lleva las carpetas (AC5)
- modificar packages/cli/test/agents.test.ts — el evento `turn` de Antigravity (AC3)
- modificar packages/cli/test/check-ignores.test.ts — `.antigravityignore` (AC4)
- modificar packages/core/test/capabilities.test.ts — la fila de Antigravity (AC7)
- modificar docs/ARCHITECTURE.md — su fin de turno, su tarjeta, su exclusión y sus permisos (§10), y la tabla
- modificar docs/formats.md — `pending/<conversación>.stop` y `.antigravityignore`

## Tareas

- [x] T1: Antigravity comprueba el fin de turno y trae la tarjeta al empezar cada turno
  - files: packages/cli/src/agents/adapter.ts, packages/cli/src/agents/antigravity.ts, packages/cli/src/enforce/agent-stop.ts, packages/cli/src/enforce/pending.ts, packages/cli/src/enforce/guard.ts, packages/cli/test/antigravity-turn.test.ts, packages/cli/test/agents.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/antigravity-turn.test.ts test/check-agent-stop.test.ts test/antigravity.test.ts test/agents.test.ts test/cursor.test.ts
- [x] T2: Antigravity no lee lo excluido
  - files: packages/cli/src/check/install-ignores.ts, packages/cli/test/check-ignores.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-ignores.test.ts
- [x] T3: El sandbox de Antigravity deja a Specty sus carpetas
  - files: packages/cli/src/agents/adapter.ts, packages/cli/src/agents/antigravity.ts, packages/cli/src/agents/cursor.ts, packages/cli/src/enforce/guard.ts, packages/cli/src/flow/worktree.ts, packages/cli/test/antigravity-turn.test.ts, packages/cli/test/antigravity.test.ts
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/antigravity-turn.test.ts test/antigravity.test.ts test/cursor.test.ts
- [x] T4: El guard juzga lo que el agente de Antigravity escribe en una tarea en marcha
  - files: packages/cli/src/agents/antigravity.ts, packages/cli/test/antigravity.test.ts
  - ac: AC6
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/antigravity.test.ts
- [x] T5: La tabla de capacidades y la documentación lo cuentan
  - files: packages/core/src/capabilities.ts, packages/core/test/capabilities.test.ts, docs/ARCHITECTURE.md, docs/formats.md
  - ac: AC7
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/capabilities.test.ts

## Riesgos

- R1: Si `invocationNum` no volviera a 0 en cada turno (A2), la tarjeta solo llegaría al empezar la conversación. Mitigación: nada se rompe, solo llega menos veces; ARCHITECTURE §10 dice de dónde sale el dato.
- R2: Si una conversación se corta justo después de volver, su `pending/<conversación>.stop` dejaría terminar sin comprobar su siguiente turno. Mitigación: caduca en un día, como los demás pendientes, y `task done` sigue siendo la puerta.
- R3: Nadie ha probado `permissionOverrides` con el sandbox de Antigravity de verdad: si no le abriera las carpetas, `task done` fallaría en la carpeta de un cambio. Mitigación: ARCHITECTURE §10 dice qué dos carpetas añadir a mano en sus permisos (`write_file`).
