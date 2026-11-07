---
kind: quick
---

# Una espera cuyo cambio se cierra y borra su carpeta dice que se cerró

## Objetivo

Un `specty wait` que corre en la carpeta de un cambio (`.worktrees/<id>`) termina hoy con «Git falló y Specty no terminó el comando: git diff: spawn git ENOENT» y código 1 cuando la persona cierra ese cambio (con `close` o con el `accept` de un quick), porque el cierre borra la carpeta mientras la espera corre en ella y git ya no puede ejecutarse allí (P283). Con este cambio, `wait` anota al empezar la carpeta principal y, cuando la persona decide y la carpeta del cambio ya no existe, no da la tarjeta de `next`: lee desde la carpeta principal la fase del cambio en la punta de su rama y responde, con código 0, que la persona lo cerró o lo canceló, con el mismo `SIGUIENTE:` que un cierre desde dentro (salir de la carpeta, que ya no existe, y seguir en la principal). Si la carpeta se borró a mano y el cambio sigue abierto en su rama, dice eso y pide recuperarla con `specty restore <id>` desde la carpeta principal.

## Archivos

- modificar packages/cli/src/commands/wait.ts — anota al empezar la carpeta principal; si la carpeta del cambio ya no existe cuando la persona decide, lee la fase del cambio en la punta de su rama desde la principal y da la tarjeta de la carpeta que se fue en vez de la de `next`
- modificar packages/core/src/cards/wait.ts — `waitFolderGoneCard`: la persona cerró o canceló el cambio, o la carpeta se borró con el cambio abierto, cada uno con su `SIGUIENTE:`
- modificar packages/core/src/cards/index.ts — exporta `waitFolderGoneCard`
- crear packages/cli/test/wait-folder.test.ts — `wait` en la carpeta de un cambio que la persona cierra (`accept` de un quick), cancela, o cuya carpeta se borra a mano mientras espera: código 0, qué pasó y su `SIGUIENTE:`
- modificar packages/core/test/cards/wait.test.ts — los tres casos de la tarjeta, en español y en inglés
- modificar docs/ARCHITECTURE.md — §6, `specty wait`: qué hace cuando la carpeta del cambio desaparece mientras espera

## Tareas

- [x] T1: Una espera cuya carpeta se borra al cerrar o cancelar el cambio dice qué pasó y cómo seguir
  - files: packages/cli/src/commands/wait.ts, packages/core/src/cards/wait.ts, packages/core/src/cards/index.ts, packages/cli/test/wait-folder.test.ts, packages/core/test/cards/wait.test.ts, docs/ARCHITECTURE.md
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/wait-folder.test.ts test/wait.test.ts && pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/wait.test.ts && pnpm typecheck && pnpm lint
  - type: fix
