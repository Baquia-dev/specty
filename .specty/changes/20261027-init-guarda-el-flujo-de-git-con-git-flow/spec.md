---
kind: standard
---

# init guarda el flujo de git con --git-flow

## Objetivo

Hoy `git.flow` solo se puede poner a mano en `config.yaml`. Con este cambio, `specty init --git-flow <flujo>` lo escribe, en una configuración nueva o en la que ya existe, y con Git Flow deja listo lo que ese flujo necesita: `git.target: develop` y la rama `develop`. Es la base para que, en el cambio siguiente, `init` detecte el flujo y se lo pregunte a la persona.

## Fuera de alcance

- Que `init` detecte el flujo del repositorio, se lo pregunte a la persona o exija elegirlo en un proyecto nuevo: va en el cambio siguiente.
- Escribir `git.branchPattern` desde `init`.
- Las ramas `release/` y `hotfix/` de Git Flow, y empujar `develop` al remoto.

## Supuestos

- A1: Sin `--git-flow`, `init` hace lo de hoy y no toca `git.flow`; tampoco lo cambia al repetirse.
- A2: Con Git Flow, `init` añade `git.target: develop` solo si no hay un `git.target`, y crea `develop` solo si esa es la rama destino y no existe en local: desde `origin/develop` si existe y, si no, desde la rama actual después de su commit, que suele ser la principal.
  - impacto: medio
- A3: El simulacro (`--dry-run`) lista `config.yaml` como cualquier archivo y no crea ramas.

## Criterios de aceptación

- AC1: CUANDO se ejecuta `init --git-flow <flujo>` en un repositorio sin configuración ENTONCES `.specty/config.yaml` nace con `git.flow: <flujo>`, y la salida dice cómo se llamarán las ramas de los cambios.
- AC2: CUANDO la configuración ya existe ENTONCES `--git-flow` cambia o añade solo `git.flow` y deja los comentarios, el formato y las demás claves como estaban; sin `--git-flow`, `init` no toca `git.flow`.
- AC3: CUANDO el flujo es `gitflow` y la configuración no tiene `git.target` ENTONCES `init` añade `git.target: develop`; si ya tenía uno, lo respeta.
- AC4: CUANDO el flujo es `gitflow`, la rama destino es `develop` y no existe en local ENTONCES `init` la crea, desde `origin/develop` si existe y si no desde la rama actual tras su commit, y lo dice; con `--dry-run` no crea ninguna rama.
- AC5: CUANDO `--git-flow` no es `specty`, `github`, `trunk` ni `gitflow` ENTONCES `init` no instala nada y dice los válidos.
- AC6: CUANDO se lee ARCHITECTURE §14 ENTONCES dice que `init --git-flow` escribe el flujo y qué prepara con Git Flow.

## Diseño

- Core, `cards/init.ts`: la negativa `unknown-flow` con los flujos válidos; `flowLine(flow, lang)`, con el nombre de las ramas de ese flujo; `developLine(from, lang)`.
- CLI, `install/project-files.ts`:
  - `withGitFlow(text, flow)`: cambia el valor de `git.flow` o lo añade al mapa `git` (o un bloque `git:` nuevo), y con `gitflow` añade `target: develop` si falta, insertando líneas como `completeConfig`.
  - `writeConfig` se muda aquí desde `commands/init.ts`, junto a `completeConfig` y `withLanguage`, y aplica `withGitFlow` a la configuración nueva y a la existente; dice `flowLine` si cambió el texto.
- CLI, `install/git-flow.ts` (nuevo): `ensureDevelop(git, lang)` crea `develop` si falta.
- CLI, `commands/init.ts`: lee `--git-flow`, rechaza uno desconocido antes de instalar y, tras el commit, llama a `ensureDevelop` si el flujo es `gitflow` y el destino es `develop`. `program.ts` registra la opción.

## Archivos

- modificar packages/core/src/cards/init.ts — negativa, línea del flujo y de `develop`
- modificar packages/core/test/cards/init.test.ts — los textos nuevos
- modificar packages/cli/src/install/project-files.ts — `withGitFlow` y `writeConfig`
- crear packages/cli/src/install/git-flow.ts — la rama `develop`
- modificar packages/cli/src/commands/init.ts — `--git-flow`
- modificar packages/cli/src/program.ts — registra `--git-flow`
- crear packages/cli/test/init-git-flow.test.ts — `init --git-flow` de punta a punta
- modificar docs/ARCHITECTURE.md — §14

## Tareas

- [x] T1: los textos de init para el flujo de git
  - files: packages/core/src/cards/init.ts, packages/core/test/cards/init.test.ts
  - ac: AC1, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/init.test.ts
- [x] T2: init --git-flow escribe git.flow y, con Git Flow, git.target
  - files: packages/cli/src/install/project-files.ts, packages/cli/src/commands/init.ts, packages/cli/src/program.ts, packages/cli/test/init-git-flow.test.ts
  - ac: AC1, AC2, AC3, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/init-git-flow.test.ts test/init-language.test.ts
- [x] T3: con Git Flow, init crea la rama develop
  - files: packages/cli/src/install/git-flow.ts, packages/cli/src/commands/init.ts, packages/cli/test/init-git-flow.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/init-git-flow.test.ts
- [x] T4: ARCHITECTURE dice qué hace init --git-flow
  - files: docs/ARCHITECTURE.md
  - ac: AC6
  - type: docs
- [x] T5: los ayudantes de config.yaml dejan de exportarse
  - files: packages/cli/src/install/project-files.ts
  - ac: AC2
  - verify: pnpm knip
  - type: refactor

## Riesgos

- R1: `commands/init.ts` está en el límite de tamaño. Mitigación: `writeConfig` se muda a `install/project-files.ts`, donde ya viven los que editan `config.yaml`.
- R2: Un `git:` que no es un mapa en `config.yaml`. Mitigación: `withGitFlow` no lo toca, como `completeConfig` con `verify`, y la validación lo dice.
