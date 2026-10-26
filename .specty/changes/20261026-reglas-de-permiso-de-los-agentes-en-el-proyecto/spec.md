---
kind: standard
---

# Reglas de permiso de los agentes en el proyecto

## Objetivo

`specty init` escribe en el proyecto las reglas de permiso que dejan al agente ejecutar los comandos de Specty sin que la herramienta añada su propio veto, para que decida Specty. En Claude Code, `.claude/settings.json` permite los comandos de la persona (`approve`, `accept`, `close`, `cancel`, `reject`): en modo auto, el clasificador bloqueaba el `specty approve` del agente aunque el modo delegado estuviera activo. En Codex, `.codex/rules/specty.rules` deja que los comandos de Specty se ejecuten sin preguntar y fuera del sandbox, que deja `.git` en solo lectura y por eso frenaba cada commit de `task done`, `approve`, `accept` o `close`. Specty sigue decidiendo: sin modo delegado, el guard bloquea al agente los comandos de la persona y la CLI pide una terminal real.

## Fuera de alcance

- OpenCode: no tiene sandbox ni clasificador, y sus permisos son las reglas de la persona en `opencode.json`, que Specty no toca.
- La forma `npx -y @baquia-dev/specty …` que AGENTS.md ofrece cuando `specty` no está en el PATH: las reglas cubren `specty`, el comando que el agente escribe normalmente.
- El hueco de Codex con `write_stdin`: el guard ve `exec_command` como `Bash`, pero no lo que el modelo escribe después en una pseudo-terminal abierta con `tty: true`, así que podría contestar el prompt de un comando de la persona. Va en su propio cambio.
- Cursor y el resto de herramientas: sus permisos viven en la configuración del usuario o no existen.
- `delegate` y `uninstall`: no reciben ninguna regla; solo los ejecuta la persona.

## Supuestos

- A1: En Claude Code, una acción que casa con una regla `allow` se resuelve sin el clasificador del modo auto, y el modo auto conserva las reglas estrechas como `Bash(specty approve *)` (solo descarta las genéricas, las de intérpretes, las de ejecución de gestores de paquetes y las de `Agent` y `Monitor`); un `*` final precedido de espacio casa también con el comando sin argumentos; en un comando compuesto cada parte tiene que casar, y un `cd` dentro de las carpetas de trabajo es de solo lectura. Según la documentación de permisos y de modos de permiso de Claude Code, consultada el 2026-10-26.
  - impacto: alto
- A2: Codex carga los `*.rules` de `.codex/rules/` de la capa del proyecto cuando la persona confía en él; `prefix_rule(pattern = ["specty"], decision = "allow")` evita la aprobación y ejecuta el comando fuera del sandbox cuando cada parte del comando casa con una regla `allow` (`codex-rs/core/src/exec_policy.rs`); en `workspace-write`, `.codex/` es de solo lectura para el agente, que no puede editar la regla. Verificado en el código de Codex (main del 2026-10-23), no con Codex en marcha.
  - impacto: alto
- A3: Las reglas no debilitan Specty: sin modo delegado, el guard bloquea al agente los comandos de la persona y la CLI pide una terminal real; con él, la persona ya le delegó esas decisiones (ADR 0010).
- A4: Las reglas nombran `specty` como lo escribe el agente y no llevan rutas de la máquina. Las de Claude Code van en el mismo archivo que su guard (`.claude/settings.json`, o `settings.local.json` si el comando del guard es local), y `.codex/rules/specty.rules` se versiona siempre y entra en el commit de `init`.

## Criterios de aceptación

- AC1: CUANDO `specty init` instala el guard de Claude Code ENTONCES su archivo de ajustes permite `Bash(specty approve *)`, `Bash(specty accept *)`, `Bash(specty close *)`, `Bash(specty cancel *)` y `Bash(specty reject *)`, además de `EnterWorktree` y `ExitWorktree`; conserva los permisos de la persona, no permite `delegate` ni `uninstall`, y la salida lo dice.
- AC2: CUANDO `specty init` instala el guard de Codex ENTONCES escribe `.codex/rules/specty.rules` con `prefix_rule(pattern = ["specty"], decision = "allow")`, que entra en el commit de `init` aunque los hooks sean locales, y la salida lo dice.
- AC3: CUANDO el agente ejecuta `specty approve` sin modo delegado ENTONCES el guard lo sigue bloqueando.
- AC4: CUANDO un agente intenta escribir o borrar `.codex/rules/specty.rules` ENTONCES el guard lo bloquea como archivo de Specty.
- AC5: CUANDO faltan los permisos de Claude Code o la regla de Codex ENTONCES `doctor` lo dice y pide ejecutar `specty init`.
- AC6: CUANDO se ejecuta `specty uninstall` ENTONCES quita los permisos de Claude Code, conservando los de la persona, y borra `.codex/rules/specty.rules`.

