---
kind: standard
---

# Guard de OpenCode

## Objetivo

`specty init` instala el guard de Specty en OpenCode: antes de cada comando y de cada edición (`edit`, `write`, el parche y, en OpenCode 1, `multiedit`), un plugin de Specty pregunta a `specty guard --tool opencode`, que aplica las mismas reglas que en Claude Code, Cursor y Codex, y si el guard dice que no, el plugin rechaza la herramienta con el motivo y el siguiente paso. Como en Codex, el plugin va en la configuración global de OpenCode (`~/.config/opencode/plugins/specty.js`) y no en el repositorio: así sirve en todas las worktrees sin copiarlo, no deja código que los formateadores y linters del proyecto revisen, y fuera de los repositorios con Specty no arranca el guard.

## Fuera de alcance

- La revisión tras cada comando: OpenCode no deja avisar al modelo tras una herramienta de forma estable entre sus versiones 1 y 2; `task done` sigue siendo la puerta.
- Las herramientas de MCP y de otros plugins.
- Un plugin dentro del repositorio.

## Supuestos

- A1: OpenCode 2 carga los archivos `.js` de `plugins/` en su carpeta global (`$XDG_CONFIG_HOME/opencode`, por defecto `~/.config/opencode`) y acepta un objeto por defecto con `id` y `setup(ctx)`; `ctx.location.directory` es la carpeta del proyecto, y una función registrada con `ctx.tool.hook("execute.before", …)` recibe `{tool, sessionID, id, input}` y rechaza la herramienta si lanza un error, según su código y su paquete `@opencode/plugin` 2.1.4.
  - impacto: alto
- A2: OpenCode 1 (desde 1.18.29) acepta en el mismo objeto un método `server(input)`, con `input.directory`, que devuelve los hooks; `"tool.execute.before"` recibe `(input, output)` con `input.tool`, `input.sessionID`, `input.callID` y `output.args`, y también rechaza la herramienta si lanza un error.
  - impacto: alto
- A3: Las herramientas y sus argumentos son `shell` (o `bash` en OpenCode 1) con `command` y `workdir` opcional, `edit` y `write` con `path` (o `filePath`), `multiedit` con `filePath`, y `patch` (o `apply_patch`) con `patchText` en el mismo formato de parche que Codex.
  - impacto: alto
- A4: El plugin solo arranca el guard cuando alguna carpeta desde la del proyecto hacia arriba tiene `.specty/config.yaml`; si el guard no se puede ejecutar o falla, deja pasar la herramienta, como el guard en las demás herramientas.
- A5: Los comandos que lanza OpenCode llevan `OPENCODE=1` en el entorno, y con eso Specty sabe que el agente es OpenCode (trailer `Specty-Agent: opencode`).

## Criterios de aceptación

- AC1: CUANDO se ejecuta `specty init --tools opencode`, o el repositorio tiene `.opencode/`, `opencode.json` u `opencode.jsonc`, ENTONCES `plugins/specty.js` queda en la configuración global de OpenCode con el comando del guard, el repositorio no recibe ningún archivo de OpenCode, y la salida dice dónde se instaló.
- AC2: CUANDO OpenCode, versión 1 o 2, va a ejecutar un comando o una edición que las reglas no permiten ENTONCES el plugin la rechaza con un error que lleva el motivo y el SIGUIENTE del guard; si las reglas la permiten, o la carpeta no usa Specty, la deja pasar.
- AC3: CUANDO el guard recibe un evento de OpenCode ENTONCES juzga los comandos con el análisis de shell (en su `workdir`, si lo hay), las ediciones como escrituras y los parches como sus escrituras y borrados.
- AC4: CUANDO el repositorio usa OpenCode ENTONCES `doctor` comprueba que el plugin está instalado y, si falta, dice cómo instalarlo.

## Diseño

- `install/opencode.ts`: la ruta del plugin y su texto, un módulo JavaScript sin dependencias que exporta `{ id, setup, server }`, con el comando de Specty incrustado. Ante cada herramienta busca `.specty/config.yaml` hacia arriba y, si lo encuentra, lanza el guard sin bloquear el proceso de OpenCode, le pasa el evento por stdin y lanza un error con el stderr cuando la salida es 2.
- `enforce/actions.ts`: OpenCode como herramienta del guard, con sus nombres de las versiones 1 y 2. `guard.ts` toma el `workdir` de un comando como su carpeta.
- `core/agents.ts`: OpenCode entra en las herramientas conocidas y se detecta con `OPENCODE=1`; `detect/project.ts` lo reconoce por sus archivos.
- Los tests apuntan `XDG_CONFIG_HOME` a una carpeta temporal y cargan el plugin escrito por `init` con las formas de OpenCode 1 y 2.

## Archivos

- modificar packages/core/src/agents.ts — OpenCode en las herramientas y su detección
- modificar packages/core/test/cards.test.ts — detectar OpenCode
- modificar packages/cli/src/detect/project.ts — reconocer OpenCode en el repositorio
- modificar packages/cli/src/enforce/actions.ts — eventos de OpenCode
- modificar packages/cli/src/enforce/guard.ts — `workdir` de los comandos
- crear packages/cli/src/install/opencode.ts — el plugin y su instalación
- modificar packages/cli/src/commands/init.ts — instalar el plugin
- modificar packages/cli/src/commands/doctor.ts — comprobar el plugin
- modificar packages/cli/test/support.ts — `XDG_CONFIG_HOME` temporal y sin `OPENCODE` heredado
- crear packages/cli/test/opencode.test.ts — guard, plugin, `init` y `doctor` con OpenCode
- modificar docs/ARCHITECTURE.md — OpenCode en la tabla de hooks por herramienta

## Tareas

- [x] T1: El guard atiende a OpenCode
  - files: packages/core/src/agents.ts, packages/core/test/cards.test.ts, packages/cli/src/enforce/actions.ts, packages/cli/src/enforce/guard.ts, packages/cli/test/support.ts, packages/cli/test/opencode.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/opencode.test.ts test/enforce.test.ts
- [ ] T2: `init` instala el plugin de OpenCode y `doctor` lo comprueba
  - files: packages/cli/src/install/opencode.ts, packages/cli/src/detect/project.ts, packages/cli/src/commands/init.ts, packages/cli/src/commands/doctor.ts, packages/cli/test/opencode.test.ts
  - ac: AC1, AC2, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/opencode.test.ts test/install.test.ts test/setup.test.ts
- [ ] T3: Documentar el guard de OpenCode
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm check
  - type: docs

## Riesgos

- R1: OpenCode cambia otra vez su API de plugins (ya pasó de la 1 a la 2) — el plugin falla abierto, `doctor` comprueba que está, y los hooks de git, `task done` y el CI siguen aplicando.
- R2: No hay OpenCode en esta máquina para probarlo de punta a punta — los tests cargan el plugin real con las formas de OpenCode 1 y 2 tomadas de su código y ejecutan el guard de verdad.
