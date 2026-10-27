---
kind: standard
---

# Nombres de rama semánticos según el flujo de git

## Objetivo

Hoy cada cambio vive en `specty/<id>`, un nombre que no sigue el flujo de git del repositorio. Con este cambio, `config.yaml` dice el flujo (`git.flow`: Git Flow, GitHub Flow, trunk o el de Specty) y `specty new --type <tipo>` nombra la rama con el tipo del cambio y el título, sin la fecha: `fix/login-con-google` o `bugfix/login-con-google`. Specty sigue reconociendo el cambio de cada rama.

## Fuera de alcance

- Un patrón de rama propio (`git.branchPattern`), que `next` pida `--type` en su SIGUIENTE y que `prune` borre las ramas semánticas: van en el cambio siguiente. Hasta entonces, esas ramas quedan como las de la persona.
- Que `init` detecte el flujo del repositorio o se lo pregunte a la persona, que un proyecto nuevo deba elegirlo y que Git Flow escriba `git.target: develop`.
- Las ramas `release/` y `hotfix/` de Git Flow.
- Renombrar las ramas de los cambios ya creados.
- Usar el tipo del cambio en el asunto de los commits.

## Supuestos

- A1: Sin `git.flow`, el flujo es `specty` y las ramas siguen siendo `specty/<id>` y `spike/<id>`, así que ningún repositorio instalado cambia hasta que la persona elige un flujo (o lo hace `init` más adelante).
  - impacto: alto
- A2: En Git Flow, un cambio `fix` va en `bugfix/` y todos los demás tipos en `feature/`, porque Git Flow no tiene más prefijos para el trabajo diario.
  - impacto: medio
- A3: GitHub Flow y trunk nombran las ramas igual (`<tipo>/<slug>`); se distinguen para que `init` pueda ofrecerlos más adelante.
- A4: El tipo solo nombra la rama: no se guarda en `state.json`, y queda en la auditoría con `change.created`. Un spike tiene el tipo `spike` y no lee `--type`.
- A5: La marca que liga la rama con su cambio vive en la configuración de git del clon (`branch.<rama>.specty`). En otro clon, Specty reconoce el cambio por su `state.json` mientras está abierto.
  - impacto: medio

## Criterios de aceptación

