---
kind: standard
epic: 20261026-los-agentes-entran-en-la-carpeta-del-cambio-sin
slice: C4
---

# Codex lleva sus acciones a la carpeta del cambio

## Objetivo

Con C2 y C3, el guard reescribe la entrada de una herramienta para que la acción de una conversación que entró en un cambio ocurra en la carpeta de ese cambio. Este corte lo hace con Codex: un comando va tras un `cd` a esa carpeta, y un parche escribe allí sus archivos. Además, `init` deja al sandbox de Codex escribir en la carpeta de las worktrees.

## Fuera de alcance

- Antigravity y Devin (C5) y Cursor (C6).
- Las lecturas y búsquedas de Codex, que van por la shell: corren donde corre el comando.
- Editar un `.codex/config.toml` que ya existe: Specty no tiene un editor de TOML, así que solo dice qué añadir.

## Supuestos

- A1: Codex 0.164 aplica el `updatedInput` de `PreToolUse` cuando va con `permissionDecision: "allow"`, y para `Bash` y `apply_patch` lo toma como su `command`, que es el texto del comando o del parche. Según su documentación, `allow` no se salta su aprobación, que va por `PermissionRequest`.
  - impacto: alto
- A2: Codex lee `.codex/config.toml` en un proyecto de confianza, también `[sandbox_workspace_write] writable_roots`, y una de esas carpetas tiene que existir.
  - impacto: alto
- A3: La regla de Codex para los comandos de Specty (`prefix_rule` con `specty`) sigue valiendo detrás de un `cd`, así que `cd '<carpeta>' && specty task done …` hace su commit fuera del sandbox.
  - impacto: alto
- A4: El hook no ve el `workdir` que el modelo dé a `exec_command`, así que el `cd` va a la carpeta del cambio, con su ruta absoluta.

## Criterios de aceptación

- AC1: CUANDO una conversación de Codex que entró en un cambio ejecuta un comando ENTONCES el comando corre en la carpeta del cambio, tras un `cd` que pone el guard, y el guard lo juzga con las reglas de ese cambio.
- AC2: CUANDO esa conversación aplica un parche con rutas relativas o de otra carpeta del repositorio ENTONCES el parche escribe en las mismas rutas dentro de la carpeta del cambio.
- AC3: CUANDO `init` instala el guard de Codex y el proyecto no tiene `.codex/config.toml` ENTONCES lo crea, fuera de git, con la carpeta de las worktrees en `writable_roots`, y crea esa carpeta si falta; si el archivo ya existe y no es de Specty, dice qué añadir. `uninstall` borra el de Specty.
- AC4: CUANDO se ejecuta `pnpm check` en una máquina con Codex ENTONCES una prueba con un modelo simulado entra en un cambio con `specty enter`, aplica un parche y completa una tarea con `specty task done` en su carpeta; sin Codex, se salta.
- AC5: CUANDO se lee la tabla de capacidades de ARCHITECTURE §10 ENTONCES «Worktree por nombre» de Codex dice «indirecto», con cómo entra.

## Diseño

- El módulo de Codex gana `redirect`. Un `Bash` de una conversación que trabaja en otra carpeta pasa a `cd '<carpeta>' && <comando>`. Un `apply_patch` lleva las rutas de sus cabeceras a esa carpeta con `movePatch` (C3).
- Cuando la entrada cambia, la respuesta va en la salida estándar: `hookSpecificOutput` con `hookEventName: "PreToolUse"`, `permissionDecision: "allow"` y `updatedInput`.
- `init` escribe `.codex/config.toml` solo si no existe o si es el de Specty, que se reconoce por su comentario. Lleva una ruta de la máquina, así que va excluido de git. Crea la carpeta de las worktrees si falta.
- La tabla de capacidades cambia «Worktree por nombre» de Codex a «indirecto». Su test cambia en la fila de Codex y en la lista de «no posible»: es un cambio previsto.

## Archivos

- modificar packages/cli/src/agents/codex.ts — la reescritura, la respuesta y `.codex/config.toml`
- modificar packages/cli/test/codex.test.ts — la reescritura y `.codex/config.toml`
- modificar packages/core/src/cards/install.ts — los textos de las raíces escribibles de Codex
- modificar packages/core/src/cards/index.ts — los exporta
- modificar packages/cli/test/codex-e2e.test.ts — entrar, parchear y completar una tarea en la carpeta del cambio
- modificar packages/core/src/capabilities.ts — «Worktree por nombre» de Codex
- modificar packages/core/test/capabilities.test.ts — la fila de Codex y la lista de «no posible»
- modificar docs/ARCHITECTURE.md — §10

## Tareas

- [x] T1: Codex lleva sus comandos y sus parches a la carpeta de la conversación
  - files: packages/cli/src/agents/codex.ts, packages/cli/test/codex.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/codex.test.ts test/enter.test.ts
- [x] T2: init deja al sandbox de Codex escribir en la carpeta de las worktrees
  - files: packages/cli/src/agents/codex.ts, packages/core/src/cards/install.ts, packages/core/src/cards/index.ts, packages/cli/test/codex.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/codex.test.ts
- [x] T3: Codex entra y trabaja en la carpeta del cambio con la herramienta de verdad, y la tabla lo dice
  - files: packages/cli/test/codex-e2e.test.ts, packages/core/src/capabilities.ts, packages/core/test/capabilities.test.ts, docs/ARCHITECTURE.md
  - ac: AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/codex-e2e.test.ts

## Riesgos

- R1: Si la regla de Specty no vale detrás de un `cd` (A3), sus commits fallan en el sandbox desde una conversación ligada. Mitigación: la prueba de extremo a extremo completa una tarea así, y si falla, el corte añade una regla para `cd`, que no escribe nada.
- R2: Un `workdir` que el modelo dé a `exec_command` se pierde con el `cd` a la carpeta del cambio. Mitigación: el comando corre igual en la carpeta del cambio, y el modelo ve en su salida dónde corrió.
