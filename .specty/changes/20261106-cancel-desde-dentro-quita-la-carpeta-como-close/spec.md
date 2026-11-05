---
kind: standard
---

# cancel desde dentro quita la carpeta como close

## Objetivo

Hoy, cuando el agente cancela en modo delegado desde la carpeta del cambio, `specty cancel` la deja, porque el agente trabaja en ella, y su SIGUIENTE no le dice que salga. `close`, en cambio, la quita y le pide salir, y, si era un corte de una épica abierta, volver a la épica. Con este cambio, `cancel` hace lo mismo que `close` (P183): quita la carpeta cuando nada se pierde y le pide al agente salir de ella y seguir en la carpeta principal o volver a su épica.

## Fuera de alcance

- La persona que cancela, desde dentro o desde fuera: sigue como hasta ahora.
- Quitar una carpeta con algo sin commit, o la rama del cambio cancelado.
- Cambiar los textos de las tarjetas: se usan los de `close` y los que ya tiene `cancel`.

## Supuestos

- A1: Cuando el agente cancela desde dentro de la carpeta, las sesiones que el guard ligó a ella no la retienen, como en `close`: entre ellas está la del propio agente, y no todas las herramientas le dicen a Specty qué conversación ejecuta el comando. Si quien cancela es la persona, o el agente desde otra carpeta, una sesión ligada en el último día sigue reteniéndola.
  - impacto: alto
- A2: Si la carpeta tiene algo sin commit, se queda, la tarjeta lo dice como hasta ahora, y el SIGUIENTE igualmente le pide al agente salir de ella, como `close` cuando git no puede quitarla.
- A3: La vuelta a la épica es la de `close` (`returnToEpic`): solo si la conversación que cancela está ligada a la carpeta del corte y la épica sigue abierta; entonces queda ligada a la carpeta de la épica.
  - impacto: alto

## Criterios de aceptación

- AC1: CUANDO el agente, en modo delegado, cancela desde dentro de la carpeta del cambio sin nada sin commit, también con su sesión ligada a ella por el guard, ENTONCES la carpeta ya no existe, la rama sigue con el cambio archivado, la tarjeta dice que la carpeta se eliminó y el SIGUIENTE le pide salir de ella, que ya no existe, y seguir en la carpeta principal, como el de `close`.
- AC2: CUANDO el agente cancela así desde dentro y la carpeta tiene algo sin commit ENTONCES la carpeta y lo que tiene se quedan, la tarjeta dice que tiene cambios sin commit, y el SIGUIENTE le pide salir de ella y seguir en la carpeta principal.
- AC3: CUANDO el cambio que el agente cancela desde dentro es un corte de una épica abierta y su conversación está ligada a la carpeta del corte ENTONCES el SIGUIENTE le pide salir y volver a la épica, como el de `close` de un corte, y la conversación queda ligada a la carpeta de la épica.

## Diseño

- `flow/land.ts`: de `landChange` sale `leaveChangeFolder(session, change, stays?)`, que quita la carpeta del cambio desde la principal, sin `--force`, y, si quien la deja es el agente desde dentro, prepara su vuelta a la épica y devuelve cómo sale (`left`). Con `stays`, la línea de por qué queda, no la quita. `close` la usa como hasta ahora.
- `flow/prune.ts`: `removeCancelled(session, id, branch)` devuelve la línea y `left`, y usa `leaveChangeFolder`. Para el agente que cancela desde dentro, las sesiones ligadas a la carpeta no la retienen; lo sin commit, sí.
- `commands/finish.ts`: `cancelConfirmed` pasa la línea a `cancelledCard` y, con `left`, pone el SIGUIENTE de `leaveFolderNext`, el de `close`.

## Archivos

- modificar packages/cli/src/flow/land.ts — `leaveChangeFolder`, compartido por `close` y `cancel`
- modificar packages/cli/src/flow/prune.ts — `removeCancelled` deja salir al agente que cancela desde dentro
- modificar packages/cli/src/commands/finish.ts — la tarjeta de `cancel` lleva el SIGUIENTE de salir de la carpeta
- modificar packages/cli/test/cancel-folder.test.ts — el agente que cancela desde dentro: la carpeta se va y sale de ella; el test anterior, que la dejaba, se sustituye
- modificar packages/cli/test/epic-return.test.ts — cancelar un corte desde dentro vuelve a la épica; el arranque del corte sale de `sliceReady` para reutilizarlo
- modificar docs/ARCHITECTURE.md — la limpieza (§9) y la vuelta a la épica (§10) cuentan que `cancel` hace como `close`

## Tareas

- [x] T1: cancel desde dentro quita la carpeta y pide salir, como close
  - files: packages/cli/src/flow/land.ts, packages/cli/src/flow/prune.ts, packages/cli/src/commands/finish.ts, packages/cli/test/cancel-folder.test.ts, packages/cli/test/epic-return.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/cancel-folder.test.ts test/epic-return.test.ts test/delegated-integration.test.ts test/prune.test.ts && pnpm typecheck && pnpm lint && pnpm knip

## Riesgos

- R1: Otro test cancela como agente desde la carpeta de un cambio y la sigue usando después — la verificación de la tarea corre los de `cancel`, `close` y `prune`; si falla otro en la aceptación, se pide su archivo con `specty scope add`.
