---
kind: standard
---

# specty uninstall

## Objetivo

Segunda mitad del punto «init reversible y `specty uninstall`»: hoy no hay forma de quitar Specty de un repositorio salvo a mano, archivo por archivo. `specty uninstall`, que solo ejecuta la persona en su terminal, quita lo que `init` instaló en el repositorio: sus bloques de AGENTS.md, sus hooks y permisos en los ajustes de Claude Code y de Cursor, y sus bloques en los hooks de git. Deja el resto de cada archivo como estaba. Antes enseña la lista y pregunta, guarda una copia de cada archivo que cambia (como `init`) y no hace commit. Con `--dry-run` solo lista lo que quitaría.

## Fuera de alcance

- Borrar `.specty/` (el historial de specs y auditoría) o el `@AGENTS.md` de CLAUDE.md, que sigue apuntando a un AGENTS.md que existe.
- Quitar el guard de la configuración global de Codex y OpenCode, que sirve a todos los repositorios: `uninstall` dice dónde está.
- Las líneas que `init` añadió a `.git/info/exclude`: siguen sirviendo para los archivos locales que queden.
- Restaurar una copia.

## Supuestos

- A1: `uninstall` es un comando de la persona que ni el modo delegado abre, como `delegate`, porque quita la protección del repositorio: necesita una terminal real y una confirmación cuya opción por defecto es «No», y el guard se lo bloquea siempre al agente.
  - impacto: alto
- A2: `uninstall` no hace commit: deja los cambios para que la persona los revise, y sin los hooks de git su commit ya no necesita recibo.
  - impacto: alto
- A3: Reconoce lo suyo por las marcas que pone `init`: los bloques `specty:begin`/`specty:end` de AGENTS.md, el bloque `# >>> specty >>>` de los hooks de git, el comando `specty` de lefthook, las entradas de hook con `guard --tool <id>` y los permisos `EnterWorktree` y `ExitWorktree` de Claude Code. Un archivo que se queda sin nada más (solo `#!/bin/sh`, `{}` o `{"version": 1}`) se borra.
- A4: Si la carpeta tiene un cambio en curso, `uninstall` lo avisa pero sigue: lo decide la persona.
- A5: Las copias van a la misma carpeta que las de `init` (`common/specty/backups/<fecha>/`), y el `manifest.json` anota los archivos borrados.

## Criterios de aceptación

- AC1: CUANDO la persona ejecuta `specty uninstall` en su terminal y lo confirma ENTONCES se quitan los bloques de Specty de AGENTS.md, sus entradas y permisos en `.claude/settings.json`, `.claude/settings.local.json` y `.cursor/hooks.json`, y sus bloques en los hooks de git (nativos, husky o lefthook), y el resto de cada archivo queda como estaba.
- AC2: CUANDO un archivo se queda solo con lo de Specty ENTONCES `uninstall` lo borra.
- AC3: CUANDO la persona responde que no ENTONCES no cambia nada.
- AC4: CUANDO el agente ejecuta `specty uninstall`, también en modo delegado, ENTONCES el guard lo bloquea; y sin terminal interactiva el comando se niega.
- AC5: CUANDO se ejecuta `specty uninstall --dry-run` ENTONCES lista lo que quitaría, sin preguntar ni tocar nada, también sin terminal.
- AC6: CUANDO termina ENTONCES dice dónde están las copias, que `.specty/` y el guard global de Codex y OpenCode se quedan, y que los cambios están sin commit; si no había nada de Specty, lo dice.

## Diseño

- Core: `removeBlock(text, id)` junto a `upsertBlock`, y `uninstall` en `PERSON_ONLY`.
- `install/files.ts`: `remove(path)`, que también simula y copia; cada cambio lleva `removed` cuando el archivo se borra.
- Contrapartes de los instaladores: `removeAgentHooks` en `agents.ts` (Claude Code y Cursor), `removeGitHooks` en `git-hooks.ts` y `removeAgentsBlocks` en `project-files.ts`.
- `commands/uninstall.ts` (nuevo):
  - planea con un `InstallFiles` simulado y, con `--dry-run`, se queda ahí;
  - si no, comprueba la terminal, enseña la lista, pregunta y lo repite con uno real que guarda copias;
  - registra el comando con `uninstallCommand(program, run)`, para que `program.ts`, ya en 295 líneas, solo gane una.

## Archivos

- modificar packages/core/src/agents-md.ts — `removeBlock`
- modificar packages/core/src/guard/human.ts — `uninstall`, solo para la persona
- modificar packages/core/test/cards.test.ts — `removeBlock`
- modificar packages/core/test/guard/decide.test.ts — el guard bloquea `uninstall` también en modo delegado
- modificar packages/cli/src/install/files.ts — `remove`
- modificar packages/cli/test/install-files.test.ts — borrar con simulación y copias
- modificar packages/cli/src/install/agents.ts — `removeAgentHooks`
- modificar packages/cli/src/install/git-hooks.ts — `removeGitHooks`
- modificar packages/cli/src/install/project-files.ts — `removeAgentsBlocks`
- crear packages/cli/src/commands/uninstall.ts — el comando de la persona
- modificar packages/cli/src/program.ts — registra `uninstall`
- crear packages/cli/test/uninstall.test.ts — lo que quita, lo que deja y quién puede
- modificar docs/ARCHITECTURE.md — `uninstall` (§6 y §14)
- modificar docs/formats.md — las copias de `uninstall` (§1)

## Tareas

- [x] T1: Core sabe quitar un bloque y reserva `uninstall` a la persona
  - files: packages/core/src/agents-md.ts, packages/core/src/guard/human.ts, packages/core/test/cards.test.ts, packages/core/test/guard/decide.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty-core test
  - type: feat
- [x] T2: Los instaladores saben quitar lo suyo
  - files: packages/cli/src/install/files.ts, packages/cli/test/install-files.test.ts, packages/cli/src/install/agents.ts, packages/cli/src/install/git-hooks.ts, packages/cli/src/install/project-files.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/install-files.test.ts test/setup.test.ts test/install.test.ts
  - type: feat
- [ ] T3: El comando `specty uninstall`
  - files: packages/cli/src/commands/uninstall.ts, packages/cli/src/program.ts, packages/cli/test/uninstall.test.ts, docs/ARCHITECTURE.md, docs/formats.md
  - ac: AC1, AC2, AC3, AC4, AC5, AC6
  - verify: pnpm check
  - type: feat

## Riesgos

- R1: Quitar algo que no es de Specty — solo toca lo que lleva sus marcas, enseña la lista antes de preguntar, guarda copia de cada archivo, y `--dry-run` deja verlo sin riesgo.
- R2: Un agente que se quite la protección — el guard lo bloquea siempre (A1), y el comando exige una terminal real.
