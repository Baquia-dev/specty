---
kind: standard
---

# La UI avisa cuando ningún agente espera su decisión

## Objetivo

Hoy, si la persona aprueba, decide el alcance, pide cambios, acepta, ajusta o cierra desde la UI cuando el agente ya no espera (su `specty wait` agotó el tiempo o se cortó, o su conversación se cerró), no pasa nada y la UI no lo dice. «Cómo retomarlo» solo sale cuando el cambio lleva `memory.orphanAfterMin` minutos (60) huérfano. La épica `20261106-los-agentes-siempre-esperan-la-decision-de-la` ya hace que `specty wait` deje una marca mientras espera. Con este cambio, la UI lee esa marca y avisa en cuanto nadie retoma la decisión de la persona. Dice qué pasó (el `wait` agotó su tiempo, se cortó o no lo había) y qué hacer: escribir «sigue» en la conversación del agente si sigue abierta, o abrir otra en la carpeta del cambio.

## Fuera de alcance

- La marca de `specty wait` (`store/waits.ts`, `commands/wait.ts` y `waits/<id>.json` en `docs/formats.md` §1): la dio la épica, y este cambio solo la lee.
- La terminal de la persona: `specty approve`, `accept` y `close` no cambian su salida. La marca de la UI sale igual cuando la persona decide desde la terminal, porque se calcula con lo que queda escrito.
- `specty status`, `status --json`, la extensión de VS Code y la página de la memoria: no muestran el aviso.
- La verificación completa que lanza «Verificar» en la UI: no le pasa el turno al agente, así que no hay nada que retomar.
- Despertar al agente o reanudar su conversación desde la UI: Specty no puede escribir en la conversación de otra herramienta.

## Supuestos

- A1: «Nadie retoma la decisión» se calcula al leer el cambio, no en el momento de la acción, así que se mantiene al recargar la UI o reiniciar `specty ui`. Se cumple cuando se dan las cinco condiciones. Primera, el cambio espera al agente: está abierto y no espera a la persona (`isWaitingForHuman`, de `commands/wait.ts`), también si espera una incorporación. Segunda, la última decisión de la persona en su `audit.jsonl` (`actor: "human"` en `spec.approved`, `tests.approved`, `scope.decided`, `review.changes_requested`, `change.accepted`, `adjust.requested` o `change.closed`) no tiene después ninguna línea con `actor: "agent"`. Tercera, ningún `specty wait` de ese cambio está vivo. Cuarta, ninguno terminó recogiendo la decisión después de ella. Quinta, ninguna conversación de agente dio un paso en su carpeta (`activity/`) después de ella.
  - impacto: alto
- A2: La marca de `specty wait` la da la épica, y este cambio solo la lee con `readWait(git, id, now)` (`store/waits.ts`). Da la última marca del cambio, con su proceso, la herramienta del agente si la sabe (`tool`) y cuándo empezó (`since`): viva, o terminada con `ended: { at, reason }`, donde `reason` es `decided` (la persona decidió), `timeout` o `stopped` (se cortó). Un `wait` que vuelve enseguida porque nada esperaba a la persona no deja marca, así que cuenta como que no hubo `wait`.
  - impacto: medio
- A3: Si el agente sigue trabajando sin `specty wait` (por ejemplo, consulta `status` en bucle), su paso puede tardar hasta un minuto en anotarse (`activity/` se reescribe como mucho una vez por minuto). En ese minuto la UI puede avisar sin motivo, y el aviso desaparece en cuanto el paso se anota.
  - impacto: medio
- A4: El aviso va en el bloque «Cómo retomarlo» de la página del cambio, encima de las pestañas, con un texto que explica qué pasó y una línea que dice qué hacer, antes de las órdenes que ya tiene. Si el aviso aparece mientras la persona está en la página, sale también un aviso flotante (toast) que lo dice en una frase. En la Bandeja, la fila lleva la marca «Nadie retoma tu decisión», en el lugar de las marcas de huérfano y fuera de su carpeta, y antes que ellas.
  - impacto: medio
- A5: Una decisión que el agente toma en modo delegado (`actor: "agent"`) nunca deja el aviso: el agente está ahí.
  - impacto: bajo
