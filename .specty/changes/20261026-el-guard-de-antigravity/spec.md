---
kind: standard
epic: 20261026-todos-los-agentes-al-nivel-de-claude-code
slice: C8
---

# El guard de Antigravity

## Objetivo

Antigravity no tiene el guard de Specty: su agente puede escribir fuera del alcance, hacer `git commit` o ejecutar los comandos de la persona, y solo lo frenan los hooks de git y el CI. `init` le instala el guard en `.agents/hooks.json`:
- `PreToolUse` bloquea antes de que ocurra lo que el flujo no permite, con el motivo y el SIGUIENTE.
- `PostToolUse` mira qué cambió cada comando. Como Antigravity no deja responder al modelo en ese momento, el aviso le llega en la siguiente llamada al modelo (`PreInvocation`).

`doctor` lo comprueba y `uninstall` lo quita. En la tabla de capacidades, el guard de Antigravity pasa a «sí» y su aviso tras cada comando a «indirecto».

## Fuera de alcance

- El fin de turno, la tarjeta en cada turno, la exclusión y los permisos de Antigravity, que son C9.
- Reconocer la terminal del agente de Antigravity por su entorno: no está documentado que deje una marca, así que los comandos de la persona los sigue frenando el guard antes de ejecutarse.
- Las herramientas del navegador y las de leer o buscar, que no cambian el repositorio.

## Supuestos

- A1: Según su documentación (revisada el 2026-10-26), Antigravity lee los hooks del espacio de trabajo en `.agents/hooks.json` cuando la persona confía en la carpeta. Cada clave de primer nivel es un hook con nombre, y sus eventos llevan `matcher` y `hooks` (`PreToolUse`, `PostToolUse`) o una lista de manejadores (`PreInvocation`). La entrada llega en camelCase (`conversationId`, `workspacePaths`, `toolCall` con `name` y `args`, `stepIdx`), y no dice qué evento es.
  - impacto: alto
- A2: Antigravity no mira los códigos de salida: `PreToolUse` responde con JSON y `decision` (`allow` o `deny`, con `reason`). Un hook que falla, se agota o sale con un código distinto de 0 bloquea la herramienta, así que el guard siempre sale con 0 y permite ante sus propios errores. `PostToolUse` espera `{}`, y `PreInvocation` acepta `injectSteps` con un `ephemeralMessage`.
  - impacto: alto
- A3: Sus herramientas que cambian el repositorio son `run_command` (`CommandLine`, `Cwd`), `write_to_file`, `replace_file_content` y `multi_replace_file_content` (`TargetFile`); no hay una para borrar archivos.
- A4: Codex también usa la carpeta `.agents` (sus skills), así que Antigravity se detecta por archivos suyos: `.agents/hooks.json`, `.agents/rules`, `.agents/workflows`, `.agent` y `.antigravityignore`.

## Criterios de aceptación

- AC1: CUANDO el agente de Antigravity va a escribir un archivo fuera del alcance de la tarea, a ejecutar `git commit` o un comando de la persona sin modo delegado ENTONCES el guard responde `{"decision":"deny"}` con el motivo y el SIGUIENTE, y lo que sí está permitido recibe `{"decision":"allow"}`.
- AC2: CUANDO un comando de Antigravity cambia archivos que no podía cambiar ENTONCES su `PostToolUse` recibe `{}`, y la siguiente llamada al modelo de esa conversación (`PreInvocation`) trae el aviso como `ephemeralMessage`, una sola vez.
- AC3: CUANDO el guard falla o el evento llega fuera de un repositorio con Specty ENTONCES responde con salida 0 y deja pasar la herramienta.
- AC4: CUANDO `specty init` corre en un repositorio que usa Antigravity ENTONCES `.agents/hooks.json` tiene el hook `specty` con `PreToolUse`, `PostToolUse` y `PreInvocation`, conserva los demás hooks, va excluido de git si lleva una ruta de la máquina, `doctor` avisa si falta y `uninstall` lo quita.
- AC5: CUANDO se lee la tabla de capacidades de ARCHITECTURE §10 ENTONCES el guard de Antigravity es «sí» y su aviso tras cada comando, «indirecto».

## Diseño

