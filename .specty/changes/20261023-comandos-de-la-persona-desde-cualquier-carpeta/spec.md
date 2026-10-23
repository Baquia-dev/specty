---
kind: standard
---

# Comandos de la persona desde cualquier carpeta

## Objetivo

`approve`, `accept`, `close`, `cancel` y `reject` funcionan desde cualquier carpeta del repo. Buscan entre todas las worktrees el cambio que espera esa decisión. Si hay uno, actúan sobre él y dicen cuál es; si hay varios, preguntan cuál; y también aceptan el id del cambio. `status` muestra los cambios abiertos de todas las worktrees, con su carpeta. Hoy, para decidir hay que hacer `cd` a la worktree de cada cambio, y `status` solo ve la carpeta actual, incluidas las copias desactualizadas que una rama hereda de otra.

## Fuera de alcance

- Los comandos del agente: siguen actuando sobre el cambio de su carpeta y nunca preguntan.
- El modo delegado en la CLI, que lleva otra sesión.
- La UI.

## Supuestos

- A1: Un comando de la persona elige el cambio así: con `<id>`, ese; si el cambio de la carpeta actual espera esa decisión, ese; si en todo el repo solo uno la espera, ese, y la salida dice cuál es y en qué carpeta está; si la esperan varios, pregunta en la terminal cuál. La decisión que espera cada cambio es: para `approve`, la revisión de la spec (o, con `--scope S`, la solicitud S); para `reject --scope S`, la solicitud S; para `accept`, la aceptación; para `close`, un cierre enviado, o un cambio cerrado que no llegó a su rama destino; para `cancel`, cualquier cambio abierto.
  - impacto: alto
- A2: El comando se ejecuta en la carpeta del cambio (su worktree) y con su configuración, como si la persona hubiera hecho `cd` allí. Los commits, la incorporación y el borrado de la worktree ocurren igual que desde dentro.
  - impacto: alto
- A3: Los cambios abiertos son los de las ramas `specty/<id>` y `spike/<id>` que están en alguna worktree, más los de la carpeta actual sin rama propia (con `git.branchPerChange: false`). La copia de otro cambio que una rama heredó no cuenta, porque su estado real está en la worktree de ese cambio.
- A4: Si ningún cambio espera esa decisión, el comando lo dice y lleva a `specty status`.
- A5: `status` añade la ruta relativa de la carpeta de cada cambio que no es el de la carpeta actual, y dice «espera al agente» en lugar de «espera a el agente».

## Criterios de aceptación

- AC1: CUANDO desde la carpeta principal la persona ejecuta `approve` y un solo cambio está en revisión ENTONCES lo aprueba en su worktree, y la salida lo nombra con su carpeta.
- AC2: CUANDO varios cambios esperan esa decisión ENTONCES la terminal pregunta cuál, mostrando su id, su fase y su título; con `<id>`, actúa sobre ese sin preguntar.
- AC3: CUANDO desde la carpeta principal la persona ejecuta `accept` o `close` ENTONCES actúa sobre el cambio que lo espera, en su worktree, y `close` lo incorpora y borra esa worktree como desde dentro.
- AC4: CUANDO ningún cambio espera esa decisión ENTONCES el comando dice que ningún cambio espera `<acción>`, y el SIGUIENTE lleva a `specty status`.
- AC5: CUANDO la persona ejecuta `status` desde cualquier carpeta ENTONCES ve los cambios abiertos de todas las worktrees, con la carpeta de los que no son el de la carpeta actual y sin las copias heredadas, y el SIGUIENTE nombra la decisión pendiente aunque esté en otra carpeta.
- AC6: CUANDO un agente (sin terminal) ejecuta un comando de la persona ENTONCES se bloquea como antes, sin buscar en otras carpetas.

## Diseño

- `cards/human.ts` (core):
  - `StatusEntry.folder`, opcional, va al final de la línea.
  - «espera al agente», «espera a ti».
  - El SIGUIENTE nombra la decisión del cambio actual o, si no la hay, la del primero que espera a la persona.
- `flow/changes.ts` (nuevo):
  - `openChanges(session)` recorre `git worktree list` y, por cada rama de cambio, abre una sesión en su carpeta (con su configuración) y carga allí el cambio. Suma los cambios sin rama de la carpeta actual y devuelve el cambio, su sesión y si es el de la carpeta actual.
  - `awaits(action, state, scope)` aplica A1.
- `commands/human.ts`: `personSession(session, action, { id, scope })` elige el cambio según A1 (con `terminal.choose` si hay varios) y devuelve la sesión de su carpeta, o la salida de A4. Si el cambio está en otra carpeta, lo anuncia con `terminal.note`. Sin terminal, devuelve la sesión actual, que bloqueará como siempre.
- `program.ts`: `approve`, `reject`, `accept`, `close` y `cancel` aceptan `[cambio]` y pasan por `personSession` antes de ejecutarse.
- `commands/status.ts`: usa `openChanges`.

## Archivos

- modificar packages/core/src/cards/human.ts — carpeta de cada cambio, «al agente» y la decisión pendiente de cualquier carpeta
- modificar packages/core/test/cards.test.ts — la tarjeta de estado
- crear packages/cli/src/flow/changes.ts — cambios abiertos de todas las worktrees y qué decisión espera cada uno
- modificar packages/cli/src/commands/status.ts — estado de todas las worktrees
- modificar packages/cli/src/commands/human.ts — elegir el cambio y su carpeta
- modificar packages/cli/src/program.ts — `[cambio]` y la elección en los comandos de la persona
- crear packages/cli/test/anywhere.test.ts — pruebas de punta a punta desde la carpeta principal
- modificar docs/ARCHITECTURE.md — §6: los comandos de la persona desde cualquier carpeta

## Tareas

- [x] T1: Estado de todas las worktrees
  - files: packages/core/src/cards/human.ts, packages/core/test/cards.test.ts, packages/cli/src/flow/changes.ts, packages/cli/src/commands/status.ts, packages/cli/test/anywhere.test.ts
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/anywhere.test.ts
- [x] T2: Las decisiones desde cualquier carpeta
  - files: packages/cli/src/flow/changes.ts, packages/cli/src/commands/human.ts, packages/cli/src/program.ts, packages/cli/test/anywhere.test.ts
  - ac: AC1, AC2, AC3, AC4, AC6
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/anywhere.test.ts test/flow.test.ts
- [x] T3: Documentar los comandos desde cualquier carpeta
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm check
  - type: docs

## Riesgos

- R1: La persona decide sobre un cambio distinto del que creía — la salida nombra el cambio y su carpeta, todos esos comandos piden confirmación antes de actuar y, con varios candidatos, la terminal pregunta.
- R2: Abrir una sesión por worktree hace más lento `status` con muchas worktrees — solo lee `state.json` y la spec de cada una, sin ejecutar nada.
- R3: El modo delegado de la otra sesión también toca los comandos de la persona — si al cerrar choca, el conflicto lo resuelve el agente en la worktree de este cambio, como ahora hace Specty.
