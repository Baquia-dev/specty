---
kind: standard
follows:
  - 20261104-fin-de-sesion-libera-el-frente
---

# La limpieza de la actividad y los mensajes viejos

## Objetivo

Resuelve P3 y P37. La mitad viva de la memoria de Specty, en `.git/common/specty/`, deja archivos que ya no sirven. Son los registros de actividad de las conversaciones que terminaron, como el `claude-code-bench.json` de una medición, y los mensajes que nadie recogió de los cambios que se cerraron o cancelaron. `specty prune` los borra, y archivar un cambio borra sus mensajes.

## Fuera de alcance

- Borrar los registros de dueños de frentes caducados: uno caducado no cuenta, y el siguiente `front take` lo reescribe.
- Que el fin de una sesión (`SessionEnd`) borre la actividad de la conversación.
- Avisar a quien deja un mensaje de si alguien trabaja en el cambio, y contar los mensajes en `status` (P38).

## Supuestos

- A1: Un registro de actividad ya no sirve si su carpeta no existe (la worktree de un cambio cerrado), o si su último paso pasa de `memory.orphanAfterMin` minutos en una carpeta donde no vive ningún cambio abierto. El de una carpeta con un cambio abierto se queda aunque sea viejo, porque `status` lo usa para decir quién dio el último paso de un cambio huérfano.
  - impacto: alto
- A2: Los mensajes de un cambio que no está abierto en ninguna carpeta del clon ya no le llegarán a nadie: `prune` los borra, y `archive` borra los del cambio que archiva, se cierre o se cancele.
- A3: Como lo que ya hace `prune`, borrar esto no quita trabajo de nadie, así que también lo ejecuta el agente.
- A4: La salida de `prune` dice cuántos registros de actividad borró y de qué cambios borró mensajes. Solo dice que no había nada que limpiar cuando no borró nada de nada. Los campos nuevos de `pruneCard` son opcionales, así que quien lo llama como antes ve lo mismo.

## Criterios de aceptación

- AC1: CUANDO se ejecuta `specty prune` ENTONCES borra los registros de actividad cuya carpeta ya no existe y los que no dan un paso en `memory.orphanAfterMin` minutos en una carpeta sin cambio abierto, deja los demás, y la salida dice cuántos borró.
- AC2: CUANDO se ejecuta `specty prune` y hay mensajes de un cambio que ya no está abierto ENTONCES los borra y la salida nombra ese cambio; los mensajes de un cambio abierto quedan.
- AC3: CUANDO un cambio se archiva, cerrado o cancelado ENTONCES sus mensajes sin recoger se borran.
- AC4: CUANDO `prune` borra solo actividad o mensajes ENTONCES su salida lo dice, en español y en inglés, y no dice que no había nada que limpiar.

## Diseño

- Core, `cards/parallel.ts`: `pruneCard` acepta `activity` (cuántos registros) y `messages` (los cambios), opcionales, con las secciones «ACTIVIDAD BORRADA» y «MENSAJES BORRADOS».
- CLI, `store/activity.ts`: `removeActivity(git, stale)`, que borra los registros que `stale` señala y dice cuántos.
- CLI, `store/messages.ts`: `dropMessages(git, id)` y `messageChanges(git)`, los cambios con mensajes.
- CLI, `flow/prune.ts`: `pruneLive(session)`, con los cambios abiertos de `locateChanges` y sus carpetas.
- CLI, `commands/prune.ts`: pasa lo que borró a la tarjeta.
- CLI, `flow/finish.ts`: `archive` borra los mensajes del cambio.

## Archivos

- modificar packages/core/src/cards/parallel.ts — la actividad y los mensajes borrados en la salida de `prune`
- crear packages/core/test/cards/prune-live.test.ts — la salida de `prune` con actividad y mensajes, en español y en inglés
- modificar packages/cli/src/store/activity.ts — borrar los registros de actividad que ya no sirven
- modificar packages/cli/src/store/messages.ts — borrar los mensajes de un cambio y saber qué cambios tienen
- modificar packages/cli/src/flow/prune.ts — qué actividad y qué mensajes ya no sirven
- modificar packages/cli/src/commands/prune.ts — la limpieza de la mitad viva de la memoria
- crear packages/cli/test/prune-live.test.ts — `prune` con actividad y mensajes, de punta a punta
- modificar packages/cli/src/flow/finish.ts — archivar un cambio borra sus mensajes
- crear packages/cli/test/messages-archive.test.ts — cerrar o cancelar un cambio borra sus mensajes
- modificar docs/formats.md — cuándo se borran la actividad y los mensajes
- modificar docs/ARCHITECTURE.md — lo que limpia `prune`

## Tareas

- [x] T1: La actividad y los mensajes en la salida de `prune`
  - files: packages/core/src/cards/parallel.ts, packages/core/test/cards/prune-live.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/prune-live.test.ts test/cards/parallel.test.ts && pnpm lint
- [x] T2: `prune` borra la actividad y los mensajes que ya no sirven
  - files: packages/cli/src/store/activity.ts, packages/cli/src/store/messages.ts, packages/cli/src/flow/prune.ts, packages/cli/src/commands/prune.ts, packages/cli/test/prune-live.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/prune-live.test.ts test/activity.test.ts test/prune.test.ts && pnpm typecheck && pnpm lint && pnpm exec knip
- [x] T3: Archivar un cambio borra sus mensajes
  - files: packages/cli/src/flow/finish.ts, packages/cli/test/messages-archive.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/messages-archive.test.ts test/message-delivery.test.ts && pnpm typecheck && pnpm lint && pnpm exec knip
- [x] T4: La documentación de la limpieza
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: Borrar la actividad de una conversación viva le quitaría a `status` quién lleva un cambio — solo se borra la que pasa de `memory.orphanAfterMin` sin un paso, que `status` ya trata como de nadie, y nunca la de una carpeta con un cambio abierto.
