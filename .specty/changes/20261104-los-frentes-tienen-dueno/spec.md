---
kind: standard
follows:
  - 20261104-frentes-en-la-memoria
---

# Los frentes tienen dueño

## Objetivo

Segundo cambio de P33 (repartir el trabajo entre sesiones): una sesión de agente toma un frente con `specty front take <frente>` y queda como su dueño, para que otra sesión no tome el mismo; lo deja con `specty front free <frente>`, o queda libre solo cuando esa conversación pasa `memory.orphanAfterMin` minutos sin dar un paso. Como con `specty enter`, el dueño lo registra el guard de la herramienta del agente, que es quien sabe qué conversación ejecuta el comando, y `specty front` dice quién lleva cada frente.

## Fuera de alcance

- Mostrar los frentes con su dueño en `specty status` (y en su `--json`): es el cambio siguiente.
- Que la tarjeta de inicio muestre solo lo del frente de la sesión, y los frenos de `new --resolves` y `propose`: es el último cambio, que resuelve P33.
- Que `specty prune` borre los registros de dueños viejos: uno caducado no cuenta y el siguiente `take` lo reescribe.
- Compartir con `memory/entries.ts` la lectura del frontmatter de `memory/fronts.ts` (P53), y el tamaño de las listas de exportaciones (P2, P9).
- Borrar o renombrar un frente.

## Supuestos

- A1: El dueño es estado vivo y local, no de la rama de la memoria: un archivo `.git/common/specty/fronts/<frente>.json` por frente, con `front`, `tool`, `conversation` y `at`, que todas las carpetas del clon ven, como `activity/`.
  - impacto: alto
- A2: Solo el guard de la herramienta del agente registra al dueño, antes de que el comando corra, como con `specty enter`: el comando no sabe qué conversación lo ejecuta. Sin el guard (la terminal de la persona, o un agente sin los hooks de Specty), `front take` no registra a nadie y dice quién lleva el frente, si alguien lo lleva.
  - impacto: alto
- A3: Una conversación lleva como mucho un frente: al tomar otro, deja el que llevaba. Volver a tomar el suyo solo renueva la hora.
- A4: Un dueño sigue vivo mientras el último paso de su conversación (el de `activity/`) o la hora en que tomó el frente, lo más reciente, no pase de `memory.orphanAfterMin` minutos; después el frente está libre sin borrar nada.
- A5: El guard rechaza que la conversación de un agente tome o libere un frente con un dueño vivo de otra conversación, también en modo delegado, porque liberar el frente de otra sesión no es una de las decisiones que se delegan. La persona lo libera desde su terminal, donde el guard no corre.
- A6: `front free <frente>` borra el registro del frente, lo ejecute quien lo ejecute: el guard ya filtró a los agentes.
- A7: Un frente que no existe en la memoria no recibe dueño: el guard deja pasar el comando y este lo rechaza con la explicación que ya da `front assign`.

## Criterios de aceptación

- AC1: CUANDO la conversación de un agente con el guard ejecuta `specty front take <frente>` y nadie más lo lleva ENTONCES queda como su dueño (herramienta y conversación), deja el frente que llevaba, y la salida muestra el frente, quién lo lleva, sus entradas abiertas en orden y, como siguiente paso, crear el cambio de la primera libre con `--resolves`.
- AC2: CUANDO otra conversación lleva el frente y dio un paso en los últimos `memory.orphanAfterMin` minutos ENTONCES el guard rechaza `front take` y `front free` de ese frente, y dice quién lo lleva, desde cuándo y cómo liberarlo; pasado ese tiempo, el frente está libre y otra conversación lo toma.
- AC3: CUANDO se ejecuta `specty front free <frente>` (la conversación que lo lleva, o la persona en su terminal) ENTONCES el frente queda sin dueño y la salida lo dice, con quién lo llevaba.
- AC4: CUANDO se ejecuta `specty front` ENTONCES cada frente con un dueño vivo dice quién lo lleva y desde cuándo.
- AC5: CUANDO `front take` se ejecuta sin el guard, o `front take` y `front free` nombran un frente que no existe ENTONCES no se registra ningún dueño, y la salida dice quién lleva el frente o que nadie lo lleva, o que el frente no existe.

## Diseño

