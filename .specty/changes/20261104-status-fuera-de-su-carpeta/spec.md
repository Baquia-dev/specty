---
kind: standard
follows:
  - 20261104-conversacion-vuelve-a-su-carpeta
  - 20261104-reanudar-con-tarjeta
---

# status dice qué cambio tiene su conversación fuera de su carpeta

## Objetivo

Cuando una conversación de agente sale de la carpeta de su cambio (vuelve a la principal, se reanuda allí o hace `cd`), `specty status` deja de decir quién lleva ese cambio y, pasada una hora, lo llama huérfano, aunque la conversación siga viva en otra carpeta. Con este cambio, la línea de ese cambio dice que su conversación está fuera de su carpeta, qué agente y hace cuánto dio su último paso, y que `specty next` en esa conversación le dice cómo volver. Es el AC5 de la épica `20261104-sesiones-con-su-carpeta`.

## Fuera de alcance

- La UI: muestra estos datos en el corte C3 de la épica.
- Las carpetas perdidas y `specty restore`: son el corte C2.
- Nombrar la carpeta en la que está la conversación: la línea dice «en otra carpeta».
- Cambiar qué es un huérfano: `orphan` se calcula como hoy, y `next` sigue listando los huérfanos como hoy.
- Los pendientes de los cambios anteriores (dividir `cards/next.ts`, `cancel` con id desde la carpeta principal, `propose` con un `kind` distinto del estado, `specty init` en este repositorio): siguen en la memoria de Specty.

## Supuestos

- A1: La conversación de un cambio es la que su enlace (`sessions/<conversación>.json`, formats.md §1) ata a la carpeta del cambio, y su último paso es el que el guard anotó en `activity/<agente>-<conversación>.json`. El nombre de ese archivo junta el agente y la conversación; como el registro dice el agente, la conversación es lo que sigue a `<agente>-`.
  - impacto: alto
- A2: Una conversación cuenta como fuera solo si su último paso, en otra carpeta, fue hace como máximo `memory.orphanAfterMin` minutos. Así, una conversación que terminó hace tiempo, cuyos archivos siguen ahí, no marca el cambio: queda huérfano, como hoy.
- A3: Solo se marca un cambio que espera al agente, como los huérfanos. Una conversación que espera a la persona fuera de la carpeta (por ejemplo, tras salir para cerrar) no es una pérdida.
- A4: Si alguna conversación dio un paso en la carpeta del cambio en esos minutos, el cambio tiene quien lo lleve y no se marca, aunque otra conversación enlazada esté fuera. Si hay varias fuera, cuenta la del último paso.
- A5: Cómo retomarlo es `specty next` en esa conversación: desde el cambio `20261104-conversacion-vuelve-a-su-carpeta`, su tarjeta dice cómo volver con cada agente. La marca va en lugar de «lo lleva» o «huérfano» en la línea; en `status --json`, `away` va junto a `holder` y `orphan`, que no cambian.

## Criterios de aceptación

- AC1: CUANDO la conversación enlazada a la carpeta de un cambio abierto que espera al agente dio su último paso en otra carpeta hace como máximo `memory.orphanAfterMin` minutos, y nadie dio un paso en la carpeta del cambio en ese tiempo ENTONCES la línea de ese cambio en `specty status` dice que está fuera de su carpeta, el agente y hace cuánto, y que `specty next` en esa conversación dice cómo volver, en español y en inglés; y `status --json` lo da en `away`, con `tool` y `ago` en minutos.
- AC2: CUANDO una conversación dio un paso en la carpeta del cambio en esos minutos, la enlazada que volvió u otra ENTONCES la línea no dice que está fuera de su carpeta y dice quién lo lleva, como hoy.
- AC3: CUANDO el último paso de la conversación enlazada, en otra carpeta, pasa de `memory.orphanAfterMin` minutos, o el cambio espera a la persona ENTONCES la línea no dice que está fuera de su carpeta y `status --json` no trae `away`.

## Diseño

- Core (`cards/status.ts`): `StatusEntry.away?: { tool, ago }`. La línea, con `away`, dice «fuera de su carpeta: <agente> dio su último paso en otra carpeta <hace cuánto>; en esa conversación, `specty next` dice cómo volver» en lugar de lo que da `heldBy`.
- CLI: `readBindings` (`store/local.ts`) y `readActivity` (`store/activity.ts`) devuelven también la conversación de cada registro. `commands/status.ts` cruza los dos por conversación, compara las carpetas por su ruta real y añade `away` al cambio de la carpeta enlazada.
- Docs: ARCHITECTURE §6 (lo que dice `status` y el `away` de `status --json`) y formats.md §1 (`status` también lee `sessions/`).

## Archivos

- modificar packages/core/src/cards/status.ts — `away` en `StatusEntry` y su texto en la línea, en español y en inglés
- modificar packages/cli/src/store/local.ts — `readBindings` con la conversación de cada enlace
- modificar packages/cli/src/store/activity.ts — `readActivity` con la conversación de cada registro
- modificar packages/cli/src/commands/status.ts — `away` de cada cambio abierto
- crear packages/core/test/cards/status-away.test.ts — el texto de la marca en la línea, en español y en inglés
- crear packages/cli/test/status-away.test.ts — `status` y `status --json` con la conversación fuera, de vuelta, vieja o con un cambio que espera a la persona
- modificar docs/ARCHITECTURE.md — la marca en `status` y `away` en `status --json`
- modificar docs/formats.md — `status` lee también `sessions/`

## Tareas

- [x] T1: La marca «fuera de su carpeta» en la línea de `status`
  - files: packages/core/src/cards/status.ts, packages/core/test/cards/status-away.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/status-away.test.ts test/cards/status-holder.test.ts && pnpm typecheck && pnpm lint
- [ ] T2: `status` cruza los enlaces con los últimos pasos, y la documentación
  - files: packages/cli/src/store/local.ts, packages/cli/src/store/activity.ts, packages/cli/src/commands/status.ts, packages/cli/test/status-away.test.ts, docs/ARCHITECTURE.md, docs/formats.md
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/status-away.test.ts test/activity.test.ts test/session-return.test.ts test/prune.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: `status` lee además los enlaces de todas las conversaciones, también las que terminaron. Mitigación: son archivos pequeños en la carpeta común de git, que `next` y `prune` ya leen; solo se cruzan con las carpetas de los cambios abiertos.
- R2: Una conversación que salió a propósito de su carpeta marca su cambio durante `memory.orphanAfterMin` minutos. Mitigación: es la regla de un cambio por sesión que el guard ya aplica, y la marca desaparece en cuanto alguien da un paso en la carpeta del cambio.