- AC1: CUANDO `git.flow` es `github` o `trunk` y el agente ejecuta `specty new "Login con Google" --type fix` ENTONCES la rama del cambio es `fix/login-con-google`, y la carpeta del cambio y `.specty/changes/` conservan el id con fecha; sin `--type`, la rama es `feat/login-con-google`.
- AC2: CUANDO `git.flow` es `gitflow` ENTONCES un cambio `fix` va en `bugfix/<slug>`, uno de cualquier otro tipo (o sin `--type`) en `feature/<slug>` y un spike en `spike/<slug>`.
- AC3: CUANDO `config.yaml` no tiene `git.flow`, o es `specty`, ENTONCES las ramas siguen siendo `specty/<id>` y `spike/<id>`, también con `--type`; y un `git.flow` desconocido hace fallar la configuración con la ruta `git.flow`.
- AC4: CUANDO la rama que tocaría ya existe en local o en un remoto ENTONCES `new` usa la primera libre añadiendo `-2`, `-3`…, y el id del cambio no cambia por ello.
- AC5: CUANDO `--type` no es un tipo de commit (`feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `build`, `ci`, `style`) ENTONCES `new` no crea nada y dice los válidos.
- AC6: CUANDO `new` crea la rama de un cambio, en una worktree o en la carpeta actual, ENTONCES la configuración de git la liga a su cambio (`branch.<rama>.specty` = id).
- AC7: CUANDO una carpeta está en la rama semántica de un cambio ENTONCES Specty lo reconoce como el cambio activo (`next`, `task done`, el guard), también si la rama llegó de otro clon sin la marca y solo la nombra el `state.json` del cambio abierto.
- AC8: CUANDO se leen `docs/formats.md` §6 y ARCHITECTURE §9 ENTONCES describen `git.flow`, `--type`, los nombres de cada flujo y cómo se reconoce el cambio de una rama.

## Diseño

- Core, `branches.ts` (nuevo), puro:
  - `GIT_FLOWS` (`specty`, `github`, `trunk`, `gitflow`).
  - `branchName({ flow, kind, type, id, title })`: el slug es `slugify(title)`, como el id sin la fecha. `specty`: `specty/<id>` (`spike/<id>` un spike); `github` y `trunk`: `<tipo>/<slug>`; `gitflow`: `bugfix/<slug>` un `fix`, `feature/<slug>` los demás; un spike, `spike/<slug>` en los tres.
- Core, `schema/config.ts`: `git.flow` (enum de `GIT_FLOWS`, por defecto `specty`).
- Core, `cards/new.ts`: `newRefusalCard` gana `unknown-type`, con los tipos válidos.
- CLI, `flow/branches.ts` (nuevo):
  - `freeBranch(git, name)`: el nombre, o con `-2`, `-3`… si existe `refs/heads/<nombre>` o `refs/remotes/*/<nombre>`.
  - `markBranch(git, branch, id)` escribe `branch.<rama>.specty = <id>` en la configuración común de git; git la borra al borrar la rama y la mueve al renombrarla.
  - `changeOfBranch(session, branch)`: el id por el nombre (`specty/<id>`, `spike/<id>`), si no por la marca y si no por el cambio abierto de `.specty/changes/` cuyo `state.branch` es esa rama.
- CLI, `commands/new.ts` y `agent-commands.ts`: `--type` (por defecto `feat`, solo de `COMMIT_TYPES`, comprobado antes de abrir la sesión, como `--kind`); la rama sale de `branchName` y `freeBranch`, y se marca, en la worktree y en la carpeta actual. El id sigue siendo único entre cambios, carpetas y ramas `specty/<id>`. `change.created` registra `type`.
- CLI, `flow/active.ts` usa `changeOfBranch`.

## Archivos

- crear packages/core/src/branches.ts — nombres de rama por flujo y tipo
- modificar packages/core/src/index.ts — exportar lo de `branches.ts`
- crear packages/core/test/branches.test.ts — nombres por flujo
- modificar packages/core/src/schema/config.ts — `git.flow`
- modificar packages/core/test/schema/schema.test.ts — la clave nueva
- modificar packages/core/src/cards/new.ts — rechazo `unknown-type`
- modificar packages/core/test/cards/new.test.ts — el rechazo
- crear packages/cli/src/flow/branches.ts — rama libre, marca y cambio de una rama
- modificar packages/cli/src/commands/new.ts — la rama semántica
- modificar packages/cli/src/commands/agent-commands.ts — opción `--type`
- modificar packages/cli/src/flow/active.ts — el cambio activo por la rama
- crear packages/cli/test/branch-names.test.ts — `new`, colisiones, marca y cambio activo
- modificar docs/formats.md — §6, `git.flow`
- modificar docs/ARCHITECTURE.md — §9, ramas

## Tareas

- [x] T1: el nombre de la rama según el flujo y el tipo, y la clave git.flow
  - files: packages/core/src/branches.ts, packages/core/src/index.ts, packages/core/test/branches.test.ts, packages/core/src/schema/config.ts, packages/core/test/schema/schema.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/branches.test.ts test/schema/schema.test.ts
- [ ] T2: new crea la rama semántica, libre y marcada, y rechaza un tipo desconocido
  - files: packages/core/src/cards/new.ts, packages/core/test/cards/new.test.ts, packages/cli/src/flow/branches.ts, packages/cli/src/commands/new.ts, packages/cli/src/commands/agent-commands.ts, packages/cli/test/branch-names.test.ts
  - ac: AC1, AC2, AC3, AC4, AC5, AC6
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/branch-names.test.ts
- [ ] T3: el cambio activo se reconoce en una rama semántica
  - files: packages/cli/src/flow/branches.ts, packages/cli/src/flow/active.ts, packages/cli/test/branch-names.test.ts
  - ac: AC7
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/branch-names.test.ts
- [ ] T4: formats y ARCHITECTURE describen los flujos y las ramas
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC8
  - type: docs

## Riesgos

- R1: El guard resuelve el cambio activo en cada acción, y ahora puede costar una llamada más a git y leer los `state.json` abiertos. Mitigación: primero el nombre (`specty/<id>`), luego la marca, y solo al final los cambios abiertos, que son pocos.
- R2: git no deja crear `feat/x` si existe una rama `feat`, y `-2` no lo arregla. Mitigación: `new` falla con el mensaje de git, que nombra la rama; es raro, y el cambio siguiente trae `git.branchPattern`.
- R3: Muchos tests comprueban `specty/<id>`. Mitigación: el flujo por defecto es `specty`, así que no cambian.
