---
kind: standard
epic: 20261026-los-agentes-entran-en-la-carpeta-del-cambio-sin
slice: C3
---

# OpenCode lleva sus acciones a la carpeta del cambio

## Objetivo

Con C2, el guard sabe reescribir la entrada de una herramienta para que la acción de una conversación que entró en un cambio ocurra en la carpeta de ese cambio. Este corte lo hace con OpenCode. El plugin de Specty cambia los argumentos de cada herramienta por los que devuelve el guard: archivos, búsquedas, comandos y parches. Además, `init` permite a OpenCode trabajar en la carpeta de las worktrees.

## Fuera de alcance

- Codex (C4), Antigravity y Devin (C5) y Cursor (C6).
- Reescribir lo que hace un comando de shell por dentro: el guard lo lleva a la carpeta del cambio (`workdir`), y un `cd` a otra carpeta se sigue bloqueando como en C1.
- Avisar en `doctor` de un plugin anterior a este corte: `init` lo reescribe, y mientras tanto el guard no reescribe nada para él.

## Supuestos

- A1: OpenCode 1.19.4 pasa a `tool.execute.before` el mismo objeto de argumentos con el que ejecuta la herramienta, así que el plugin los cambia modificándolo en el sitio. La beta de OpenCode 2 llama al mismo evento con el mismo objeto. Comprobado en sus binarios.
  - impacto: alto
- A2: Una ruta o una carpeta fuera del proyecto pide el permiso `external_directory`, que `opencode run` rechaza solo si no se permite en la configuración. OpenCode lee `.opencode/opencode.json` y `.opencode/opencode.jsonc` del proyecto, y `permission.external_directory` admite un patrón por carpeta (`<carpeta>/**`).
  - impacto: alto
- A3: Las herramientas de OpenCode 1.19.4 nombran su archivo en `filePath` (`read`, `write`, `edit`), su carpeta en `path` (`glob`, `grep`) o `workdir` (`bash`), y sus archivos en las cabeceras de `patchText` (`apply_patch`).

## Criterios de aceptación

- AC1: CUANDO una conversación de OpenCode que entró en un cambio lee, escribe o edita un archivo, o aplica un parche, con rutas relativas o de otra carpeta del repositorio ENTONCES el plugin le cambia esas rutas por las mismas dentro de la carpeta del cambio, y el guard juzga la acción con las reglas de ese cambio.
- AC2: CUANDO esa conversación busca o ejecuta un comando ENTONCES la búsqueda o el comando corren en la carpeta del cambio, o en la misma subcarpeta dentro de ella.
- AC3: CUANDO el plugin instalado es anterior a este corte ENTONCES el guard no reescribe nada y bloquea con la ruta buena, como en C1.
- AC4: CUANDO `init` instala el plugin de OpenCode y `.opencode/opencode.jsonc` no va en git ENTONCES ese archivo permite `external_directory` en la carpeta de las worktrees, fuera de git; si va en git, `init` dice qué añadir en la configuración del usuario. `uninstall` quita la regla.
- AC5: CUANDO se ejecuta `pnpm check` en una máquina con OpenCode ENTONCES una prueba con un modelo simulado entra en un cambio con `specty enter` y escribe, lee y ejecuta un comando en su carpeta; sin OpenCode, se salta.
- AC6: CUANDO se lee la tabla de capacidades de ARCHITECTURE §10 ENTONCES «Worktree por nombre» de OpenCode dice «indirecto», con cómo entra.

## Diseño

- Core gana `movePatch(text, move)`: el parche con la ruta de cada cabecera como la da `move`, y su contenido igual. Lo usarán también Codex (C4).
- El módulo de OpenCode gana `redirect` y responde con `{"tool_input": …}` en la salida estándar cuando la entrada cambia. Solo reescribe si el evento dice que el plugin aplica la entrada reescrita (`"redirects": true`), para que un plugin anterior no ejecute en otra carpeta lo que el guard juzgó en la del cambio.
- El plugin manda `redirects: true`, y si el guard devuelve una entrada, la copia en el objeto de argumentos de la herramienta: quita las claves que ya no están y pone las nuevas.
- Rutas: `filePath`, `path` y `workdir` pasan a la misma ruta en la carpeta del cambio, y las cabeceras de `patchText` también. Una búsqueda o un comando sin carpeta reciben la del cambio solo en una conversación ligada: OpenCode busca en una sola carpeta, la del proyecto.
- `init` escribe `permission.external_directory` con `<carpeta de las worktrees>/**` en `.opencode/opencode.jsonc`, excluido de git, si git no lo sigue; si lo sigue, no le pone rutas de la máquina y avisa. `uninstall` la quita y borra el archivo si se queda vacío.
- La tabla de capacidades cambia «Worktree por nombre» de OpenCode a «indirecto». Su test cambia en la fila de OpenCode y en la lista de «no posible»: es un cambio previsto.

## Archivos

- modificar packages/core/src/guard/patch.ts — `movePatch`
- modificar packages/core/src/index.ts — lo exporta
- modificar packages/core/test/guard/patch.test.ts — `movePatch`
- modificar packages/cli/src/agents/opencode.ts — la reescritura, la respuesta y quitar el permiso
- modificar packages/cli/src/install/opencode.ts — el plugin aplica la entrada reescrita; el permiso `external_directory`
- modificar packages/core/src/cards/install.ts — los textos del permiso de OpenCode
- modificar packages/core/src/cards/index.ts — los exporta
- modificar packages/cli/test/opencode.test.ts — la reescritura, el plugin antiguo y el permiso
- modificar packages/cli/test/opencode-e2e.test.ts — entrar y trabajar en la carpeta del cambio
- modificar packages/core/src/capabilities.ts — «Worktree por nombre» de OpenCode
- modificar packages/core/test/capabilities.test.ts — la fila de OpenCode y la lista de «no posible»
- modificar docs/ARCHITECTURE.md — §10

## Tareas

- [x] T1: Un parche se puede llevar a otra carpeta
  - files: packages/core/src/guard/patch.ts, packages/core/src/index.ts, packages/core/test/guard/patch.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/guard/patch.test.ts
- [x] T2: OpenCode lleva sus acciones a la carpeta de la conversación
  - files: packages/cli/src/agents/opencode.ts, packages/cli/src/install/opencode.ts, packages/cli/test/opencode.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/opencode.test.ts test/enter.test.ts
- [x] T3: init deja a OpenCode trabajar en la carpeta de las worktrees
  - files: packages/cli/src/install/opencode.ts, packages/cli/src/agents/opencode.ts, packages/core/src/cards/install.ts, packages/core/src/cards/index.ts, packages/cli/test/opencode.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/opencode.test.ts
- [x] T4: OpenCode entra y trabaja en la carpeta del cambio con la herramienta de verdad, y la tabla lo dice
  - files: packages/cli/test/opencode-e2e.test.ts, packages/core/src/capabilities.ts, packages/core/test/capabilities.test.ts, docs/ARCHITECTURE.md
  - ac: AC5, AC6
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/opencode-e2e.test.ts

## Riesgos

- R1: Si la persona versiona `.opencode/opencode.jsonc`, OpenCode pide permiso para cada acción en la carpeta del cambio, y `opencode run` la rechaza. Mitigación: `init` dice qué añadir en la configuración del usuario.
- R2: OpenCode 2 cambia su plugin a menudo. Mitigación: el plugin copia la entrada en el mismo objeto que recibe, en las dos versiones, y la prueba de extremo a extremo usa la versión instalada.
