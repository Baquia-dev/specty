---
kind: standard
epic: 20261026-los-agentes-entran-en-la-carpeta-del-cambio-sin
slice: C6
---

# Cursor entra en la carpeta del cambio, y new propone entrar

## Objetivo

Con C2 a C5, las demás herramientas con guard llevan a la carpeta del cambio las acciones de una conversación que entró en él, o bloquean con la ruta buena lo que no pueden llevar. Este corte lo hace con Cursor: sus comandos van tras un `cd` a esa carpeta, y sus archivos y lecturas se bloquean con la ruta buena. Además, cuando `specty new` reconoce una herramienta que sabe entrar, su SIGUIENTE propone `specty enter <id>` en vez de abrir otra sesión.

## Fuera de alcance

- Probar Cursor con la herramienta de verdad: su modelo va siempre por su servidor (ARCHITECTURE §10).
- El SIGUIENTE de `new` para una herramienta que Specty no reconoce, que sigue diciendo las maneras generales.

## Supuestos

- A1: Cursor aplica el `updated_input` de `preToolUse` a `Shell`, cuya entrada es `command` y `working_directory`, y no a `Write` ni a `Task` (su documentación y su foro). No consta si `beforeShellExecution` recibe después el comando reescrito.
  - impacto: alto
- A2: El sandbox de Cursor ya puede leer y escribir en la carpeta de las worktrees: `.cursor/sandbox.json` la lleva en `additionalReadwritePaths` desde la épica anterior.
- A3: Las herramientas de lectura de Cursor que pasan por `preToolUse` son `Read` y `Grep`; su documentación no nombra sus campos, así que el guard usa los que ya lee (`file_path`, `path`, `target_file`, `filePath`).

## Criterios de aceptación

- AC1: CUANDO una conversación de Cursor que entró en un cambio ejecuta un comando ENTONCES `preToolUse` le devuelve el comando tras un `cd` a la carpeta del cambio, o a la misma subcarpeta dentro de ella, y el guard lo juzga con las reglas de ese cambio.
- AC2: CUANDO `beforeShellExecution` de esa conversación recibe un comando que correría fuera de la carpeta ENTONCES el guard lo bloquea con el `cd` bueno, porque ese evento no deja reescribir.
- AC3: CUANDO esa conversación escribe, borra o lee fuera de su carpeta ENTONCES el guard lo bloquea y le da la misma ruta dentro de ella.
- AC4: CUANDO `specty new` crea un cambio desde una herramienta que entra en la carpeta de un cambio con `specty enter` ENTONCES su SIGUIENTE propone `specty enter <id>`, y como alternativa que la persona abra la herramienta en esa carpeta, si Specty sabe cómo.
- AC5: CUANDO se lee la tabla de capacidades de ARCHITECTURE §10 ENTONCES «Worktree por nombre» de Cursor dice «indirecto», con cómo entra, y ninguna herramienta con guard queda en «no posible».

## Diseño

- El módulo de Cursor gana `redirect`, solo para `Shell` en `preToolUse`: `cd '<carpeta>' && <comando>`, donde la carpeta es la de la conversación o, con `working_directory`, la misma ruta dentro de ella. Responde con `permission: "allow"` y `updated_input`. `beforeShellExecution` no reescribe: el guard juzga el comando como llega, que solo pasa si ya va a la carpeta del cambio.
- `preToolUse` también con `Read` y `Grep`, que son acciones `read` (C5).
- La tarjeta de `new` propone `specty enter <id>` a una herramienta cuya «Worktree por nombre» es «indirecto», con la manera de abrirla allí como alternativa.
- Los tests del SIGUIENTE de `new` con Codex (core y CLI) cambian a `specty enter`, y el de la tabla, en la fila de Cursor y en la lista de «no posible», que desaparece: son cambios previstos. `NO_ENTER_WORKTREE` deja de usarse y se borra.

## Archivos

- modificar packages/cli/src/agents/cursor.ts — la reescritura de `Shell`, la respuesta y las lecturas
- modificar packages/cli/test/cursor.test.ts — la reescritura, `beforeShellExecution` y las lecturas
- modificar packages/core/src/cards/new.ts — el SIGUIENTE propone `specty enter`
- modificar packages/core/test/cards/new.test.ts — el SIGUIENTE con una herramienta que sabe entrar
- modificar packages/cli/test/worktrees.test.ts — el SIGUIENTE de `new` desde Codex
- modificar packages/core/src/capabilities.ts — «Worktree por nombre» de Cursor
- modificar packages/core/test/capabilities.test.ts — la fila de Cursor y la lista de «no posible»
- modificar docs/ARCHITECTURE.md — §10

## Tareas

- [x] T1: Cursor lleva sus comandos a la carpeta de la conversación y bloquea con la ruta buena lo demás
  - files: packages/cli/src/agents/cursor.ts, packages/cli/test/cursor.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/cursor.test.ts test/enter.test.ts
- [x] T2: new propone specty enter a una herramienta que sabe entrar
  - files: packages/core/src/cards/new.ts, packages/core/test/cards/new.test.ts, packages/cli/test/worktrees.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/new.test.ts && pnpm --filter @baquia-dev/specty exec vitest run test/worktrees.test.ts
- [x] T3: La tabla dice cómo entra Cursor
  - files: packages/core/src/capabilities.ts, packages/core/test/capabilities.test.ts, docs/ARCHITECTURE.md
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/capabilities.test.ts

## Riesgos

- R1: Si Cursor no aplicara `updated_input` a `Shell`, el comando correría en la carpeta principal después de que el guard lo juzgara en la del cambio. Mitigación: `beforeShellExecution`, que llega después, juzga el comando tal como va a correr y lo bloquea con el `cd` bueno.
- R2: Si `beforeShellExecution` recibiera el comando sin reescribir aunque Cursor lo aplique, bloquearía un comando que sí iba a la carpeta del cambio. Mitigación: el bloqueo da el `cd` exacto, con el que el comando pasa.
