---
kind: standard
epic: 20261026-todos-los-agentes-al-nivel-de-claude-code
slice: C11
---

# El guard de Gemini CLI y su GEMINI.md

## Objetivo

Gemini CLI no tiene el guard de Specty: su agente puede escribir fuera del alcance, hacer `git commit` o ejecutar los comandos de la persona, y solo lo frenan los hooks de git y el CI. Tampoco lee el flujo, porque busca `GEMINI.md` y no `AGENTS.md`. `init` le instala el guard en `.gemini/settings.json`:
- `BeforeTool` bloquea antes de que ocurra lo que el flujo no permite, con el motivo y el SIGUIENTE.
- `AfterTool` mira qué cambió cada comando y le añade el aviso al resultado.

`init` también escribe un `GEMINI.md` que importa `AGENTS.md` sin copiarlo, como hace con `CLAUDE.md`. `doctor` comprueba el guard y `uninstall` lo quita. En la tabla de capacidades, el guard y el aviso tras cada comando de Gemini CLI pasan a «sí».

## Fuera de alcance

- El fin de turno, la tarjeta tras compactar, los permisos y la prueba con un modelo simulado, que son C12.
- Que Google retirara Gemini CLI para las cuentas personales el 2026-06-18: sigue para empresas y claves de API, y a ellas sirve este corte.

## Supuestos

- A1: Según su documentación (revisada el 2026-10-26), Gemini CLI lee los hooks del proyecto en `hooks` de `.gemini/settings.json`, con la forma de Claude Code (`matcher` y `hooks` con `type: "command"`), y los ejecuta por defecto (`hooksConfig.enabled`). La entrada lleva `session_id`, `cwd`, `hook_event_name`, `tool_name` y `tool_input`, pero no un id de la llamada.
  - impacto: alto
- A2: `BeforeTool` bloquea con salida 2 y le manda stderr al agente como error de la herramienta. `AfterTool` añade `hookSpecificOutput.additionalContext` al resultado que ve el agente.
  - impacto: alto
- A3: Sus herramientas que cambian el repositorio son `run_shell_command` (`command` y `dir_path`), `write_file` y `replace` (`file_path`). Ninguna borra archivos ni escribe en un proceso en marcha.
- A4: Gemini CLI guarda una huella de cada hook del proyecto y avisa antes de ejecutar uno nuevo o cambiado, y no carga la configuración de un proyecto en el que la persona no confía.
- A5: `GEMINI.md` importa otro archivo con `@` y una ruta relativa a él (`@./AGENTS.md`).

## Criterios de aceptación

- AC1: CUANDO el agente de Gemini CLI va a escribir un archivo fuera del alcance de la tarea, a ejecutar `git commit` o un comando de la persona sin modo delegado ENTONCES el guard sale con 2, con el motivo y el SIGUIENTE en stderr, y lo permitido sale con 0.
- AC2: CUANDO un comando de Gemini CLI, en su `dir_path` si lo trae, cambia archivos que no podía cambiar ENTONCES su `AfterTool` responde con el aviso en `hookSpecificOutput.additionalContext`.
- AC3: CUANDO el guard falla o el evento llega fuera de un repositorio con Specty ENTONCES no bloquea.
- AC4: CUANDO `specty init` corre en un repositorio que usa Gemini CLI ENTONCES `.gemini/settings.json` tiene el guard en `BeforeTool` y `AfterTool` y conserva lo demás, va excluido de git si lleva una ruta de la máquina, `doctor` avisa si falta y `uninstall` lo quita.
- AC5: CUANDO `specty init` corre en un repositorio que usa Gemini CLI ENTONCES `GEMINI.md` empieza importando `AGENTS.md` (`@./AGENTS.md`) y conserva lo que tuviera, y `uninstall` lo deja y dice que sigue importándolo.
- AC6: CUANDO se lee la tabla de capacidades de ARCHITECTURE §10 ENTONCES Gemini CLI tiene el guard y el aviso tras cada comando en «sí».

## Diseño