- Los hooks de Antigravity llaman a `specty guard --tool antigravity --event <evento>`: `entry.ts` y el comando `guard` aceptan `--event`, y el guard lo pone como `hook_event_name` cuando la entrada no lo trae.
- El contrato gana `normalize` (opcional), que lleva la entrada de un agente a los nombres comunes (`session_id`, `cwd`, `tool_name`, `tool_input`, `tool_use_id`). Antigravity forma `tool_use_id` con `conversationId` y `stepIdx`, y `cwd` con el `Cwd` del comando o su primera carpeta de trabajo.
- El contrato también gana:
  - `late: "invocation"`: lo que la herramienta no deja dar tras un comando lo da en la siguiente llamada al modelo;
  - el tipo de evento `invocation`;
  - `inject(texts)`, que lo entrega.

  El guard deja el aviso pendiente por conversación (`enforce/pending.ts`, tipo `warning`) y lo entrega en el siguiente `invocation`.
- `agents/antigravity.ts`: su `PreToolUse` con el matcher de sus cuatro herramientas, sus respuestas siempre en JSON y con salida 0, y la instalación, `doctor` y `uninstall` del hook `specty` en `.agents/hooks.json`.

## Archivos

- crear packages/cli/src/agents/antigravity.ts — todo lo de Antigravity
- modificar packages/cli/src/agents/index.ts — Antigravity en el registro
- modificar packages/cli/src/agents/adapter.ts — `normalize`, `late`, el evento `invocation` e `inject`
- modificar packages/cli/src/enforce/guard.ts — el evento del argumento, la entrada normalizada y el aviso que se entrega más tarde
- modificar packages/cli/src/enforce/pending.ts — el aviso pendiente (`warning`)
- modificar packages/cli/src/enforce/entry.ts — `guard --tool <id> --event <evento>` por el camino rápido
- modificar packages/cli/src/enforce/commands.ts — la opción `--event` del comando `guard`
- modificar packages/cli/src/install/agents.ts — la ruta de `.agents/hooks.json`, que `new` copia a cada worktree
- modificar packages/core/src/capabilities.ts — el guard y el aviso de Antigravity, y sus marcas
- modificar packages/core/src/cards/doctor.ts — las líneas del guard de Antigravity
- modificar packages/core/src/cards/install.ts — la línea de `init` del guard de Antigravity y su confianza
- modificar packages/core/src/cards/index.ts — exporta esa línea
- crear packages/cli/test/antigravity.test.ts — el guard, el aviso, la instalación, `doctor` y `uninstall` (AC1 a AC4)
- modificar packages/cli/test/agents.test.ts — el módulo de Antigravity responde en JSON y reconoce sus eventos
- modificar packages/core/test/capabilities.test.ts — la fila de Antigravity cambia (AC5)
- modificar docs/ARCHITECTURE.md — el guard de Antigravity (§10) y la tabla
- modificar docs/formats.md — el aviso pendiente en la carpeta de git (§1)

## Tareas

- [x] T1: El guard entiende el evento del argumento, normaliza la entrada y entrega más tarde lo que no pudo
  - files: packages/cli/src/agents/adapter.ts, packages/cli/src/enforce/guard.ts, packages/cli/src/enforce/pending.ts, packages/cli/src/enforce/entry.ts, packages/cli/src/enforce/commands.ts
  - ac: AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/enforce.test.ts test/cursor.test.ts test/hooks-entry.test.ts
- [x] T2: Antigravity tiene su guard
  - files: packages/cli/src/agents/antigravity.ts, packages/cli/src/agents/index.ts, packages/cli/src/install/agents.ts, packages/core/src/capabilities.ts, packages/core/src/cards/doctor.ts, packages/core/src/cards/install.ts, packages/core/src/cards/index.ts, packages/cli/test/antigravity.test.ts, packages/cli/test/agents.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/antigravity.test.ts test/agents.test.ts test/uninstall.test.ts
- [x] T3: La tabla de capacidades y la documentación lo cuentan
  - files: packages/core/src/capabilities.ts, packages/core/test/capabilities.test.ts, docs/ARCHITECTURE.md, docs/formats.md
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/capabilities.test.ts

## Riesgos

- R1: Un error del guard bloquearía todas las herramientas de Antigravity, porque cierra en fallo. Mitigación: el guard captura sus errores y responde «permitir» con salida 0, y la prueba lo fija (AC3).
- R2: `PreInvocation` corre antes de cada llamada al modelo y suma el tiempo del guard a cada una. Mitigación: sin aviso pendiente, el guard solo mira un archivo y responde `{}`.
- R3: Nada de esto se puede probar con Antigravity de verdad, porque su modelo va por su servidor. Mitigación: las pruebas usan los eventos con la forma que documenta Antigravity.
