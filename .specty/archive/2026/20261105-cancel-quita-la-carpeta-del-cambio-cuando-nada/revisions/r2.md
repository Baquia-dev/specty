---
kind: standard
epic: 20261105-temporales-se-borran
slice: C3
---

# cancel quita la carpeta del cambio cuando nada se pierde

## Objetivo

Hoy la carpeta de un cambio cancelado se queda hasta que alguien ejecuta `specty prune` o crea otro cambio, con sus `node_modules` y todo lo que preparó `new`. Con este cambio, `specty cancel` la quita en el acto, como `close`, cuando nada se pierde: no tiene nada sin commit y ninguna sesión de agente trabaja en ella. Si no, la deja y la tarjeta dice por qué. La rama se queda, con su trabajo.

## Fuera de alcance

- Borrar la rama del cambio cancelado, o lo que quedó sin commit en su carpeta (nunca `--force`).
- Las carpetas de cambios ya cancelados antes de este cambio: las siguen quitando `specty prune` y `specty new`.
- Los restos de los procesos que murieron (`*.tmp`, `runs/`, índices temporales de git): corte C4.
- Sacar de la carpeta a la sesión de agente que cancela desde dentro, como hace `close` en modo delegado: su carpeta se queda.

## Supuestos

- A1: La carpeta se quita con `git worktree remove` sin `--force`, desde la carpeta principal y después del commit que archiva el cambio. Si git no puede, como con una worktree bloqueada, la carpeta queda y la tarjeta da la última línea de git, como en `close` (`folderStaysLine`).
- A2: «Nada sin commit» lo dice `git status --porcelain` en la carpeta del cambio: ningún archivo con seguimiento modificado y ningún archivo sin seguimiento que git no ignore. Los ignorados, como `node_modules` o los hooks que copió `new`, se van con la carpeta, como en `close`.
  - impacto: alto
- A3: «Una sesión de agente trabaja en ella» sigue la regla de la limpieza de `prune`: el guard ligó a esa carpeta una sesión en el último día (`common/specty/sessions/`), o es un agente (modo delegado) quien cancela desde dentro de ella. Por eso, si la persona cancela un cambio en el que un agente trabajó hoy, la carpeta se queda y `prune` la quita después.
  - impacto: alto
- A4: A una persona que cancela desde dentro de la carpeta se la quita igual, como hace `close`; la tarjeta le dice dónde seguir.
- A5: Si el cambio vive en la carpeta principal (sin worktree propia), `cancel` no toca la carpeta y su tarjeta no la menciona.

## Criterios de aceptación

- AC1: CUANDO la persona cancela un cambio que vive en su propia carpeta, sin nada sin commit en ella y sin sesión de agente que trabaje allí, ENTONCES la carpeta ya no existe, la rama del cambio sigue con el cambio archivado y la tarjeta dice, como la de `close`, que la carpeta se eliminó, que la rama queda y que se sigue en la carpeta principal, también cuando cancela desde dentro de la carpeta y cuando el cambio tenía tareas hechas.
- AC2: CUANDO la carpeta del cambio tiene un archivo con seguimiento modificado o uno sin seguimiento que git no ignora ENTONCES la carpeta y ese archivo se quedan, y la tarjeta dice que la carpeta queda porque tiene cambios sin commit, que se perderían, y que `specty prune` la quitará cuando la persona los descarte.
- AC3: CUANDO una sesión de agente trabaja en la carpeta (el guard la ligó a ella en el último día) o es el agente en modo delegado quien cancela desde dentro ENTONCES la carpeta se queda y la tarjeta dice que una sesión de agente trabaja en ella y que `specty prune` la quitará cuando ya no trabaje allí.
- AC4: CUANDO git no puede quitar la carpeta (una worktree bloqueada) ENTONCES la carpeta se queda, la tarjeta da la razón de git, y `specty prune` la quita después.
- AC5: CUANDO el cambio vive en la carpeta principal ENTONCES `cancel` no toca la carpeta y su tarjeta no habla de ella.
- AC6: CUANDO salen los textos nuevos de la tarjeta de `cancel` ENTONCES salen en español y en inglés.

## Diseño

- Core: `cancelledFolderStaysLine(folder, reason, ctx)` en `cards/close.ts`, con `reason` `"uncommitted"` o `"working"`, y un último parámetro opcional `folder` en `cancelledCard` (`cards/human.ts`): la línea que dice si la carpeta se quitó o por qué queda, tras la de la rama. La línea de carpeta quitada es la de `close` (`folderRemovedLine`).
- CLI: `flow/prune.ts` saca de `removeFinished` las carpetas en las que trabaja una sesión (`workingFolders`) y añade `removeCancelled(session, branch)`: devuelve la línea de la tarjeta, o nada si el cambio vive en la carpeta principal. Comprueba en orden la sesión de agente, lo que hay sin commit y, al final, el resultado de `git worktree remove`. `cancelConfirmed` (`commands/finish.ts`) la llama tras el commit que archiva el cambio y pasa la línea a `cancelledCard`.

## Archivos

- modificar packages/core/src/cards/close.ts — el texto de la carpeta que queda al cancelar, en español e inglés
- modificar packages/core/src/cards/human.ts — `cancelledCard` lleva la línea de la carpeta
- modificar packages/core/src/cards/index.ts — exportar el texto nuevo
- modificar packages/core/test/cards/close.test.ts — los textos nuevos en los dos idiomas
- modificar packages/cli/src/flow/prune.ts — las carpetas con una sesión de agente, compartidas, y quitar la carpeta del cambio cancelado
- modificar packages/cli/src/commands/finish.ts — `cancel` quita la carpeta tras archivar el cambio
- crear packages/cli/test/cancel-folder.test.ts — los criterios de `cancel` con la carpeta del cambio
- modificar packages/cli/test/prune.test.ts — el cambio cancelado que `prune` limpia ya no se queda sin más: su worktree está bloqueada al cancelarlo
- modificar docs/ARCHITECTURE.md — la limpieza (§9) cuenta que `cancel` quita la carpeta y cuándo la deja

## Tareas

- [ ] T1: Los textos de la carpeta de un cambio cancelado
  - files: packages/core/src/cards/close.ts, packages/core/src/cards/human.ts, packages/core/src/cards/index.ts, packages/core/test/cards/close.test.ts
  - ac: AC6
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/close.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint
- [ ] T2: cancel quita la carpeta del cambio cuando nada se pierde
  - files: packages/cli/src/flow/prune.ts, packages/cli/src/commands/finish.ts, packages/cli/test/cancel-folder.test.ts, packages/cli/test/prune.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/cancel-folder.test.ts test/prune.test.ts && pnpm typecheck && pnpm lint && pnpm knip

## Riesgos

- R1: Otros tests cancelan un cambio en su worktree y siguen usando la carpeta después — casi todos tienen una sesión ligada a ella, así que se queda; si alguno falla, se pide su archivo con `specty scope add`.
