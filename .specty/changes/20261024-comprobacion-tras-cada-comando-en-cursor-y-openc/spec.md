---
kind: standard
---

# Comprobación tras cada comando en Cursor y OpenCode

## Objetivo

En Claude Code y Codex, el guard compara el árbol antes y después de cada comando de shell y avisa al momento de lo que cambió fuera de la tarea: lo que escriben intérpretes, scripts y generadores, que el análisis de shell no puede prever. Cursor y OpenCode no tenían ese aviso, y el agente solo se enteraba en `task done`. Ahora lo tienen: Cursor añade el aviso a la conversación tras el resultado del comando, y el plugin de OpenCode lo añade al resultado que ve el modelo.

## Fuera de alcance

- Deshacer lo que cambió el comando: como en Claude Code, es un aviso y `task done` sigue siendo la puerta.
- Comprobar después las ediciones (`Write`, `edit`, `patch`…): el guard ya las juzga antes.
- Avisar en OpenCode 2 cuando la herramienta falla (A5).
- Antigravity, Windsurf y las demás herramientas.

## Supuestos

- A1: En Cursor, `preToolUse` con `Shell` lleva `tool_use_id`, y `postToolUse` y `postToolUseFailure` (matcher `Shell`) llevan el mismo; su salida `additional_context` se añade a la conversación tras el resultado de la herramienta, según la documentación de hooks de Cursor consultada el 2026-10-24.
  - impacto: alto
- A2: En OpenCode 2, `ctx.tool.hook("execute.after", …)` recibe el mismo objeto con el que el núcleo devuelve después el resultado al modelo: con `status: "completed"`, su `result.content` (partes `{type: "text", text}`) se puede cambiar; y un error lanzado en ese hook no rechaza la herramienta, así que el plugin nunca lanza ahí (código de `packages/core/src/tool.ts` y `packages/plugin/src/promise/adapter.ts`, commit f20760b).
  - impacto: alto
- A3: En OpenCode 1 (1.18.29), `"tool.execute.after"` recibe `(input, output)` con `input.callID` y `input.args`, y `output` es el objeto que se devuelve al modelo, así que el aviso añadido a `output.output` le llega (`packages/opencode/src/session/tools.ts`).
  - impacto: alto
- A4: Solo se comprueban los comandos de shell (`Shell` en Cursor; `shell` y `bash` en OpenCode), como en Claude Code con `Bash`.
- A5: En OpenCode 2, si la herramienta falla (`status: "error"`), el plugin llama igual al guard para recoger la foto, pero no avisa: el error es un objeto de OpenCode que un plugin sin dependencias no sabe rehacer.

## Criterios de aceptación

- AC1: CUANDO en Cursor un comando de `Shell` cambia algo que la tarea no permite ENTONCES su `postToolUse` o `postToolUseFailure` responde, con salida 0, `additional_context` con el motivo y el SIGUIENTE; si no cambió nada fuera de la tarea, responde `{}`.
- AC2: CUANDO en OpenCode 2 un comando `shell` termina habiendo cambiado algo que la tarea no permite ENTONCES el resultado que ve el modelo lleva al final el aviso del guard.
- AC3: CUANDO en OpenCode 1 un comando `bash` hace lo mismo ENTONCES el aviso se añade al final de `output.output`.
- AC4: CUANDO la carpeta no usa Specty, la herramienta no es de shell o el guard no avisa ENTONCES el plugin deja el resultado como estaba.
- AC5: CUANDO se ejecuta `specty init` con Cursor ENTONCES `.cursor/hooks.json` lleva `postToolUse` y `postToolUseFailure` con el matcher `Shell`, y `doctor` avisa si faltan; CUANDO el plugin de OpenCode no tiene la comprobación posterior ENTONCES `doctor` pide volver a ejecutar `init`.

## Diseño

- `enforce/actions.ts`: `checksAfterShell` vale para las cuatro herramientas, así que el guard guarda la foto antes de cada comando permitido que lleve `tool_use_id`.
- `enforce/guard.ts`: `isAfterTool` reconoce también los nombres de Cursor (`postToolUse`, `postToolUseFailure`). Tras un comando, Cursor recibe `{"additional_context": "specty: <motivo>\nSIGUIENTE: <paso>"}` o `{}`, siempre con salida 0; Claude Code, Codex y OpenCode siguen con la salida 2 y el texto en stderr.
- El plugin de OpenCode manda al guard `hook_event_name: "PostToolUse"` con el mismo `tool_use_id` que antes del comando, y con la salida 2 añade el texto al resultado: una parte de texto más en `result.content` (OpenCode 2) o al final de `output.output` (OpenCode 1).
- `install/agents.ts` añade los dos eventos a `.cursor/hooks.json`, y `missingCursorEvents` dice cuáles faltan. `doctor` lo usa, y en OpenCode mira si el plugin manda `PostToolUse`.

## Archivos

- modificar packages/cli/src/enforce/actions.ts — la comprobación posterior en Cursor y OpenCode
- modificar packages/cli/src/enforce/guard.ts — los eventos de Cursor y su respuesta con `additional_context`
- crear packages/cli/test/cursor.test.ts — la comprobación en Cursor, su instalación y `doctor`
- modificar packages/cli/src/install/agents.ts — `postToolUse` y `postToolUseFailure` en `.cursor/hooks.json`
- modificar packages/cli/src/commands/doctor.ts — los avisos de Cursor y del plugin de OpenCode
- modificar packages/cli/src/install/opencode.ts — el plugin avisa tras cada comando
- modificar packages/cli/test/opencode.test.ts — el aviso en OpenCode 2 y 1, y `doctor`
- modificar docs/ARCHITECTURE.md — la comprobación posterior en Cursor y OpenCode (§10)

## Tareas

- [x] T1: El guard tras cada comando en Cursor
  - files: packages/cli/src/enforce/actions.ts, packages/cli/src/enforce/guard.ts, packages/cli/test/cursor.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/cursor.test.ts test/enforce.test.ts
  - type: feat
- [x] T2: `init` y `doctor` en Cursor
  - files: packages/cli/src/install/agents.ts, packages/cli/src/commands/doctor.ts, packages/cli/test/cursor.test.ts
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/cursor.test.ts test/setup.test.ts
  - type: feat
- [ ] T3: El plugin de OpenCode avisa tras cada comando
  - files: packages/cli/src/install/opencode.ts, packages/cli/test/opencode.test.ts, packages/cli/src/commands/doctor.ts, docs/ARCHITECTURE.md
  - ac: AC2, AC3, AC4, AC5
  - verify: pnpm check
  - type: feat

## Riesgos

- R1: Ninguna de las dos herramientas está instalada en esta máquina, y su API puede cambiar — los tests usan las formas de su documentación y de su código (A1–A3), el plugin nunca lanza tras el comando, y sin aviso todo sigue como antes: `task done` es la puerta.
- R2: Un comando más lento por la foto previa (unos 150 ms en Claude Code) — el mismo coste que ya se acepta en Claude Code y Codex, y solo en comandos de shell.
