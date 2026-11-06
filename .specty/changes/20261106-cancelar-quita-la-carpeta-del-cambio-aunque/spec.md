---
kind: standard
---

# Cancelar quita la carpeta del cambio aunque tenga trabajo sin commit

## Objetivo

Hoy `specty cancel` deja la carpeta del cambio si tiene algo sin commit, para no perderlo, y `specty prune` tampoco la quita después (`git worktree remove` sin `--force` se niega), así que esas carpetas se acumulan abandonadas: hoy había cinco, de cambios cancelados y rehechos. Con este cambio, al cancelar, lo que la carpeta tiene sin commit queda en un commit de la rama del cambio, que ya guarda su registro, y la carpeta se quita igual: no se pierde nada y no queda ninguna abandonada.

## Fuera de alcance

- Quitar la carpeta en la que trabaja otra sesión de agente según el guard: sigue quedándose, y `prune` la quita cuando ya ninguna trabaja en ella.
- Incorporar o borrar la rama del cambio cancelado: sigue sin incorporarse y guarda su registro.
- Las carpetas de cambios cancelados antes de este cambio que siguen con algo sin commit: `prune` no las toca (hoy ya no queda ninguna en este repositorio).
- `close` y la limpieza de `prune` y `new`: siguen igual.

## Supuestos

- A1: Lo sin commit (archivos con seguimiento modificados o borrados, y los sin seguimiento que git no ignora) va a un commit propio de la rama del cambio, después del de archivarlo, con el recibo de Specty y los trailers de una decisión, como el commit del archivo. Lo que git ignora (`node_modules`, builds) no entra y se va con la carpeta, como hoy.
  - impacto: alto
- A2: El commit de lo sin commit se hace también cuando otra sesión de agente trabaja en la carpeta y por eso se queda: así `prune` puede quitarla después sin `--force`. Specty no hace push, así que el commit solo vive en la rama local.
  - impacto: alto
- A3: Si git no puede hacer ese commit (por ejemplo, no puede leer un archivo), el índice vuelve a como estaba, la carpeta y lo que tiene se quedan, y la tarjeta lo dice con la línea de hoy («tiene cambios sin commit, que se perderían»).
- A4: La tarjeta de `cancel` dice, antes de la línea de la carpeta, que lo sin commit quedó en el commit `<hash>` de la rama `<rama>`. El asunto del commit es `wip: lo que <id> tenía sin commit al cancelarse` (en inglés, `wip: what <id> had uncommitted when cancelled`).

## Criterios de aceptación

- AC1: CUANDO la persona cancela un cambio cuya carpeta tiene un archivo con seguimiento modificado y otro sin seguimiento que git no ignora, y ninguna sesión de agente trabaja en ella, ENTONCES la carpeta ya no existe, la rama del cambio tiene, después del commit de archivarlo, un commit con los dos archivos tal como estaban, y la tarjeta dice ese commit y que la carpeta se eliminó.
- AC2: CUANDO el agente, en modo delegado, cancela así desde dentro de la carpeta con algo sin commit ENTONCES la carpeta ya no existe, la rama tiene ese commit con lo sin commit, y el SIGUIENTE le pide salir de ella, que ya no existe, y seguir en la carpeta principal.
- AC3: CUANDO una sesión de agente trabaja en la carpeta del cambio que se cancela y la carpeta tiene algo sin commit ENTONCES lo sin commit queda en un commit de la rama, la carpeta se queda y la tarjeta dice que una sesión trabaja en ella; y CUANDO después ya ninguna sesión trabaja en ella ENTONCES `specty prune` la quita.
- AC4: CUANDO git no puede hacer el commit de lo sin commit ENTONCES la carpeta y lo que tiene se quedan, nada queda preparado en el índice, y la tarjeta dice que tiene cambios sin commit.
- AC5: CUANDO salen los textos nuevos (el asunto del commit y la línea de la tarjeta) ENTONCES salen en español y en inglés.

