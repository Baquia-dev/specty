---
kind: standard
---

# Init reversible: simulación y copias

## Objetivo

`specty init` reescribe archivos del repositorio y de la configuración del usuario (AGENTS.md, los ajustes de Claude Code y de Cursor, los hooks de git, los de Codex y OpenCode) sin red: no se puede ver antes qué hará ni recuperar lo que había. Ahora `specty init --dry-run` dice qué archivos crearía o cambiaría sin tocar nada, y antes de cambiar un archivo que ya existía, `init` guarda una copia y dice dónde. Es la primera mitad del punto «init reversible y `specty uninstall`», dividido por tamaño; `uninstall` va en el cambio siguiente y usará la misma forma de escribir.

## Fuera de alcance

- `specty uninstall`: es el cambio siguiente.
- Restaurar las copias automáticamente: quedan para que la persona las mire o las recupere a mano.
- Versionar los bloques de AGENTS.md.

## Supuestos

- A1: Las copias van a la carpeta común de git, compartida por las worktrees y nunca versionada: `common/specty/backups/<fecha>/`, con `repo/<ruta>` para los archivos del repositorio, `outside/<ruta absoluta>` para los demás (los de Codex y OpenCode, o `.git/info/exclude` desde una worktree) y un `manifest.json` con la ruta original de cada uno.
  - impacto: alto
- A2: Con `--dry-run`, `init` no hace su commit ni añade líneas a `.git/info/exclude`; lista cada archivo que crearía o cambiaría, y solo los que cambiarían de verdad.
- A3: Solo se copia un archivo que existía y cuyo contenido cambia; uno que `init` crea no tiene copia, y el `manifest.json` lo anota como creado, para que se sepa qué borrar si se quiere volver atrás.

## Criterios de aceptación

- AC1: CUANDO se ejecuta `specty init --dry-run` ENTONCES ningún archivo cambia, no hay commit, y la salida lista cada archivo que `init` crearía o cambiaría.
- AC2: CUANDO `init` cambia un archivo que ya existía ENTONCES antes guarda su contenido en la carpeta de copias, el `manifest.json` lo anota, y la salida dice dónde está la carpeta.
- AC3: CUANDO `init` no cambia ningún archivo que ya existía ENTONCES no crea la carpeta de copias.
- AC4: CUANDO se ejecuta `init` sin `--dry-run` ENTONCES escribe exactamente lo mismo que antes de este cambio.

## Diseño

- `install/files.ts` (nuevo): `InstallFiles`, con `read`, `write` (texto y, si hace falta, permiso de ejecución) y `changes`, la lista de archivos creados o cambiados. Solo registra lo que cambia de verdad. En simulación no toca el disco y recuerda lo escrito, para que las lecturas siguientes lo vean. Si no simula, antes del primer cambio de un archivo existente lo copia a la carpeta de copias y lo anota en su `manifest.json`.
- `agents.ts`, `git-hooks.ts`, `project-files.ts` y `opencode.ts` reciben un `InstallFiles` y escriben solo a través de él; por defecto, uno que escribe directamente, para quien los llame sin él.
- `commands/init.ts` crea el `InstallFiles` (simulado con `--dry-run`, con copias si no) y lo pasa a todos los instaladores; con `--dry-run` no hace commit y lista lo que haría; si no, añade la carpeta de copias a la salida cuando la hay. `program.ts` registra `--dry-run`.

## Archivos

- crear packages/cli/src/install/files.ts — lecturas y escrituras con simulación y copias
- modificar packages/cli/src/install/agents.ts — escribe con `InstallFiles`
- modificar packages/cli/src/install/git-hooks.ts — escribe con `InstallFiles`
- modificar packages/cli/src/install/project-files.ts — escribe con `InstallFiles`
- modificar packages/cli/src/install/opencode.ts — escribe con `InstallFiles`
- crear packages/cli/test/install-files.test.ts — simulación, copias y manifiesto
- modificar packages/cli/src/commands/init.ts — `--dry-run` y las copias
- modificar packages/cli/src/program.ts — la opción `--dry-run` de `init`
- crear packages/cli/test/init-reversible.test.ts — `init --dry-run` y las copias de `init`
- modificar docs/formats.md — la carpeta de copias (§1)
- modificar docs/ARCHITECTURE.md — `init --dry-run` y las copias (§14)

## Tareas

- [ ] T1: Los instaladores escriben con simulación y copias
  - files: packages/cli/src/install/files.ts, packages/cli/src/install/agents.ts, packages/cli/src/install/git-hooks.ts, packages/cli/src/install/project-files.ts, packages/cli/src/install/opencode.ts, packages/cli/test/install-files.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/install-files.test.ts test/setup.test.ts test/install.test.ts test/opencode.test.ts test/codex.test.ts test/cursor.test.ts
  - type: refactor
- [ ] T2: `init --dry-run` y las copias de `init`
  - files: packages/cli/src/commands/init.ts, packages/cli/src/program.ts, packages/cli/test/init-reversible.test.ts, docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3
  - verify: pnpm check
  - type: feat

## Riesgos

- R1: Cambiar cómo escriben los instaladores rompería `init` — T1 no cambia lo que se escribe (AC4), y los tests de instalación existentes lo comprueban.
- R2: Las copias crecen con cada `init` — solo se copia lo que cambia, en una carpeta por ejecución, en la carpeta común de git, fuera del repositorio.