- Core, `guard/shell.ts`: `ShellAnalysis.fronts`, cada `specty front take|free <frente>` del comando (`{ action, name }`), como `enters`.
- Core, `cards/front-owners.ts` (nuevo): `FrontOwner` (`front`, `tool`, `ago` en minutos); `frontTakenCard(front, entries, owner, ctx)`, `frontFreedCard(front, owner, ctx)` y `frontHeldDenial(owner, action, lang, command)` (motivo y siguiente paso del rechazo del guard), en español y en inglés; reutiliza `heldBy` de `cards/status.ts` para «lo lleva X, hace N min».
- Core, `cards/fronts.ts`: `frontListCard(fronts, entries, ctx, owners = [])` añade «· lo lleva X, hace N min» a la línea del texto de cada frente con dueño.
- CLI, `store/activity.ts`: `conversationStep(git, tool, conversation)`, el último paso de una conversación.
- CLI, `store/front-owners.ts` (nuevo): `FrontHold` (`front`, `tool`, `conversation`, `at`); `holdFront` (escribe el suyo y borra los demás de esa conversación), `releaseFront`, y `liveHolds(git, now, limitMin)`, los dueños vivos con los minutos desde su último paso.
- CLI, `enforce/fronts.ts` (nuevo): `judgeFronts(session, tool, event, command, decision)`: con `fronts` en el análisis y una decisión que deja pasar, rechaza con la regla `memory` lo que pide un frente con dueño vivo de otra conversación y registra al dueño del último `take`; `enforce/guard.ts` lo llama en `beforeAction`.
- CLI, `commands/front.ts`: `front take <frente>` y `front free <frente>`; `front` pasa los dueños vivos a la lista.

## Archivos

- modificar packages/core/src/guard/shell.ts — reconoce `specty front take|free <frente>` en un comando
- modificar packages/core/test/guard/shell.test.ts — los frentes que nombra un comando
- crear packages/core/src/cards/front-owners.ts — lo que dicen `front take`, `front free` y el rechazo del guard
- modificar packages/core/src/cards/fronts.ts — el dueño de cada frente en `specty front`
- modificar packages/core/src/cards/status.ts — `heldBy` acepta solo el dueño y si es huérfano
- modificar packages/core/src/cards/index.ts — exporta las tarjetas de los dueños
- crear packages/core/test/cards/front-owners.test.ts — las tarjetas y el rechazo, en español y en inglés
- modificar packages/cli/src/store/activity.ts — el último paso de una conversación
- crear packages/cli/src/store/front-owners.ts — los registros de los dueños y cuáles siguen vivos
- modificar packages/cli/src/commands/front.ts — los comandos `front take` y `front free`, y los dueños en `front`
- crear packages/cli/test/front-owners.test.ts — tomar, liberar y listar frentes con dueño, de punta a punta
- crear packages/cli/src/enforce/fronts.ts — el guard ante `front take` y `front free`
- modificar packages/cli/src/enforce/guard.ts — llama al guard de los frentes antes de un comando de shell
- crear packages/cli/test/front-guard.test.ts — el guard registra al dueño y rechaza el frente de otra conversación
- modificar docs/formats.md — el registro `fronts/<frente>.json` y los comandos nuevos
- modificar docs/ARCHITECTURE.md — los comandos `front take` y `front free`

## Tareas

- [x] T1: Los frentes que nombra un comando de shell
  - files: packages/core/src/guard/shell.ts, packages/core/test/guard/shell.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/guard/shell.test.ts && pnpm lint
- [x] T2: Las tarjetas del dueño de un frente
  - files: packages/core/src/cards/front-owners.ts, packages/core/src/cards/fronts.ts, packages/core/src/cards/status.ts, packages/core/src/cards/index.ts, packages/core/test/cards/front-owners.test.ts
  - ac: AC1, AC2, AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/front-owners.test.ts test/cards/fronts.test.ts test/cards/status-holder.test.ts && pnpm typecheck && pnpm lint
- [x] T3: Los comandos `front take` y `front free`, y los dueños en `front`
  - files: packages/cli/src/store/activity.ts, packages/cli/src/store/front-owners.ts, packages/cli/src/commands/front.ts, packages/cli/test/front-owners.test.ts
  - ac: AC1, AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/front-owners.test.ts test/fronts.test.ts test/activity.test.ts && pnpm typecheck && pnpm lint && pnpm exec knip
- [x] T4: El guard registra al dueño y rechaza el frente de otra conversación
  - files: packages/cli/src/enforce/fronts.ts, packages/cli/src/enforce/guard.ts, packages/cli/test/front-guard.test.ts
  - ac: AC1, AC2, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/front-guard.test.ts test/enter.test.ts && pnpm typecheck && pnpm lint && pnpm exec knip
- [ ] T5: La documentación del dueño de un frente
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: El guard lee la rama de la memoria en cada comando con `front take` o `front free` — solo en esos, así que el resto de comandos no paga nada.
- R2: Una herramienta que no da el id de la conversación al guard no registra dueño — `front take` lo dice («nadie lo lleva»), como sin guard.