- A6: Los textos del aviso van en la UI, en español y en inglés con `t()`, como los de «Cómo retomarlo»; la herramienta se nombra con su id (`claude-code`), como ya hace la marca de fuera de su carpeta. No dicen cómo espera cada herramienta, porque eso se lo dice al agente la tarjeta de `next` con `waitStep` (`packages/core/src/cards/wait.ts`): piden que el agente siga con `specty next`, y no lo contradicen.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO la persona aprueba, decide el alcance, pide cambios, acepta, ajusta o cierra desde la UI, el cambio queda esperando al agente y ningún `specty wait` de ese cambio está vivo ENTONCES el cambio que lee la UI lleva `unattended` con la hora de la decisión y, si hubo un `wait`, la herramienta, si terminó por `timeout` o se cortó (`stopped`) y hace cuántos minutos. Sin `wait`, lleva la última conversación que dio un paso en su carpeta, con su herramienta y hace cuántos minutos.
- AC2: CUANDO un `specty wait` vivo recoge la decisión, una conversación de agente da un paso en la carpeta del cambio después de ella, o el agente escribe en el registro después de ella ENTONCES el cambio no lleva `unattended`. Tampoco lo lleva CUANDO el cambio no espera al agente (sigue esperando a la persona, o está cerrado), ni CUANDO quien decidió fue un agente en modo delegado.
- AC3: CUANDO el cambio lleva `unattended` ENTONCES su página muestra «Cómo retomarlo» con lo que pasó: «el `specty wait` del agente (herramienta) agotó su tiempo hace N min», «… se cortó hace N min», «ningún agente esperaba tu decisión; la última conversación en su carpeta (herramienta) dio un paso hace N min» o «ninguna conversación trabaja en su carpeta». Debajo dice qué hacer: si la conversación del agente sigue abierta, escribirle «sigue» para que ejecute `specty next` y siga desde la decisión; si se cerró, abrir otra en la carpeta con una de las órdenes que se pueden copiar.
- AC4: CUANDO el aviso aparece mientras la persona está en la página del cambio ENTONCES sale un aviso flotante que dice que nadie retoma su decisión y que mire «Cómo retomarlo». CUANDO la página se abre con el aviso ya puesto ENTONCES no sale el aviso flotante.
- AC5: CUANDO un cambio de la Bandeja lleva `unattended` ENTONCES su fila muestra «Nadie retoma tu decisión», en lugar de las marcas de huérfano o fuera de su carpeta.
- AC6: CUANDO salen los textos nuevos ENTONCES salen en español y en inglés.

## Diseño

- CLI, la marca de `wait`: este cambio usa sin cambiarlos `readWait` (`store/waits.ts`) e `isWaitingForHuman` (`commands/wait.ts`), de la épica.
- CLI, `server/unattended.ts`, nuevo, porque `server/records.ts` ya tiene 384 líneas: `unattendedOf(session, entry, audit)` aplica A1 con `isWaitingForHuman`, `readWait`, `readActivity` y las carpetas reales, y da `{ since, wait?: { tool?, ended, ago }, holder?: { tool, ago } }`. `records.ts` lo añade a cada cambio abierto que espera al agente, junto a `orphan` y `away` (`holdsById`).
- UI, `data/records.ts`: `unattended` en `ChangeRecord` y `ChangeView`. `change/resume-hints.ts`: un `why` y una línea «qué hacer» para `unattended`, que tienen prioridad sobre `away` y huérfano. `change/change-page.ts`: muestra el bloque también con `unattended` y, con un `effect`, saca el aviso flotante cuando `unattended` pasa de no estar a estar en el mismo cambio. `inbox/inbox-row.ts`: la marca. `data/fixtures.ts`: un cambio de ejemplo con `unattended`.

## Archivos

- crear packages/cli/src/server/unattended.ts — si nadie retoma la última decisión de la persona, y qué pasó
- modificar packages/cli/src/server/records.ts — añade `unattended` a los cambios abiertos que esperan al agente
- crear packages/cli/test/server-unattended.test.ts — `unattended` tras una acción de la UI: con `wait` vivo, terminado, cortado o sin él, con un paso o una línea del agente después, delegado y sin esperar al agente
- modificar packages/ui/src/data/records.ts — `unattended` en el cambio que lee la UI
- modificar packages/ui/src/change/resume-hints.ts — qué pasó y qué hacer cuando nadie retoma la decisión
- modificar packages/ui/src/change/resume-hints.test.ts — los textos de `unattended`, en español y en inglés
- modificar packages/ui/src/change/change-page.ts — el bloque con `unattended` y el aviso flotante al aparecer
- crear packages/ui/src/change/change-page.unattended.test.ts — el bloque y el aviso flotante, que solo sale si aparece con la página abierta
- modificar packages/ui/src/inbox/inbox-row.ts — la marca «Nadie retoma tu decisión»
- modificar packages/ui/src/inbox/inbox-row.test.ts — la marca y su prioridad sobre las de huérfano y fuera de su carpeta
- modificar packages/ui/src/data/fixtures.ts — un cambio de ejemplo con `unattended`
- modificar docs/ARCHITECTURE.md — `unattended` en los cambios que lee la UI y el aviso de la UI cuando nadie retoma una decisión

## Tareas

