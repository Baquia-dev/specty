---
kind: standard
---

# doctor avisa de las herramientas de JavaScript que verían las worktrees

## Objetivo

Con las worktrees de los cambios en `.worktrees/`, dentro del proyecto (ADR 0018), Vitest, Jest, ESLint y Biome sin `.gitignore` ven las copias del proyecto si la persona los ejecuta en la carpeta principal mientras hay cambios abiertos: Vitest y Jest ejecutan sus tests. `specty doctor` dice qué herramienta de la raíz del proyecto no excluye `.worktrees/`, en qué archivo y qué añadir, como ya hace con lo que escribe Specty en `.specty/`, y la da por excluida cuando lo está.

## Fuera de alcance

- Editar la configuración de esas herramientas: es código de la persona (`vitest.config.ts`, `eslint.config.js`…), y Specty ya pide las exclusiones de `.specty` en lugar de escribirlas.
- Las configuraciones de los paquetes de un monorepo: su raíz es su paquete, y no ven `.worktrees/` de la raíz del repositorio.
- Los observadores de archivos de los servidores de desarrollo (Vite, Metro).

## Supuestos

- A1: `doctor` solo mira `.worktrees/` si la carpeta existe, es decir, una vez que `new` creó un cambio dentro: un proyecto con `git.worktrees: false` no recibe el aviso.
  - impacto: alto
- A2: Una herramienta la excluye si su configuración nombra `.worktrees`: Vitest en `vitest.config.*`, Jest en `jest.config.*` o en `jest` de `package.json`, ESLint en `eslint.config.*` o, con la configuración antigua (`.eslintrc*`), en `.eslintignore`, y Biome en `files.includes` de `biome.json(c)` (`"!.worktrees"`). Biome con `vcs.useIgnoreFile: true` y Prettier también la excluyen si `.gitignore` la ignora, porque leen ese archivo.
- A3: El aviso usa las líneas de `doctor` que ya existen para los formateadores («también revisa … : añade … en …» y «excluye …»), así que core no cambia y `doctor` sale con 1 mientras falte una exclusión.

## Criterios de aceptación

- AC1: CUANDO existe `.worktrees/` y Vitest, Jest, ESLint o Biome de la raíz no la excluyen ENTONCES `specty doctor` lo dice con el archivo y lo que añadir (`"**/.worktrees/**"` en `test.exclude` de Vitest, `"<rootDir>/.worktrees/"` en `testPathIgnorePatterns` y `modulePathIgnorePatterns` de Jest, `".worktrees/"` en `ignores` de ESLint, `"!.worktrees"` en `files.includes` de Biome) y sale con 1.
- AC2: CUANDO esas herramientas ya la excluyen, o Biome con `vcs.useIgnoreFile` y Prettier tienen `.worktrees/` en `.gitignore` ENTONCES `doctor` dice que la excluyen y no avisa.
- AC3: CUANDO no existe `.worktrees/` ENTONCES `doctor` no dice nada de ella.

## Diseño

- `detect/worktree-tools.ts`: `worktreeExclusions(root)` da, para Vitest, Jest y ESLint de la raíz, la misma forma que `formatterExclusions` (`name`, `path`, `file`, `add`, `excluded`).
- `detect/formatters.ts`: `.worktrees/` entre lo que escribe Specty, opcional (solo si existe), con la excepción de `useIgnoreFile` y de `.gitignore`.
- `commands/doctor.ts`: junta las dos listas en las líneas de los formateadores.
- Documentación: ARCHITECTURE (lo que comprueba `doctor`) y la decisión de ADR 0018, que pasa de «`init` las añade» a «`doctor` avisa».

## Archivos

- crear packages/cli/src/detect/worktree-tools.ts — Vitest, Jest y ESLint ante `.worktrees/`
- modificar packages/cli/src/detect/formatters.ts — Biome y Prettier ante `.worktrees/`
- modificar packages/cli/src/commands/doctor.ts — los avisos de `.worktrees/`
- crear packages/cli/test/doctor-worktrees.test.ts — avisos con y sin exclusión, y sin la carpeta
- modificar docs/ARCHITECTURE.md — lo que comprueba `doctor`
- modificar docs/decisions/0018-worktrees-dentro-del-repositorio.md — `doctor` avisa en vez de editar las configuraciones

## Tareas

- [x] T1: doctor avisa de Vitest, Jest, ESLint y Biome ante `.worktrees/`, y la documentación
  - files: packages/cli/src/detect/worktree-tools.ts, packages/cli/src/detect/formatters.ts, packages/cli/src/commands/doctor.ts, packages/cli/test/doctor-worktrees.test.ts, docs/ARCHITECTURE.md, docs/decisions/0018-worktrees-dentro-del-repositorio.md
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/doctor-worktrees.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: Un proyecto que excluye la carpeta de otra forma (un glob distinto, una variable) recibe el aviso igual — el aviso no bloquea nada fuera de `doctor`, y la persona puede añadir el texto que se pide.