## Diseño

- Core, `cards/close.ts`: `cancelWorkCommitSubject(id, lang)`, el asunto del commit, y `cancelledWorkSavedLine(commit, branch, ctx)`, la línea de la tarjeta. Se exportan en `cards/index.ts`.
- Core, `cards/human.ts`: el último parámetro de `cancelledCard` pasa de una línea opcional a una lista de líneas sobre la carpeta (`folder: readonly string[] = []`), para llevar la del commit y la de la carpeta.
- CLI, `flow/prune.ts`: `removeCancelled`, antes de mirar si la carpeta se queda, llama a `commitUncommitted(session, id)`: con `git status --porcelain` vacío no hace nada; si no, `commitWithReceipt` con `stage: [["."]]`, recibo `close` y `decisionTrailers`; si falla, `git reset -q` y nada. Devuelve, además de la línea de la carpeta y `left`, la línea del commit (`saved`), si lo hubo.
- CLI, `commands/finish.ts`: `cancelConfirmed` pasa a `cancelledCard` la línea del commit y la de la carpeta.

## Archivos

- modificar packages/core/src/cards/close.ts — el asunto del commit de lo sin commit y la línea de la tarjeta que lo nombra
- modificar packages/core/src/cards/human.ts — `cancelledCard` lleva varias líneas sobre la carpeta
- modificar packages/core/src/cards/index.ts — exporta los dos textos nuevos
- modificar packages/core/test/cards/close.test.ts — los textos nuevos, en español y en inglés, y la tarjeta con varias líneas
- modificar packages/cli/src/flow/prune.ts — `removeCancelled` guarda lo sin commit en la rama antes de quitar la carpeta
- modificar packages/cli/src/commands/finish.ts — la tarjeta de `cancel` dice el commit de lo sin commit
- modificar packages/cli/test/cancel-folder.test.ts — cancelar con algo sin commit: el commit en la rama y la carpeta quitada; los tests que esperaban que se quedara se sustituyen
- modificar docs/ARCHITECTURE.md — la limpieza (§9) cuenta que `cancel` guarda lo sin commit en la rama y quita la carpeta

## Tareas

- [x] T1: Los textos del commit de lo sin commit, en español y en inglés
  - files: packages/core/src/cards/close.ts, packages/core/src/cards/human.ts, packages/core/src/cards/index.ts, packages/core/test/cards/close.test.ts
  - ac: AC1, AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/close.test.ts
  - type: feat
- [x] T2: Cancelar guarda lo sin commit en la rama y quita la carpeta
  - files: packages/cli/src/flow/prune.ts, packages/cli/src/commands/finish.ts, packages/cli/test/cancel-folder.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/cancel-folder.test.ts test/epic-return.test.ts test/delegate.test.ts test/commands.test.ts test/prune.test.ts test/sessions.test.ts test/session-return.test.ts && pnpm typecheck && pnpm lint
  - type: feat
- [ ] T3: La documentación cuenta que cancelar guarda lo sin commit
  - files: docs/ARCHITECTURE.md
  - ac: AC1, AC3
  - verify: pnpm typecheck && pnpm lint && pnpm sources && pnpm knip
  - type: docs

## Riesgos

- R1: Un archivo sin seguimiento que no debería versionarse (un `.env` que git no ignora) entra en el commit de la rama — solo vive en la rama local, Specty no hace push, y la persona lo ve en la tarjeta; es lo mismo que guardaría `git add -A`.
- R2: Otro test cancela con algo sin commit y espera que la carpeta se quede — se buscaron con grep los textos de «sin commit» en los tests: solo los de `cancel-folder.test.ts`; los demás tests que cancelan van en la verificación de T2.
- R3: El test de AC4 hace ilegible un archivo con `chmod 000`, que no frena a root — el test se salta si el proceso corre como root.
