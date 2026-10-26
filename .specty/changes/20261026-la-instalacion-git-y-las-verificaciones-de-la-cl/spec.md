---
kind: standard
epic: 20261026-las-funciones-de-specty-dentro-de-sus-limites
slice: C7
---

# La instalación, git y las verificaciones de la CLI: install, io y check

## Objetivo

Nueve funciones de la instalación, de git y de las verificaciones de la CLI pasan de los límites de Specty: `createGit` (123 líneas), `parseNameStatus` (complejidad 11), `installFiles` (61, 13), `install` de `check --install` (75, 13), `agentIgnores` (11), `removeLefthook` (11), `completeConfig` (11), `scan` de secretos (52) y `parseAddedLines` (12). Cada una se divide en las responsabilidades o los pasos que ya tiene, en el mismo orden, sin cambiar lo que ejecuta, pregunta, escribe, copia o responde.

## Fuera de alcance

- Cambiar un comando de git, una pregunta, un archivo que se escribe o se copia, un commit, un informe o un análisis.
- El servidor, la UI y los exportadores, que son de los cortes C8 y C9.

## Supuestos

- A1: Los tests de la CLI recorren git, las escrituras y las copias de la instalación, `check --install`, los ignores de los agentes, Lefthook, la configuración, los secretos y las líneas añadidas, así que un cambio en lo que hacen los haría fallar.
  - impacto: alto
- A2: `createGit` sigue devolviendo un `Git` con los mismos métodos; solo cambia cómo se construye, por grupos.
  - impacto: alto

## Criterios de aceptación

- AC1: CUANDO se miden `packages/cli/src/install/`, `packages/cli/src/io/` y `packages/cli/src/check/` con `specty check --all` ENTONCES ninguna función pasa de 50 líneas ni de complejidad 10.
- AC2: CUANDO se ejecutan los tests de la CLI ENTONCES pasan sin cambiar lo que comprueban.

## Archivos

- modificar packages/cli/src/io/git.ts — git por grupos: ejecutarlo, las worktrees, los cambios, el índice y los commits, y los archivos; y el estado de cada línea de `--name-status`
- modificar packages/cli/src/install/files.ts — las copias de seguridad y su manifiesto, aparte de las escrituras
- modificar packages/cli/src/check/install.ts — las ediciones, las devDependencies y el informe con su commit
- modificar packages/cli/src/check/install-ignores.ts — el archivo de ignores de cada agente
- modificar packages/cli/src/install/git-hooks.ts — el comando de Specty en cada hook de Lefthook
- modificar packages/cli/src/install/project-files.ts — la verificación añadida a un mapa `verify` que ya existe
- modificar packages/cli/src/check/secrets.ts — los argumentos de cada escáner
- modificar packages/cli/src/check/files.ts — el archivo que abre cada cabecera del diff

## Tareas

- [x] T1: git
  - files: packages/cli/src/io/git.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run
  - type: refactor
- [x] T2: Las escrituras de la instalación
  - files: packages/cli/src/install/files.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run
  - type: refactor
- [ ] T3: La instalación de las verificaciones
  - files: packages/cli/src/check/install.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run
  - type: refactor
- [ ] T4: Los ignores, Lefthook y la configuración
  - files: packages/cli/src/check/install-ignores.ts, packages/cli/src/install/git-hooks.ts, packages/cli/src/install/project-files.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run
  - type: refactor
- [ ] T5: Los secretos y las líneas añadidas
  - files: packages/cli/src/check/secrets.ts, packages/cli/src/check/files.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run
  - type: refactor
