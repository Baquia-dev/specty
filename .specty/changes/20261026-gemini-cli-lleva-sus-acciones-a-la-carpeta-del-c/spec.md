---
kind: standard
epic: 20261026-los-agentes-entran-en-la-carpeta-del-cambio-sin
slice: C2
---

# Gemini CLI lleva sus acciones a la carpeta del cambio

## Objetivo

Desde C1, una conversación de Gemini CLI que entra en un cambio (`specty enter <id>`) tiene que usar ella misma las rutas y los `cd` de la carpeta del cambio. Con este corte, el guard reescribe la entrada de cada herramienta de Gemini CLI (escribir, editar, leer, listar, buscar y ejecutar) para que la acción ocurra en esa carpeta, e `init` abre esa carpeta a sus herramientas. Además, el fin de turno de una conversación que entró en un cambio comprueba esa carpeta, con cualquier herramienta.

## Fuera de alcance

- Las demás herramientas: OpenCode (C3), Codex (C4), Antigravity y Devin (C5) y Cursor (C6).
- Reescribir lo que hace un comando de shell por dentro: el guard lo lleva a la carpeta del cambio (`dir_path`), y un `cd` a otra carpeta se sigue bloqueando como en C1.
- Que el árbol de archivos o el contexto inicial de Gemini CLI muestren solo la carpeta del cambio.

## Supuestos

- A1: Gemini CLI 0.65 fusiona el `hookSpecificOutput.tool_input` de `BeforeTool` con la entrada de la herramienta, valida otra vez los parámetros, le dice al modelo qué campos cambió un hook, y `AfterTool` recibe la entrada ya cambiada. Comprobado en su código.
  - impacto: alto
- A2: Sus herramientas de archivos solo trabajan dentro de su espacio de trabajo, que amplía `context.includeDirectories` de sus ajustes. Gemini CLI no arranca si una de esas carpetas no existe, y `grep_search` y `glob` sin carpeta buscan en todas. Comprobado con Gemini CLI 0.65 y un modelo simulado.
  - impacto: alto
- A3: `read_many_files` no está entre las herramientas de Gemini CLI 0.65, así que no hay que reescribirla.
- A4: Con la confianza de carpetas activada, Gemini CLI pregunta una vez si se confía en una carpeta de `context.includeDirectories`, y lo recuerda.

## Criterios de aceptación

- AC1: CUANDO una conversación de Gemini CLI que entró en un cambio escribe, edita, lee o lista con una ruta relativa o de otra carpeta del repositorio ENTONCES el guard cambia esa ruta por la misma dentro de la carpeta del cambio, y juzga la acción con las reglas de ese cambio.
- AC2: CUANDO esa conversación busca (`grep_search`, `glob`) o ejecuta un comando ENTONCES la búsqueda o el comando corren en la carpeta del cambio, o en la misma subcarpeta dentro de ella.
- AC3: CUANDO una conversación de Gemini CLI que no entró en ningún cambio busca sin carpeta ENTONCES la búsqueda se queda en la carpeta de la herramienta, aunque su espacio de trabajo incluya la de las worktrees; el resto de sus acciones no cambia.
- AC4: CUANDO una conversación de cualquier herramienta que entró en un cambio termina su turno ENTONCES `specty check --changed` corre en la carpeta de ese cambio.
- AC5: CUANDO `init` instala el guard de Gemini CLI en unos ajustes locales ENTONCES añade la carpeta de las worktrees a `context.includeDirectories` y la crea si no existe, salvo con `--dry-run`; con unos ajustes que van en git, dice qué añadir en la configuración del usuario. `uninstall` quita la entrada y deja la carpeta.
- AC6: CUANDO se ejecuta `pnpm check` en una máquina con Gemini CLI ENTONCES una prueba con un modelo simulado entra en un cambio con `specty enter` y escribe, lee y ejecuta un comando en su carpeta; sin Gemini CLI, se salta.
- AC7: CUANDO se lee la tabla de capacidades de ARCHITECTURE §10 ENTONCES «Worktree por nombre» de Gemini CLI dice «indirecto», con cómo entra.

## Diseño