## Diseño

- `cli/install/agents.ts`: los permisos de Claude Code salen de `HUMAN_COMMANDS` del core (`Bash(specty <comando> *)`), junto a `EnterWorktree` y `ExitWorktree`, así que `withClaudePermissions` los añade y `withoutClaudePermissions` los quita sin más cambios. `installCodex` escribe además `.codex/rules/specty.rules`, con un comentario que dice por qué existe; `removeAgentHooks` la borra si es la de Specty.
- `cli/install/hooks.ts`: `init` dice dónde quedaron los permisos y la regla, y pone la regla en su commit.
- `cli/commands/doctor.ts`: comprueba los permisos en los dos archivos de ajustes de Claude Code y la regla de Codex.
- `core/guard/decide.ts`: `.codex/rules/specty.rules` entra en `PROTECTED`.
- `core/cards`: las líneas de `init` y los casos de `doctor`, en español y en inglés.
- ARCHITECTURE §10: un párrafo sobre los permisos de cada herramienta y las filas de Claude Code y Codex.

## Archivos

- modificar packages/core/src/guard/decide.ts — proteger la regla de Codex
- modificar packages/core/src/cards/install.ts — líneas de `init` para los permisos y la regla
- modificar packages/core/src/cards/doctor.ts — casos de `doctor` para los permisos y la regla
- modificar packages/cli/src/install/agents.ts — permisos de Claude Code, regla de Codex y su retirada
- modificar packages/cli/src/install/hooks.ts — salida y commit de `init`
- modificar packages/cli/src/commands/doctor.ts — comprobar los permisos y la regla
- modificar packages/cli/test/setup.test.ts — permisos de Claude Code
- modificar packages/cli/test/codex.test.ts — regla de Codex
- modificar packages/cli/test/uninstall.test.ts — `uninstall` quita los permisos y la regla
- modificar docs/ARCHITECTURE.md — §10: permisos de cada herramienta

## Tareas

- [x] T1: El core protege la regla de Codex y tiene los textos de los permisos
  - files: packages/core/src/guard/decide.ts, packages/core/src/cards/install.ts, packages/core/src/cards/doctor.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/guard/decide.test.ts test/cards
- [x] T2: `init` da a Claude Code los permisos de los comandos de la persona y `doctor` los comprueba
  - files: packages/cli/src/install/agents.ts, packages/cli/src/install/hooks.ts, packages/cli/src/commands/doctor.ts, packages/cli/test/setup.test.ts
  - ac: AC1, AC3, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/setup.test.ts
- [x] T3: `init` escribe la regla de Codex y `doctor` la comprueba
  - files: packages/cli/src/install/agents.ts, packages/cli/src/install/hooks.ts, packages/cli/src/commands/doctor.ts, packages/cli/test/codex.test.ts
  - ac: AC2, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/codex.test.ts
- [ ] T4: `uninstall` quita los permisos y la regla, y ARCHITECTURE lo documenta
  - files: packages/cli/src/install/agents.ts, packages/cli/test/uninstall.test.ts, docs/ARCHITECTURE.md
  - ac: AC6
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/uninstall.test.ts

## Riesgos

- R1: Una regla `allow` de Claude Code deja pasar `specty approve` sin el clasificador también cuando el modo delegado está apagado — el guard y la terminal real de Specty lo siguen bloqueando (AC3).
- R2: La regla de Codex ejecuta fuera del sandbox cualquier comando de Specty, también `specty ui` o `check --install` — son comandos de Specty, que ya deciden quién los ejecuta; los que escriben en el proyecto ya pasan por el guard.
- R3: Si la persona no confía en el proyecto en Codex, la regla no se carga y cada commit de Specty vuelve a pedir permiso — la salida de `init` ya pide confiar en el proyecto.
- R4: A1 y A2 se verificaron en la documentación de Claude Code y en el código de Codex, no con las herramientas en marcha — se le pide al usuario que lo pruebe tras volver a ejecutar `specty init`.
