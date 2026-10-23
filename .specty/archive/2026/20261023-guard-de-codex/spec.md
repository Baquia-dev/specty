---
kind: standard
---

# Guard de Codex

## Objetivo

`specty init` instala el guard de Specty en Codex: antes de cada edición (`apply_patch`) y de cada comando, Codex pregunta al guard, que aplica las mismas reglas que en Claude Code y Cursor (spec antes del código, alcance de la tarea, archivos de Specty, worktrees de otros cambios), y tras cada comando revisa lo que cambió. El hook va en la configuración de usuario de Codex (`~/.codex/hooks.json`, o la carpeta de `$CODEX_HOME`) y no en el repositorio: Codex guarda la confianza de cada hook por la ruta absoluta de su archivo, y un hook dentro del repositorio habría que aprobarlo con `/hooks` en cada worktree, una vez por cambio. Así la persona confía en él una sola vez por máquina, y fuera de los repositorios con Specty el guard no hace nada. Sustituye al cambio cancelado `20261023-guard-para-codex`, que lo instalaba en el repositorio.

## Fuera de alcance

- OpenCode: va en su propio cambio.
- Saber si la persona ya confió en el hook: Codex lo guarda en su propia configuración; `init` y `doctor` explican cómo hacerlo.
- Un `.codex/hooks.json` dentro del repositorio.
- El `apply_patch` que versiones antiguas de Codex mandaban dentro de un comando de Bash: no se analiza antes, pero la revisión tras el comando ve lo que escribió.

## Supuestos

- A1: Codex (0.123 o posterior) manda a `PreToolUse` el `tool_name` `Bash` con el comando en `tool_input.command`, y `apply_patch` con el texto del parche en `tool_input.command`; bloquea con la salida 2 y el motivo en stderr, y `PostToolUse` de `Bash` llega también tras un comando que falla, con el mismo `tool_use_id`, según su documentación de hooks y sus tests.
  - impacto: alto
- A2: Codex lee los hooks de usuario de `hooks.json` en `$CODEX_HOME` (por defecto `~/.codex`), con la forma `{"hooks": {"PreToolUse": [{"matcher": "...", "hooks": [{"type": "command", "command": "..."}]}]}}`; el `matcher` es una expresión regular sobre `tool_name`, y la persona confía en cada hook una vez con `/hooks`, una confianza que Codex guarda por la ruta del archivo y que por eso vale para todas las worktrees.
  - impacto: alto
- A3: Escribir en la configuración de usuario de Codex es aceptable porque el guard no bloquea nada fuera de un repositorio con Specty; `init` dice en qué archivo lo escribió y que vale para todos los repositorios en los que la persona use Codex.
- A4: En un parche, `*** Add File:` y `*** Update File:` escriben su ruta, `*** Delete File:` la borra y `*** Move to:` escribe la ruta nueva y borra la anterior; el guard juzga cada ruta con las reglas de escribir o de borrar, igual que en un comando de shell.
- A5: `doctor` revisa el guard de Codex cuando el repositorio tiene `.codex/` o cuando el archivo de usuario ya lo tiene.

## Criterios de aceptación

- AC1: CUANDO se ejecuta `specty init --tools codex`, o el repositorio tiene `.codex/`, ENTONCES el `hooks.json` de usuario de Codex tiene el guard en `PreToolUse` (`Bash` y `apply_patch`) y en `PostToolUse` (`Bash`), conserva los hooks que ya tenía, el repositorio no recibe ningún archivo de Codex, y la salida dice dónde se instaló y que hay que confiar en él una vez con `/hooks`.
- AC2: CUANDO Codex aplica un parche que añade, cambia, mueve o borra un archivo que las reglas no permiten (fuera del alcance de la tarea, sin un cambio activo, la spec bloqueada o un archivo de Specty) ENTONCES el guard lo bloquea con la salida 2, y el motivo y el SIGUIENTE en stderr; dentro del alcance lo deja pasar.
- AC3: CUANDO Codex ejecuta un comando de Bash ENTONCES el guard aplica las mismas reglas que en Claude Code antes del comando y, tras él, avisa de lo que cambió fuera de la tarea.
- AC4: CUANDO el repositorio usa Codex ENTONCES `doctor` comprueba que el guard está en el `hooks.json` de usuario de Codex y, si falta, dice cómo instalarlo.

## Diseño

- `core/guard/patch.ts`: `patchPaths(text)` lee las cabeceras del parche y devuelve las rutas que escribe y las que borra.
- `core/guard/decide.ts`: una acción `files`, con escrituras, borrados y rutas de otras worktrees, que se juzga como las escrituras y los borrados de un comando de shell (comparten la función).
- `cli/enforce/actions.ts`: los lectores de eventos de cada herramienta salen de `guard.ts`, que se acerca al límite de 300 líneas, y se suma el de Codex. `guard.ts` responde a Codex como a Claude Code (salida 2 y stderr) y le aplica la foto antes y después de cada comando de Bash.
- `cli/install/agents.ts`: `codexHooksFile(env)` da la ruta (`$CODEX_HOME/hooks.json` o `~/.codex/hooks.json`), e `installCodex` la escribe clave a clave, conservando lo que había.
- `init` y `doctor`: Codex pasa a tener hooks. Los tests apuntan `CODEX_HOME` a una carpeta temporal, para no tocar nunca la configuración real.

