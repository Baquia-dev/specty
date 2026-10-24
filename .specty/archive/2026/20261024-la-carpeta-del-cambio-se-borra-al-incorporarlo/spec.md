---
kind: quick
---

# La carpeta del cambio se borra al incorporarlo

## Objetivo

Cuando el agente cierra un cambio desde dentro de su worktree (modo delegado), la carpeta se queda hasta que otro `specty new` la borra, a veces mientras otra sesión aún está dentro. Ahora `close` (y el `accept` de un cambio quick) borra la worktree en cuanto el cambio entra en la rama destino, también si quien cierra trabaja dentro; la salida dice que la carpeta ya no existe y pide salir de ella (en Claude Code, `ExitWorktree`). Probado el 2026-10-24: Claude Code devuelve el shell a la carpeta del proyecto si la suya desaparece, y `ExitWorktree` funciona con la carpeta ya borrada. El hook `WorktreeRemove` responde bien cuando la carpeta ya no existe, y sigue negándose a borrar la de un cambio abierto. `specty new` y `prune` siguen limpiando, como red para la carpeta que no se pudo borrar (por ejemplo, con archivos sin seguimiento).

## Archivos

- modificar packages/cli/src/flow/land.ts — borra la worktree al incorporar, también desde dentro
- modificar packages/cli/src/enforce/worktree-hooks.ts — `WorktreeRemove` de una carpeta que ya no existe
- modificar packages/cli/test/delegated-integration.test.ts — el agente que cierra desde dentro se queda sin la carpeta
- modificar packages/cli/test/prune.test.ts — las carpetas que sobran se fabrican con una worktree bloqueada
- modificar packages/cli/test/worktree-hooks.test.ts — borrar una carpeta que ya no existe
- modificar docs/ARCHITECTURE.md — el paso 5 de la incorporación y la limpieza (§9), y entrar por nombre (§10)

## Tareas

- [x] T1: La worktree se borra al incorporar el cambio
  - files: packages/cli/src/flow/land.ts, packages/cli/src/enforce/worktree-hooks.ts, packages/cli/test/delegated-integration.test.ts, packages/cli/test/prune.test.ts, packages/cli/test/worktree-hooks.test.ts, docs/ARCHITECTURE.md
  - verify: pnpm check
  - type: fix

## Cierre

### Resumen

landChange borra la worktree en cuanto el cambio está en su rama destino, también si el agente cierra desde dentro (modo delegado); su SIGUIENTE dice que la carpeta ya no existe y que salga (ExitWorktree), o que salga de ella si no se pudo borrar; a una persona le basta la línea de dónde seguir. El hook WorktreeRemove responde bien si la carpeta ya no existe. Los tests de prune fabrican la carpeta que sobra con una worktree bloqueada. ARCHITECTURE §9 y §10.
