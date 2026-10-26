---
kind: standard
epic: 20261025-knip-vigila-las-exportaciones-y-los-tipos-que-so
slice: C2
---

# la CLI sin exportaciones ni tipos que sobran

## Objetivo

Con todas sus reglas encendidas, knip marca en `packages/cli/src` 16 exportaciones y 7 tipos que ningún otro archivo importa. Casi todos se usan solo en su archivo y se les quita el `export`. Dos no los usa nadie y se borran: `retroTrailers` (flow/finish.ts), sin llamadas desde la primera versión de la CLI porque los trailers de un retro los pone `enforce/hook.ts`, y la reexportación de `Detection` en commands/init.ts. Es el segundo corte de la épica; las reglas se encienden en C5.

## Fuera de alcance

- Cambiar lo que hace cualquier comando: solo cambian las exportaciones y se borra código que nadie llama.
- core y la UI, que tienen sus propios cortes (C1, C3 y C4).
- Los ayudantes de los tests de la CLI (`test/support.ts`, `test/walk.ts`, `test/fake-model.ts` y `test/server/support.ts`), con otros 8: con ellos este corte llega a tamaño XL, así que los limpia C5, que según el riesgo R1 de la épica limpia lo que quede antes de encender las reglas.
- Los archivos que cambia la otra sesión (check/ci.ts, check/dart.ts, check/install.ts y commands/check.ts).

## Supuestos

- A1: La CLI solo publica su bundle (`dist/specty.mjs`), así que ninguna exportación de `src` es API para nadie fuera del repositorio.

## Criterios de aceptación

- AC1: CUANDO se ejecuta knip con todas las reglas encendidas ENTONCES no marca ninguna exportación ni tipo de `packages/cli/src`.
- AC2: CUANDO se ejecutan los tests y la comprobación de tipos ENTONCES pasan sin cambiar ninguna aserción.

## Archivos

- modificar packages/cli/src/commands/audit.ts — audit sin export
- modificar packages/cli/src/commands/export.ts — exportChange sin export
- modificar packages/cli/src/commands/init.ts — init e InitOptions sin export, sin la reexportación de Detection
- modificar packages/cli/src/commands/uninstall.ts — uninstall sin export
- modificar packages/cli/src/check/provider.ts — CheckOutcome sin export
- modificar packages/cli/src/flow/carried.ts — followUps sin export
- modificar packages/cli/src/flow/finish.ts — borrar retroTrailers, que nadie llama
- modificar packages/cli/src/flow/worktree.ts — mainBranch sin export
- modificar packages/cli/src/enforce/sessions.ts — sessionOf sin export
- modificar packages/cli/src/store/changes.ts — StoreError sin export
- modificar packages/cli/src/install/git-hooks.ts — GIT_HOOKS, HookManager, detectHookManager, hooksDirectory y removeShellBlock sin export
- modificar packages/cli/src/install/opencode.ts — opencodePlugin sin export
- modificar packages/cli/src/io/git.ts — GitError y RunOptions sin export
- modificar packages/cli/src/session.ts — Io y delegatedTerminal sin export
- modificar packages/cli/src/server/records.ts — ReviewRecord sin export

## Tareas

- [x] T1: Los comandos y los proveedores de check exportan solo lo que se importa
  - files: packages/cli/src/commands/audit.ts, packages/cli/src/commands/export.ts, packages/cli/src/commands/init.ts, packages/cli/src/commands/uninstall.ts, packages/cli/src/check/provider.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty typecheck
  - type: refactor
- [x] T2: El flujo y el almacén exportan solo lo que se importa, sin retroTrailers
  - files: packages/cli/src/flow/carried.ts, packages/cli/src/flow/finish.ts, packages/cli/src/flow/worktree.ts, packages/cli/src/enforce/sessions.ts, packages/cli/src/store/changes.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty typecheck
  - type: refactor
- [ ] T3: La instalación, git, la sesión y el servidor exportan solo lo que se importa
  - files: packages/cli/src/install/git-hooks.ts, packages/cli/src/install/opencode.ts, packages/cli/src/io/git.ts, packages/cli/src/session.ts, packages/cli/src/server/records.ts
  - ac: AC1, AC2
  - verify: pnpm check
  - type: refactor