## Archivos

- crear packages/core/src/guard/patch.ts — rutas que escribe y borra un parche
- crear packages/core/test/guard/patch.test.ts — tests del parche
- modificar packages/core/src/guard/decide.ts — acción `files`
- modificar packages/core/test/guard/decide.test.ts — tests de la acción `files`
- modificar packages/core/src/index.ts — exportar `patchPaths`
- crear packages/cli/src/enforce/actions.ts — lectores de eventos por herramienta, con Codex
- modificar packages/cli/src/enforce/guard.ts — Codex como herramienta del guard
- modificar packages/cli/src/program.ts — `guard --tool codex`
- modificar packages/cli/src/install/agents.ts — `codexHooksFile` e `installCodex`
- modificar packages/cli/src/commands/init.ts — instalar el guard de Codex
- modificar packages/cli/src/commands/doctor.ts — comprobar el guard de Codex
- modificar packages/cli/test/support.ts — `CODEX_HOME` temporal en los tests
- crear packages/cli/test/codex.test.ts — guard, `init` y `doctor` con Codex
- modificar docs/ARCHITECTURE.md — Codex en la tabla de hooks por herramienta

## Tareas

- [x] T1: El core juzga las rutas de un parche
  - files: packages/core/src/guard/patch.ts, packages/core/test/guard/patch.test.ts, packages/core/src/guard/decide.ts, packages/core/test/guard/decide.test.ts, packages/core/src/index.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/guard
- [x] T2: El guard atiende a Codex
  - files: packages/cli/src/enforce/actions.ts, packages/cli/src/enforce/guard.ts, packages/cli/src/program.ts, packages/cli/test/codex.test.ts
  - ac: AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/codex.test.ts test/enforce.test.ts
- [x] T3: `init` instala el guard en la configuración de usuario de Codex y `doctor` lo comprueba
  - files: packages/cli/src/install/agents.ts, packages/cli/src/commands/init.ts, packages/cli/src/commands/doctor.ts, packages/cli/test/support.ts, packages/cli/test/codex.test.ts
  - ac: AC1, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/codex.test.ts test/install.test.ts test/setup.test.ts
- [x] T4: Documentar el guard de Codex
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm check
  - type: docs

## Riesgos

- R1: Codex cambia la forma de sus eventos (ya lo hizo con `apply_patch`) — el guard falla abierto ante un evento que no entiende, y los hooks de git, `task done` y el CI siguen aplicando.
- R2: La persona no confía en el hook y Codex no lo ejecuta — `init` y `doctor` lo explican, y lo demás sigue protegiendo como hoy.
- R3: El agente puede editar `~/.codex/hooks.json`, que queda fuera del repositorio y del guard — Codex no ejecuta un hook modificado hasta que la persona vuelve a confiar en él, y el modelo de confianza de Specty ya asume que un agente decidido a evadirlo puede hacerlo en local.

## Cierre

### Resumen

Codex tiene el guard de Specty. `init` (con `--tools codex`, o cuando el repositorio tiene `.codex/`) lo escribe en el `hooks.json` de usuario de Codex, en `PreToolUse` para `Bash` y `apply_patch` y en `PostToolUse` para `Bash`, conserva los demás hooks y explica que hay que confiar en él una vez con `/hooks`; `doctor` lo comprueba. El guard lee los parches de `apply_patch` (añadir, cambiar, mover y borrar) y los juzga con las mismas reglas que las escrituras y los borrados de un comando, juzga los comandos de Bash antes de ejecutarse y, tras ellos, avisa de lo que cambiaron fuera de la tarea.

### Desviaciones

Ninguna respecto a esta spec. Sustituye al cambio cancelado `20261023-guard-para-codex`, cuyo diseño ponía el hook en `.codex/hooks.json` del repositorio: al implementarlo se vio en el código de Codex que la confianza de cada hook se guarda por la ruta absoluta de su archivo, así que habría que aprobarlo de nuevo en cada worktree. Las tareas T1 y T2 se rehicieron igual; la única diferencia es que `.codex/hooks.json` ya no entra en los archivos protegidos, porque Specty no lo escribe.

### Decisiones

- El hook de usuario vale para todos los repositorios de la persona; fuera de los que usan Specty, el guard abre la sesión, no encuentra `.specty/config.yaml` y deja pasar. Se aceptó el coste de arrancar el guard en cada herramienta antes que pedir confianza en cada worktree.
- La forma de los eventos se comprobó en la documentación oficial de hooks y en los tests de Codex (`codex-rs/core/tests/suite/hooks.rs`): `Bash` lleva el script tal cual y `apply_patch` el parche, ambos en `tool_input.command`.
- Los lectores de eventos de cada herramienta viven en `enforce/actions.ts`, y `guard.ts` se queda con el flujo; `withHooks` instala el guard tanto en Claude Code como en Codex, que usan la misma forma de `hooks`.
- Los tests apuntan `CODEX_HOME` a una carpeta temporal en `testEnv`, para que ningún `init` toque la configuración real.

### Pendientes

- Guard para OpenCode, en su propio cambio.
- `cancel` sugiere «fusiona la rama» también cuando el cambio cancelado tiene commits de código; fusionarla traería código a medias.
