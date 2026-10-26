---
kind: standard
epic: 20261026-todos-los-agentes-al-nivel-de-claude-code
slice: C10
---

# Windsurf, ahora Devin, tiene el guard y lo demás de Claude Code

## Objetivo

Windsurf es ahora Devin Desktop: desde la 3.9.19 su único agente es Devin Local, que comparte el motor y los hooks de Devin CLI, con la forma de los de Claude Code. Specty no le daba guard. Este corte se lo da en `.devin/hooks.v1.json`, y con él sirve también a Devin CLI:
- `PreToolUse` bloquea lo que el flujo no permite, con salida 2 y el motivo, también lo que el agente escribe en un proceso en marcha (`write_to_process`).
- `PostToolUse` añade el aviso tras un comando al resultado (`additionalContext`).
- `Stop` comprueba el fin de turno, y `PostCompaction` deja la tarjeta para el siguiente comando, como en Cursor.
- `init` escribe sus permisos: `Exec(specty)`, para que los comandos de Specty no pidan permiso, y las carpetas de Specty como `Write(...)`, para su sandbox.

La fila de la tabla pasa a llamarse «Devin (Windsurf)». El corte también reconoce la terminal de Antigravity CLI por su entorno, que quedó fuera de C9.

## Fuera de alcance

- Cascade, el agente de Devin Desktop hasta la 3.9.18, con su propio formato de hooks.
- La prueba de extremo a extremo: Devin usa los modelos de su servidor y pide una cuenta de Devin.
- Reconocer la terminal de Devin por su entorno: no consta que deje marca, así que el guard sigue frenando los comandos de la persona antes de ejecutarse.

## Supuestos

- A1: Según su documentación (revisada el 2026-10-26), Devin CLI y Devin Local leen los hooks del proyecto en `.devin/hooks.v1.json`, donde el archivo entero es el objeto de hooks con la forma de Claude Code. La entrada lleva `hook_event_name`, `session_id`, `tool_name` y `tool_input`, y según un adaptador de terceros también `cwd` y `tool_use_id`.
  - impacto: alto
- A2: La salida 2 de `PreToolUse` bloquea y el motivo le llega al agente. `PostToolUse` acepta `hookSpecificOutput.additionalContext`, que entra en el contexto. `Stop` sigue con `{"decision":"block","reason":…}` y marca `stop_hook_active`. `PostCompaction` llega tras compactar, pero no consta que pueda añadir contexto.
  - impacto: alto
- A3: Sus herramientas que cambian el repositorio son `exec` (`command`), `write`, `edit` y `notebook_edit`, cuya ruta la documentación no fija (`file_path` o `path`), `apply_patch` y `write_to_process`, que escribe en un proceso en marcha.
  - impacto: alto
- A4: Sus permisos van en `permissions.allow` de `.devin/config.json`, que se comparte, o de `.devin/config.local.json`, que no. `Exec(prefijo)` deja ejecutar sin preguntar, y `Write(ruta)` amplía su sandbox (`--sandbox`), que sin eso solo escribe en el espacio de trabajo.
- A5: Devin carga también los hooks de `.claude/` por defecto. Los matchers de Claude Code (`Bash`, `Write`, `Edit`…) no casan con sus herramientas, en minúscula, pero su `Stop` sí correría: con los dos instalados, el fin de turno podría traer el informe dos veces, sin bucle.
- A6: Desde la 1.3.6, Antigravity CLI pone `GIT_EDITOR`, `HGEDITOR` y `JJ_EDITOR` a `false` en los comandos del agente, según su changelog; una persona no tiene `HGEDITOR` y `JJ_EDITOR` a `false` a la vez.

## Criterios de aceptación

- AC1: CUANDO el agente de Devin va a escribir fuera del alcance de la tarea, a ejecutar `git commit` o un comando de la persona sin modo delegado, también escribiéndolo en un proceso en marcha (`write_to_process`) ENTONCES el guard sale con 2, con el motivo y el SIGUIENTE en stderr, y lo permitido sale con 0.
- AC2: CUANDO un comando de Devin (`exec`) cambia archivos que no podía cambiar ENTONCES su `PostToolUse` responde con el aviso en `hookSpecificOutput.additionalContext`.
- AC3: CUANDO Devin compacta la conversación (`PostCompaction`) ENTONCES la tarjeta de `specty next` llega con el resultado del siguiente comando, una vez.
- AC4: CUANDO el agente de Devin termina su turno y `specty check --changed` falla ENTONCES `Stop` responde `{"decision":"block","reason":…}` con el informe, y con `stop_hook_active: true` deja terminar; `check --install` lo añade a `.devin/hooks.v1.json` una sola vez.
- AC5: CUANDO `specty init` corre en un repositorio que usa Devin o Windsurf ENTONCES `.devin/hooks.v1.json` tiene el guard y conserva los demás hooks, `.devin/config.json` permite `Exec(specty)` y `.devin/config.local.json` deja escribir en la carpeta común de git y en la de las worktrees. Los archivos con rutas de la máquina quedan fuera de git, `doctor` avisa si falta el guard y `uninstall` lo quita todo.
- AC6: CUANDO se ejecuta un comando de la persona en una terminal cuyo entorno tiene `HGEDITOR=false` y `JJ_EDITOR=false` ENTONCES Specty no la cuenta como la terminal de la persona.
- AC7: CUANDO se lee la tabla de capacidades de ARCHITECTURE §10 ENTONCES la fila «Devin (Windsurf)» tiene el guard, el aviso tras cada comando, el fin de turno, la exclusión y los permisos en «sí», la tarjeta tras compactar en «indirecto», y la prueba de extremo a extremo en «no posible», con su motivo.

