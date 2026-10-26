---
kind: standard
---

# Guards de Codex y OpenCode en el proyecto

## Objetivo

Specty deja de escribir en la carpeta del usuario. El guard de Codex pasa a `.codex/hooks.json` y el plugin de OpenCode a `.opencode/plugins/specty.js`, dentro del proyecto, como ya están los de Claude Code y Cursor; `specty check --install` pone el hook de fin de turno de Codex en ese mismo archivo. Codex, desde la 0.131, lee los hooks de una worktree en la carpeta principal del repositorio, así que la persona confía en ellos una vez por repositorio y no una vez por cambio; OpenCode carga los plugins de `.opencode/plugins/` del proyecto.

## Fuera de alcance

- Las worktrees junto al proyecto (`<carpeta>.worktrees/`) y las carpetas temporales de `specty check` en `$TMPDIR`: no están en la carpeta del usuario, y la persona aún no ha decidido sobre ellas.
- Migrar un guard que una versión anterior dejara en `~/.codex/hooks.json` o en `~/.config/opencode/plugins/`: Specty no está publicado en npm y en esta máquina no hay ninguno; `uninstall` sigue nombrando el que encuentre ahí, como hasta ahora.
- Saber si la persona ya confió en el proyecto o en el hook en Codex: Codex lo guarda en su propia configuración.
- Lo que escriben las herramientas que Specty ejecuta (el gestor de paquetes al preparar una worktree, la caché de `npx`, el modelo de `review.command`) y lo que OpenCode 1 escribe en `.opencode/`.
- Gemini CLI, Antigravity y el resto de herramientas sin guard.

## Supuestos