- `agents/gemini-cli.ts` instala `BeforeTool` y `AfterTool` en `.gemini/settings.json` con `withHooks`, porque la forma es la de Claude Code. Antes de la acción responde con la salida 2 de Claude Code; tras el comando, con `additionalContext`.
- Su `normalize` pone `cwd` en el `dir_path` del comando. Como la entrada no trae el id de la llamada, forma `tool_use_id` con `session_id` y un hash de `tool_input`, que es el mismo en `BeforeTool` y en `AfterTool`.
- `writePointer` generaliza el `@AGENTS.md` de `CLAUDE.md`, y el módulo de Gemini CLI escribe con él `GEMINI.md`.
- T1 pone ya el guard de Gemini CLI en «sí» en `capabilities.ts`, porque el tipo de `ADAPTERS` lo pide, así que el test de la tabla del core falla hasta T3.
- El test de `init` que usaba Gemini CLI como herramienta sin guard pasa a Copilot, que sigue sin hooks; comprueba lo mismo.

## Archivos

- crear packages/cli/src/agents/gemini-cli.ts — todo lo de Gemini CLI
- modificar packages/cli/src/agents/index.ts — Gemini CLI en el registro
- modificar packages/cli/src/install/agents.ts — la ruta de `.gemini/settings.json`, que `new` copia a cada worktree si es local
- modificar packages/cli/src/install/project-files.ts — `writePointer`, para `CLAUDE.md` y `GEMINI.md`
- modificar packages/cli/src/commands/uninstall.ts — `GEMINI.md` sigue importando `AGENTS.md`
- modificar packages/core/src/capabilities.ts — el guard y el aviso de Gemini CLI
- modificar packages/core/src/cards/doctor.ts — las líneas del guard de Gemini CLI
- modificar packages/core/src/cards/install.ts — la línea de `GEMINI.md` y la huella de los hooks de Gemini CLI
- modificar packages/core/src/cards/uninstall.ts — `GEMINI.md` queda
- modificar packages/core/src/cards/index.ts — exporta esas líneas
- crear packages/cli/test/gemini-cli.test.ts — el guard, el aviso, la instalación, `GEMINI.md`, `doctor` y `uninstall` (AC1 a AC5)
- modificar packages/cli/test/agents.test.ts — el módulo de Gemini CLI responde como Claude Code antes de la acción y con `additionalContext` después
- modificar packages/cli/test/init-reversible.test.ts — la herramienta sin guard pasa a ser Copilot
- modificar packages/core/test/capabilities.test.ts — la fila de Gemini CLI (AC6)
- modificar docs/ARCHITECTURE.md — el guard de Gemini CLI (§10) y la tabla

## Tareas

- [x] T1: Gemini CLI tiene su guard
  - files: packages/cli/src/agents/gemini-cli.ts, packages/cli/src/agents/index.ts, packages/cli/src/install/agents.ts, packages/core/src/capabilities.ts, packages/core/src/cards/doctor.ts, packages/core/src/cards/install.ts, packages/core/src/cards/index.ts, packages/cli/test/gemini-cli.test.ts, packages/cli/test/agents.test.ts, packages/cli/test/init-reversible.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/gemini-cli.test.ts test/agents.test.ts test/init-reversible.test.ts test/uninstall.test.ts
- [ ] T2: GEMINI.md importa AGENTS.md
  - files: packages/cli/src/install/project-files.ts, packages/cli/src/agents/gemini-cli.ts, packages/cli/src/commands/uninstall.ts, packages/core/src/cards/install.ts, packages/core/src/cards/uninstall.ts, packages/core/src/cards/index.ts, packages/cli/test/gemini-cli.test.ts
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/gemini-cli.test.ts test/uninstall.test.ts test/install-files.test.ts test/setup.test.ts
- [ ] T3: La tabla de capacidades y la documentación lo cuentan
  - files: packages/core/src/capabilities.ts, packages/core/test/capabilities.test.ts, docs/ARCHITECTURE.md
  - ac: AC6
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/capabilities.test.ts

## Riesgos

- R1: Si Gemini CLI resuelve `dir_path` desde otra carpeta que el `cwd` de su entrada, el guard situaría mal las rutas de ese comando. Mitigación: `resolve` respeta una ruta absoluta, y el aviso tras el comando mira el árbol entero, no las rutas del comando.
- R2: Dos comandos idénticos a la vez en la misma sesión compartirían `tool_use_id`, y sus fotos del árbol se pisarían. Mitigación: Gemini CLI ejecuta los comandos de uno en uno; en el peor caso el aviso de uno de ellos se pierde, y `task done` sigue siendo la puerta.
- R3: Nada de esto se ha probado con Gemini CLI de verdad en este corte. Mitigación: las pruebas usan los eventos con la forma que documenta Gemini CLI, y C12 añade la prueba con Gemini CLI y un modelo simulado.