- [x] T1: El cambio que lee la UI dice cuándo nadie retoma la decisión de la persona
  - files: packages/cli/src/server/unattended.ts, packages/cli/src/server/records.ts, packages/cli/test/server-unattended.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server-unattended.test.ts test/server-actions.test.ts
  - type: feat
- [x] T2: La página del cambio avisa y dice cómo seguir
  - files: packages/ui/src/data/records.ts, packages/ui/src/change/resume-hints.ts, packages/ui/src/change/resume-hints.test.ts, packages/ui/src/change/change-page.ts, packages/ui/src/change/change-page.unattended.test.ts
  - ac: AC3, AC4, AC6
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/change/resume-hints.test.ts --include src/change/change-page.unattended.test.ts --include src/change/change-page.test.ts
  - type: feat
- [x] T3: La Bandeja marca el cambio que nadie retoma
  - files: packages/ui/src/inbox/inbox-row.ts, packages/ui/src/inbox/inbox-row.test.ts, packages/ui/src/data/fixtures.ts
  - ac: AC5, AC6
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/inbox/inbox-row.test.ts --include src/data/fixtures.test.ts && pnpm typecheck && pnpm lint
  - type: feat
- [x] T4: La documentación cuenta el aviso de la UI cuando nadie retoma una decisión
  - files: docs/ARCHITECTURE.md
  - ac: AC1, AC3
  - verify: pnpm typecheck && pnpm lint && pnpm sources && pnpm knip
  - type: docs

## Riesgos

- R1: Leer la marca, la actividad y el registro de cada cambio abierto hace más lenta `/api/changes`. Solo se lee para los cambios que esperan al agente con una decisión de la persona como última línea del agente o la persona, y la actividad se lee una vez para todos.
- R2: El aviso sale sin motivo durante el minuto que tarda en anotarse el paso de un agente que trabaja sin `wait` (A3). El texto dice qué pasó, y desaparece solo.
- R3: Una marca cortada porque el proceso murió, con un `pid` que se reutilizó, parecería viva. `readWait` la da por cortada (`stopped`) en cuanto su archivo lleva más de 30 s sin renovarse.

## Cierre

### Resumen

El registro de cada cambio abierto que espera al agente lleva `unattended` cuando nadie retoma la última decisión de la persona: ninguna línea del agente después en la auditoría, ningún `specty wait` vivo ni uno que terminara `decided` después de ella, y ningún paso de una conversación en su carpeta después de ella (`server/unattended.ts`, que `holdsById` de `server/records.ts` añade junto a `orphan` y `away`). Da la hora de la decisión y, si el último `wait` agotó su tiempo o se cortó, su herramienta, cómo terminó y hace cuántos minutos; sin él, la última conversación que dio un paso en su carpeta. La UI lo lee (`data/records.ts`, `data/views.ts`). «Cómo retomarlo» dice qué pasó y qué hacer antes de las órdenes, con prioridad sobre las marcas de huérfano y fuera de su carpeta (`change/resume-hints.ts`). La página saca un aviso flotante cuando la marca aparece con ella abierta (`change/change-page.ts`), y la Bandeja dice «Nadie retoma tu decisión» en la fila (`inbox/inbox-row.ts`). Los textos van en español y en inglés. `docs/ARCHITECTURE.md` §15 lo cuenta. La marca de `wait` la dio la épica `20261106-los-agentes-siempre-esperan-la-decision-de-la`, y este cambio solo la lee.

### Desviaciones (respecto al plan)

- Pedir cambios deja el cambio en `review`, que el flujo da como esperando a la persona, y el test de AC1 lo esperaba como turno del agente. `unattendedById` cuenta también ese caso (`agentsTurn`), y para lo demás usa el `waitingFor` de `openChanges`, que sigue la misma regla que `isWaitingForHuman`, en vez de llamarla.
- `data/views.ts` entró con la solicitud S1, porque `deriveViews` es quien pasa `orphan` y `away` del registro a la vista.
- El cambio de ejemplo de `data/fixtures.ts` es un comando «Simular: nadie retoma tu decisión», que pone o quita `unattended` en el primer cambio en implementación, para no cambiar los datos de ejemplo que leen otros tests.

### Decisiones

- La marca de la Bandeja va en su propio elemento (`data-unattended`), en el lugar de la de huérfano o fuera de su carpeta, que no sale con ella.
- El aviso flotante sale solo cuando `unattended` pasa de no estar a estar en el mismo cambio: ni al abrir la página con la marca puesta ni al pasar a otro cambio que la tiene.
- Un paso de una conversación en la misma hora que la decisión cuenta como después de ella, para no avisar sin motivo.

### Pendientes

- P225: `specty wait`, el fin de turno y `status` no tratan «pedir cambios» como turno del agente.
- P226: `change-page.ts` y `packages/ui/src/data/records.ts` pasan del aviso de 300 líneas de código.