## Diseño

- `agents/windsurf.ts` sigue el id `windsurf`, que ya usan la configuración y `--tools`, y habla con Devin:
  - escribe sus eventos en la raíz de `.devin/hooks.v1.json` (`withHooks` sobre ese objeto);
  - responde con la salida 2 de Claude Code antes de la acción, y con `additionalContext` después, con la tarjeta si una compactación la dejó (`compacting`, como Cursor);
  - su fin de turno es el de Claude Code en ese archivo;
  - lee la ruta de `file_path` o de `path`, el parche de `apply_patch` del primer texto que lo traiga, y juzga lo que `write_to_process` escribe como un comando;
  - sin `tool_use_id`, empareja el antes y el después por la sesión y un hash de la entrada, como en Gemini CLI.
- Permisos: `Exec(specty)` en `.devin/config.json`, que se versiona como la regla de Codex, y `Write(<carpeta>/**)` de `sharedFolders` en `.devin/config.local.json`, excluido de git.
- `AGENT_NAMES.windsurf` pasa a «Devin (Windsurf)», y las marcas suman `.devin`.
- `detectAgentTool` pasa a una tabla de marcas por agente, para no crecer en complejidad, y suma la de Antigravity CLI.
- T1 pone ya el guard en «sí» en `capabilities.ts`, porque el tipo de `ADAPTERS` lo pide, así que el test de la tabla del core falla hasta T5.

## Archivos

- crear packages/cli/src/agents/windsurf.ts — todo lo de Devin
- modificar packages/cli/src/agents/index.ts — Devin en el registro
- modificar packages/cli/src/install/agents.ts — las rutas de `.devin/`, que `new` copia a cada worktree si son locales
- modificar packages/core/src/capabilities.ts — las celdas y marcas de Devin
- modificar packages/core/src/agents.ts — su nombre y la tabla de marcas del entorno, con la de Antigravity CLI
- modificar packages/core/src/cards/doctor.ts — las líneas del guard de Devin
- modificar packages/core/src/cards/install.ts — sus líneas de `init`: permisos y modo restringido
- modificar packages/core/src/cards/index.ts — las exporta
- crear packages/cli/test/windsurf.test.ts — el guard, el aviso, la tarjeta, el fin de turno, la instalación y los permisos (AC1 a AC5)
- modificar packages/cli/test/agents.test.ts — el módulo de Devin y sus eventos
- modificar packages/core/test/cards.test.ts — la marca de Antigravity CLI (AC6)
- modificar packages/core/test/capabilities.test.ts — la fila de Devin (AC7)
- modificar docs/ARCHITECTURE.md — Devin (§10), la marca de la terminal (§4) y la tabla
- modificar docs/formats.md — `Stop` de Devin en `check --install`

## Tareas

- [x] T1: Devin tiene su guard
  - files: packages/cli/src/agents/windsurf.ts, packages/cli/src/agents/index.ts, packages/cli/src/install/agents.ts, packages/core/src/capabilities.ts, packages/core/src/agents.ts, packages/core/src/cards/doctor.ts, packages/core/src/cards/install.ts, packages/core/src/cards/index.ts, packages/cli/test/windsurf.test.ts, packages/cli/test/agents.test.ts
  - ac: AC1, AC2, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/windsurf.test.ts test/agents.test.ts test/uninstall.test.ts test/check-ignores.test.ts
- [x] T2: Devin comprueba el fin de turno y trae la tarjeta tras compactar
  - files: packages/cli/src/agents/windsurf.ts, packages/cli/test/windsurf.test.ts, packages/cli/test/agents.test.ts
  - ac: AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/windsurf.test.ts test/agents.test.ts test/check-agent-stop.test.ts
- [x] T3: Los permisos de Devin dejan decidir a Specty
  - files: packages/cli/src/agents/windsurf.ts, packages/cli/src/install/agents.ts, packages/core/src/cards/install.ts, packages/core/src/cards/index.ts, packages/cli/test/windsurf.test.ts
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/windsurf.test.ts test/uninstall.test.ts
- [x] T4: Specty reconoce la terminal de Antigravity CLI
  - files: packages/core/src/agents.ts, packages/core/test/cards.test.ts
  - ac: AC6
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards.test.ts
- [x] T5: La tabla de capacidades y la documentación lo cuentan
  - files: packages/core/src/capabilities.ts, packages/core/test/capabilities.test.ts, docs/ARCHITECTURE.md, docs/formats.md
  - ac: AC7
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/capabilities.test.ts

## Riesgos

- R1: Nada de esto se puede probar con Devin de verdad. Mitigación: las pruebas usan los eventos con la forma que documenta Devin CLI, el módulo lee los dos nombres posibles de cada ruta, y ARCHITECTURE §10 dice qué no está comprobado.
- R2: Si `PostCompaction` no llega en Devin Desktop, la tarjeta no vuelve tras compactar. Mitigación: AGENTS.md sigue pidiendo `specty next`, y el guard da el SIGUIENTE en cada bloqueo.
- R3: `Exec(specty)` deja ejecutar sin preguntar cualquier comando de Specty. Mitigación: el guard decide antes que los permisos de Devin, y los comandos de la persona le siguen bloqueados al agente sin modo delegado.
