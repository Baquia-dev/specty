---
kind: standard
epic: 20261026-los-agentes-entran-en-la-carpeta-del-cambio-sin
slice: C5
---

# Antigravity y Devin llevan sus acciones a la carpeta del cambio

## Objetivo

Con C2 a C4, Gemini CLI, OpenCode y Codex llevan a la carpeta del cambio las acciones de una conversación que entró en él. Este corte lo hace con Devin, que deja reescribir la entrada de sus herramientas (`updatedInput`). Antigravity también documenta una reescritura (`overwrite`), pero se descarta en uno de sus modos de permisos. Por eso, en Antigravity el guard no reescribe: bloquea con la ruta buena lo que iría fuera, también las lecturas, y le da permiso para leer y escribir en la carpeta de las worktrees.

## Fuera de alcance

- Cursor (C6).
- Probar Antigravity y Devin con la herramienta de verdad: su modelo va siempre por su servidor (ARCHITECTURE §10). Las pruebas usan los eventos que documentan.
- Las búsquedas de Devin sin carpeta: no consta el nombre del campo que la da, así que siguen en la de su espacio de trabajo.

## Supuestos

- A1: Devin fusiona el `updatedInput` de `PreToolUse` en los argumentos de la herramienta, sin `permissionDecision`, según su documentación. Sus herramientas son `read`, `write`, `edit`, `apply_patch`, `notebook_read`, `notebook_edit`, `grep`, `glob` y `exec`; solo consta el campo `command` de `exec`, y para las demás el guard usa los que ya lee (`file_path` o `path`).
  - impacto: alto
- A2: El `overwrite` de Antigravity se descarta con `toolPermission=request-review`, y entonces corre la llamada original (informe en su foro, Antigravity CLI 1.0.2). Sus herramientas de lectura son `view_file` (`AbsolutePath`), `list_dir` (`DirectoryPath`), `grep_search` (`SearchPath`) y `find_by_name` (`SearchDirectory`), y `permissionOverrides` admite `read_file(<ruta>)` y `write_file(<ruta>)`, según su documentación.
  - impacto: alto
- A3: Devin lee fuera de su espacio de trabajo con un permiso `Read(<carpeta>/**)`, como escribe con `Write(...)`.

## Criterios de aceptación

- AC1: CUANDO una conversación de Devin que entró en un cambio lee, escribe, edita, busca con una ruta, aplica un parche o ejecuta un comando ENTONCES el guard le devuelve la entrada con la misma ruta dentro de la carpeta del cambio, o con un `cd` a ella delante del comando, y juzga la acción con las reglas de ese cambio.
- AC2: CUANDO una conversación que entró en un cambio lee o busca fuera de su carpeta con una herramienta que no reescribe sus acciones (Antigravity) ENTONCES el guard lo bloquea y le da la misma ruta dentro de la carpeta del cambio; las lecturas de las demás conversaciones no cambian.
- AC3: CUANDO el guard deja pasar una acción de una conversación de Antigravity que entró en un cambio ENTONCES la respuesta le permite leer y escribir en la carpeta de las worktrees (`permissionOverrides`).
- AC4: CUANDO `init` instala el guard de Devin ENTONCES sus ajustes locales también le dejan leer la carpeta de las worktrees (`Read(...)`).
- AC5: CUANDO se lee la tabla de capacidades de ARCHITECTURE §10 ENTONCES «Worktree por nombre» de Antigravity y de Devin dice «indirecto», con cómo entra cada uno.

## Diseño

- Core gana la acción `read`, con sus rutas: solo se bloquea una ruta de otra worktree que tenga la misma ruta en la carpeta en la que entró la conversación (`instead`). Leer otra worktree sigue libre para una conversación que no entró en ningún cambio.
- Antigravity: `PreToolUse` también con sus cuatro herramientas de lectura, que son acciones `read`. El veredicto que deja pasar una acción de una conversación ligada lleva la carpeta de las worktrees para leer (`Verdict.readable`) y las de Specty para escribir (`folders`), que Antigravity recibe como `read_file(…)` y `write_file(…)`.
- Devin: `redirect` como Codex: `cd '<carpeta>' && ` delante de `command`, `file_path` o `path` a la misma ruta en la carpeta, y las cabeceras del parche con `movePatch`. Responde con `hookSpecificOutput.updatedInput`. `PreToolUse` también con `read`, `notebook_read`, `grep` y `glob`, que son acciones `read`. Sus ajustes locales añaden `Read(<carpeta de las worktrees>/**)`.
- El test de los permisos de Devin cambia en la lista de sus reglas locales, y el de la tabla, en las filas de Antigravity y Devin y en la lista de «no posible»: son cambios previstos.

## Archivos

- modificar packages/core/src/guard/decide.ts — la acción `read`
- modificar packages/core/test/guard/decide.test.ts — la acción `read`
- modificar packages/cli/src/enforce/actions.ts — `read` en las acciones de una herramienta
- modificar packages/cli/src/enforce/place.ts — ubica las rutas de una lectura
- modificar packages/cli/src/enforce/guard.ts — los permisos de una conversación ligada
- modificar packages/cli/src/agents/adapter.ts — `Verdict.readable`
- modificar packages/cli/src/agents/antigravity.ts — las lecturas y `read_file`
- modificar packages/cli/test/antigravity.test.ts — las lecturas y los permisos de una conversación ligada
- modificar packages/cli/src/agents/windsurf.ts — la reescritura, las lecturas y `Read(...)`
- modificar packages/cli/test/windsurf.test.ts — la reescritura y `Read(...)`
- modificar packages/core/src/capabilities.ts — «Worktree por nombre» de Antigravity y Devin
- modificar packages/core/test/capabilities.test.ts — sus filas y la lista de «no posible»
- modificar docs/ARCHITECTURE.md — §10

## Tareas

- [x] T1: El guard bloquea con la ruta buena lo que lee fuera de su carpeta una conversación que entró en un cambio
  - files: packages/core/src/guard/decide.ts, packages/core/test/guard/decide.test.ts, packages/cli/src/enforce/actions.ts, packages/cli/src/enforce/place.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/guard/decide.test.ts
- [x] T2: Antigravity bloquea con la ruta buena y deja leer y escribir en la carpeta de las worktrees
  - files: packages/cli/src/agents/antigravity.ts, packages/cli/src/agents/adapter.ts, packages/cli/src/enforce/guard.ts, packages/cli/test/antigravity.test.ts
  - ac: AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/antigravity.test.ts test/antigravity-turn.test.ts test/enter.test.ts
- [x] T3: Devin lleva sus acciones a la carpeta de la conversación
  - files: packages/cli/src/agents/windsurf.ts, packages/cli/test/windsurf.test.ts
  - ac: AC1, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/windsurf.test.ts
- [ ] T4: La tabla dice cómo entran Antigravity y Devin
  - files: packages/core/src/capabilities.ts, packages/core/test/capabilities.test.ts, docs/ARCHITECTURE.md
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/capabilities.test.ts

## Riesgos

- R1: Si Devin no aplicara `updatedInput` a una herramienta, la acción iría a la carpeta principal después de que el guard la juzgara en la del cambio. Mitigación: su documentación dice que la fusiona en los argumentos; ARCHITECTURE §10 dice que no está comprobado.
- R2: Las lecturas de Antigravity pasan ahora por el guard, que suma su arranque a cada una. Mitigación: sin una conversación ligada, el guard solo abre la sesión y lee la ligadura.