- El contrato de los módulos de agente gana `redirect(event, to)`: los campos de la entrada de la herramienta que hay que devolverle para que la acción ocurra en la carpeta de la conversación, en la forma en que los toma (Gemini CLI los fusiona). `to` da esa carpeta (la del cambio en el que entró, o si no la de la herramienta) y la misma ruta allí. El veredicto que deja pasar lleva esos campos (`Verdict.input`).
- El guard pide la reescritura al módulo antes de juzgar, y juzga la acción reescrita, que es la que corre si pasa.
- La ubicación de las acciones (rutas y comandos en las worktrees, y su reescritura) sale de `enforce/guard.ts`, que ya pasaba el aviso de tamaño, a `enforce/place.ts`.
- La sesión de una conversación ligada pasa a `enforce/sessions.ts`, donde la usan el guard y el fin de turno.
- Gemini CLI: `BeforeTool` también con `read_file`, `list_directory`, `glob` y `grep_search`. `file_path` y `dir_path` pasan a la carpeta del cambio; una búsqueda sin `dir_path` lo recibe siempre, y un comando sin él, solo en una conversación ligada. Responde con `hookSpecificOutput.tool_input`.
- `init`, con ajustes locales, pone la carpeta de las worktrees en `context.includeDirectories` y la crea si falta (`InstallFiles.folder`). Nada de Specty la borra: `close` y `prune` solo quitan las carpetas de dentro.
- La tabla de capacidades cambia «Worktree por nombre» de Gemini CLI a «indirecto». Su test cambia en la fila de Gemini CLI y en la lista de «no posible»: es un cambio previsto.

## Archivos

- crear packages/cli/src/enforce/place.ts — la ubicación de las acciones y su reescritura
- modificar packages/cli/src/enforce/guard.ts — usa place.ts y aplica la reescritura
- modificar packages/cli/src/enforce/sessions.ts — la sesión de una conversación ligada
- modificar packages/cli/src/enforce/agent-stop.ts — el fin de turno en la carpeta del cambio
- modificar packages/cli/src/agents/adapter.ts — `redirect` y `Verdict.input`
- modificar packages/cli/src/agents/gemini-cli.ts — la reescritura, la respuesta, las herramientas de lectura y `context.includeDirectories`
- modificar packages/cli/src/install/files.ts — crear una carpeta
- modificar packages/core/src/cards/install.ts — los textos de la carpeta de las worktrees en Gemini CLI
- modificar packages/core/src/capabilities.ts — «Worktree por nombre» de Gemini CLI
- modificar packages/core/test/capabilities.test.ts — la fila de Gemini CLI y la lista de «no posible»
- modificar packages/cli/test/enter.test.ts — el fin de turno de una conversación ligada
- modificar packages/cli/test/gemini-cli.test.ts — la reescritura y los ajustes
- modificar packages/cli/test/gemini-e2e.test.ts — entrar y trabajar en la carpeta del cambio
- modificar docs/ARCHITECTURE.md — §10

## Tareas

- [x] T1: La ubicación de las acciones sale del guard a su módulo
  - files: packages/cli/src/enforce/guard.ts, packages/cli/src/enforce/place.ts
  - ac: —
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/enter.test.ts test/enforce.test.ts test/codex.test.ts test/worktrees.test.ts
  - type: refactor
- [x] T2: El fin de turno de una conversación ligada comprueba la carpeta de su cambio
  - files: packages/cli/src/enforce/sessions.ts, packages/cli/src/enforce/guard.ts, packages/cli/src/enforce/agent-stop.ts, packages/cli/test/enter.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/enter.test.ts test/check-agent-stop.test.ts
- [ ] T3: Gemini CLI lleva sus acciones a la carpeta de la conversación
  - files: packages/cli/src/agents/adapter.ts, packages/cli/src/enforce/guard.ts, packages/cli/src/enforce/place.ts, packages/cli/src/agents/gemini-cli.ts, packages/cli/test/gemini-cli.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/gemini-cli.test.ts test/enter.test.ts
- [ ] T4: init abre a Gemini CLI la carpeta de las worktrees
  - files: packages/cli/src/agents/gemini-cli.ts, packages/cli/src/install/files.ts, packages/core/src/cards/install.ts, packages/cli/test/gemini-cli.test.ts
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/gemini-cli.test.ts test/install-files.test.ts
- [ ] T5: Gemini CLI entra y trabaja en la carpeta del cambio con la herramienta de verdad, y la tabla lo dice
  - files: packages/cli/test/gemini-e2e.test.ts, packages/core/src/capabilities.ts, packages/core/test/capabilities.test.ts, docs/ARCHITECTURE.md
  - ac: AC6, AC7
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/gemini-e2e.test.ts

## Riesgos

- R1: Si la carpeta de las worktrees desaparece porque la borra la persona, Gemini CLI no arranca. Mitigación: Specty nunca la borra, `init` la vuelve a crear, y ARCHITECTURE §10 lo dice.
- R2: Con la carpeta de las worktrees en su espacio de trabajo, el contexto inicial de Gemini CLI también lista su árbol. Mitigación: las búsquedas sin carpeta se quedan en la de la conversación (AC3), y escribir en otra worktree sigue bloqueado.
- R3: Las lecturas y búsquedas pasan ahora por el guard, que suma su arranque a cada una. Mitigación: sin una conversación ligada, el guard solo abre la sesión y lee la ligadura antes de dejarla pasar.