- A1: Codex 0.131 o posterior (PR #21969, «Use root repo hooks in linked worktrees») carga los hooks de proyecto de una worktree enlazada desde el `.codex/` de la carpeta principal del repositorio, siempre que la worktree tenga su propia carpeta `.codex/`; como la clave de confianza es la ruta de ese `hooks.json`, la persona revisa el hook con `/hooks` una vez por repositorio y otra vez solo si su contenido cambia; con un Codex anterior, cada worktree pide su revisión. Está verificado en el código de Codex (main del 2026-10-23, `root_checkout_hooks_folder_for_dir` en `codex-rs/config/src/loader/mod.rs`), no con Codex en marcha.
  - impacto: alto
- A2: Codex lee el `hooks.json` del proyecto con la misma forma que el de usuario (`{"hooks": {"PreToolUse": [{"matcher": "…", "hooks": [{"type": "command", "command": "…"}]}]}}`), y solo carga la configuración del proyecto cuando la persona confía en él; para una worktree, esa confianza se busca en el repositorio principal (`resolve_root_git_project_for_trust`).
  - impacto: alto
- A3: OpenCode 2 (2.1.4) y OpenCode 1 (1.18.29 o posterior) cargan sin pedir confianza los `.js` de `.opencode/plugins/` del proyecto, igual que los de su carpeta global (OpenCode 2: `PluginSourceDirectory`, con `plugin` y `plugins`; OpenCode 1: `ConfigPlugin.load` en cada carpeta `.opencode`); OpenCode 1 además escribe en `.opencode/` un `.gitignore` que se ignora a sí mismo y a sus dependencias, así que git no ve nada nuevo.
  - impacto: alto
- A4: Como los demás hooks del agente, los dos archivos se versionan cuando el comando de Specty está en el PATH y entran en el commit de `init`; si el comando lleva una ruta de la máquina, quedan fuera de git con `.git/info/exclude`, y `specty new` los copia a cada worktree igual que `.claude/settings.local.json`, de modo que en Codex la worktree tiene su `.codex/` (A1).
- A5: Specty sigue leyendo la carpeta del usuario donde ya lo hacía, para la guía de gentle-ai y para lo que `uninstall` dice que queda; leer no escribe nada.

## Criterios de aceptación

- AC1: CUANDO se ejecuta `specty init --tools codex`, o el repositorio tiene `.codex/`, ENTONCES `.codex/hooks.json` del proyecto tiene el guard en `PreToolUse` (`Bash` y `apply_patch`) y en `PostToolUse` (`Bash`) y conserva los hooks que ya tenía, y la salida dice dónde está y que hay que confiar en el proyecto y revisar el hook con `/hooks` una vez por repositorio.
- AC2: CUANDO se ejecuta `specty init --tools opencode`, o el repositorio tiene `.opencode/`, `opencode.json` u `opencode.jsonc`, ENTONCES el plugin queda en `.opencode/plugins/specty.js` del proyecto, con el comando del guard.
- AC3: CUANDO el comando de Specty está en el PATH ENTONCES los dos archivos entran en el commit de `init`; CUANDO lleva una ruta de la máquina ENTONCES quedan excluidos en local y `specty new` los copia a la worktree del cambio.
- AC4: CUANDO `specty check --install` añade el hook de fin de turno de Codex ENTONCES lo escribe en `.codex/hooks.json` del proyecto, junto al guard.
- AC5: CUANDO un agente intenta escribir o borrar `.codex/hooks.json` o `.opencode/plugins/specty.js` ENTONCES el guard lo bloquea como archivo de Specty.
- AC6: CUANDO el repositorio usa Codex u OpenCode ENTONCES `doctor` busca el guard en el proyecto y, si falta, dice cómo instalarlo.
- AC7: CUANDO se ejecuta `specty uninstall` ENTONCES quita el guard de Codex de `.codex/hooks.json`, conservando los demás hooks, y el plugin de OpenCode.
- AC8: CUANDO `doctor` busca formateadores que revisarían lo que Specty escribe ENTONCES incluye `.codex/hooks.json` y `.opencode/plugins/specty.js` cuando existen.
- AC9: CUANDO se ejecutan `init`, `check --install`, `doctor` o `uninstall` ENTONCES no escriben nada en la carpeta de `$CODEX_HOME` ni en la de `$XDG_CONFIG_HOME`.

## Diseño

- `core/capabilities.ts`: Codex y OpenCode pasan a `guard: "repository"`. `GuardSurface` pierde `"user"`, que ya no usa nadie, y la tabla de ARCHITECTURE §10, que se genera de ella, cambia con su test.
- `core/guard/decide.ts`: `.codex/hooks.json` y `.opencode/plugins/specty.js` entran en `PROTECTED`.
- `core/cards/install.ts`: `codexGuardLine` y `opencodeGuardLine` reciben `(file, local)`, como `guardLine`; la de Codex añade que desde Codex 0.131 sirve a todas las worktrees del repositorio. `codexTrustWarning` pide confiar en el proyecto y revisar el hook con `/hooks`, una vez por repositorio.
- `cli/install/agents.ts`: `installCodex(root, git, invocation, files)` escribe `.codex/hooks.json` como `installCursor` escribe `.cursor/hooks.json` (local si el comando no es portable), y `excludeLocally` se exporta para OpenCode. `AGENT_HOOK_FILES` suma los dos archivos, y `removeAgentHooks` los quita. `codexHooksFile(env)` queda solo para leer el archivo de usuario.
- `cli/install/opencode.ts`: `installOpencode(root, git, invocation, files)` escribe `.opencode/plugins/specty.js`; `opencodePluginFile(env)` queda solo para leer el plugin global.
- `cli/install/hooks.ts`: los dos archivos entran en el commit de `init` cuando no son locales.
- `cli/check/install-agents.ts`: el hook de fin de turno de Codex va a `.codex/hooks.json` del proyecto.
- `cli/commands/doctor.ts`: busca el guard de Codex y el plugin en el proyecto, ya no en la carpeta del usuario.
- `cli/detect/formatters.ts`: dos entradas más en `WRITTEN`.
- Documentación: la ADR 0013 recoge la decisión y su alcance; ARCHITECTURE §10 cambia las filas de Codex y OpenCode en la tarea de cada uno.
- Tests: `support.ts` ya apunta `CODEX_HOME` y `XDG_CONFIG_HOME` a carpetas temporales; los tests de Codex, OpenCode y `check --install` comprueban que quedan vacías.

## Archivos

- modificar packages/core/src/capabilities.ts — Codex y OpenCode con el guard en el repositorio
- modificar packages/core/src/guard/decide.ts — proteger los dos archivos
- modificar packages/core/src/cards/install.ts — líneas de `init` para Codex y OpenCode en el proyecto
- modificar packages/cli/src/install/agents.ts — guard de Codex en el proyecto, archivos que se copian y que se quitan
- modificar packages/cli/src/install/opencode.ts — plugin en el proyecto
- modificar packages/cli/src/install/hooks.ts — los dos archivos en el commit de `init`
- modificar packages/cli/src/check/install-agents.ts — hook de fin de turno de Codex en el proyecto
- modificar packages/cli/src/commands/doctor.ts — buscar los guards en el proyecto
- modificar packages/cli/src/detect/formatters.ts — exclusiones de los dos archivos
- modificar packages/cli/test/codex.test.ts — instalación de Codex en el proyecto, y `doctor` con su archivo
- modificar packages/cli/test/opencode.test.ts — instalación de OpenCode en el proyecto, y `doctor` con su archivo
- modificar packages/cli/test/check-agent-stop.test.ts — hook de fin de turno de Codex en el proyecto
- modificar packages/cli/test/uninstall.test.ts — `uninstall` con Codex y OpenCode
- modificar docs/ARCHITECTURE.md — §10: dónde van los guards de Codex y OpenCode, y la tabla de capacidades
- crear docs/decisions/0013-specty-no-escribe-en-la-carpeta-del-usuario.md — la decisión y su alcance

## Tareas

- [x] T1: El core da a Codex y OpenCode el guard en el repositorio y protege sus archivos
  - files: packages/core/src/capabilities.ts, packages/core/src/guard/decide.ts, docs/ARCHITECTURE.md, docs/decisions/0013-specty-no-escribe-en-la-carpeta-del-usuario.md
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/capabilities.test.ts test/guard/decide.test.ts
- [x] T2: `init` pone el guard de Codex en `.codex/hooks.json` y `doctor` lo busca ahí
  - files: packages/cli/src/install/agents.ts, packages/cli/src/install/hooks.ts, packages/cli/src/commands/doctor.ts, packages/cli/src/detect/formatters.ts, packages/core/src/cards/install.ts, packages/cli/test/codex.test.ts
  - ac: AC1, AC3, AC6, AC8, AC9
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/codex.test.ts test/worktrees.test.ts && pnpm --filter @baquia-dev/specty-core exec vitest run test/cards
- [ ] T3: `init` pone el plugin de OpenCode en `.opencode/plugins/specty.js` y `doctor` lo busca ahí
  - files: packages/cli/src/install/opencode.ts, packages/cli/src/install/hooks.ts, packages/cli/src/commands/doctor.ts, packages/cli/src/detect/formatters.ts, packages/core/src/cards/install.ts, packages/cli/test/opencode.test.ts
  - ac: AC2, AC3, AC6, AC8, AC9
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/opencode.test.ts test/init-reversible.test.ts && pnpm --filter @baquia-dev/specty-core exec vitest run test/cards
- [ ] T4: `check --install` y `uninstall` usan los archivos del proyecto
  - files: packages/cli/src/check/install-agents.ts, packages/cli/src/install/agents.ts, packages/cli/test/check-agent-stop.test.ts, packages/cli/test/uninstall.test.ts
  - ac: AC4, AC7, AC9
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-agent-stop.test.ts test/uninstall.test.ts

## Riesgos

- R1: Con un Codex anterior a la 0.131, cada worktree pide revisar el hook con `/hooks` — la salida de `init` y ARCHITECTURE §10 nombran la versión.
- R2: Codex no carga `.codex/` en un proyecto en el que la persona no confía, y entonces el guard no corre sin avisar — la salida de `init` pide confiar en el proyecto; los hooks de git siguen protegiendo los commits.
- R3: Los formateadores y linters del proyecto revisarán `.codex/hooks.json` y el JavaScript del plugin — `doctor` dice qué exclusión añadir (AC8).
- R4: Si el proyecto ya versiona `.codex/hooks.json` y el comando de Specty no está en el PATH, el archivo versionado recibe una ruta de la máquina, como ya pasa con `.cursor/hooks.json` — `init` ya avisa de que `specty` no está en el PATH.
- R5: A1 y A3 se verificaron leyendo el código de Codex y de OpenCode, no con las herramientas en marcha — los tests simulan sus eventos, y se le pide al usuario que lo pruebe con sus versiones.
