---
kind: standard
epic: 20261104-sesiones-con-su-carpeta
slice: C1
---

# La conversación que sale de su carpeta vuelve a ella

## Objetivo

Hoy, cuando una sesión de Claude Code vuelve a la carpeta principal (al reanudarla, tras compactar o tras un `cd`), `specty next` le dice «No hay un cambio activo» y le propone `specty new`. Lo dice aunque el guard guardó en qué carpeta entró. Con este cambio, `next` le dice a esa conversación cuál es su cambio y cómo volver, y `specty new` la enlaza a la carpeta que crea. Sin enlace, `next` lista los cambios que ninguna conversación lleva antes de proponer uno nuevo. Son los AC1, AC2 y AC4 de la épica.

## Fuera de alcance

- La tarjeta al reanudar (`SessionStart` con `resume`, AC3 de la épica) y la marca «fuera de su carpeta» en `status` (AC5): van en los dos cambios de la épica que siguen a este.
- Las carpetas de cambio que ya no existen y su recuperación: son el corte C2. Aquí, un enlace a una carpeta que no existe se ignora, como hoy.
- La UI: es el corte C3.
- Una conversación que está en la carpeta de otro cambio abierto: allí `next` sigue dando la tarjeta de ese cambio.

## Supuestos

- A1: El enlace es el archivo que el guard ya escribe al entrar (`common/specty/sessions/<conversación>.json`, `{ folder, at }`). `next` lo lee con la conversación de la sesión (`Session.conversation`), que en un comando de shell solo da Claude Code (`CLAUDE_CODE_SESSION_ID`) y en el guard da el evento. Solo cuenta si su carpeta existe y tiene un cambio abierto que no es el de la carpeta donde corre `next`.
  - impacto: alto
- A2: Con el enlace a un cambio abierto, la tarjeta sin cambio activo es la de volver a ese cambio, en lugar de la de crear uno, la de los cambios sin spec o la de la memoria. `SIGUIENTE:` dice cómo volver según el agente, con la misma regla de `specty new` (`carryOnText`): en Claude Code con los hooks de las worktrees, `EnterWorktree` con `name: "<id>"`; en un agente que entra con `specty enter`, ese comando; si no, cambiar allí la carpeta de trabajo o abrir allí un agente.
  - impacto: alto
- A3: `specty new` con carpeta propia enlaza la conversación que lo ejecuta, si su herramienta la dice, con la misma regla del guard al entrar (`sessionDenial`). La enlaza si no está enlazada a otro cambio abierto, o si ese cambio es la épica del cambio nuevo.
- A4: Un cambio sin conversación es el que `status` ya llama huérfano: espera al agente y no tuvo pasos ni escrituras de estado en `memory.orphanAfterMin` minutos (`openChanges`). `next` lista cada uno con su id, su fase, su título, su carpeta y cómo retomarlo, tras el texto de la tarjeta y antes de las exclusiones y la memoria, y sigue proponiendo `specty new` en `SIGUIENTE:`.

## Criterios de aceptación

- AC1: CUANDO una conversación de Claude Code enlazada a la carpeta de un cambio abierto ejecuta `specty next` en la carpeta principal, o el guard responde a su `SessionStart` allí ENTONCES la salida nombra ese cambio y su carpeta, y `SIGUIENTE:` le pide volver allí y no `specty new`.
- AC2: CUANDO una conversación cuya herramienta dice su id ejecuta `specty new` con carpeta propia ENTONCES queda enlazada a la carpeta del cambio nuevo, salvo que ya esté enlazada a otro cambio abierto que no sea su épica.
- AC3: CUANDO se ejecuta `specty next` sin cambio activo y sin enlace a un cambio abierto, y hay cambios huérfanos ENTONCES la salida los lista con su carpeta y cómo retomarlos, y `SIGUIENTE:` sigue con `specty new`.

## Diseño

- Core (`cards/`):
  - `rejoin.ts` (nuevo): `rejoinCard`, la tarjeta de volver al cambio de la conversación, y `orphansBlock`, el bloque de los cambios sin conversación.
  - `next.ts`: `NextView` gana `own` (el cambio de la conversación: id, título y carpeta, y si se entra por nombre) y `orphans`. Sin cambio activo, `own` da `rejoinCard`, y los huérfanos van tras el texto de la tarjeta.
  - `new.ts`: `carryOnText` se exporta con una entrada más pequeña (id, carpeta, agente y si entra por nombre), para que `rejoin.ts` lo reutilice.
- CLI:
  - `enforce/sessions.ts`: `conversationChange(session)`, el cambio abierto de la carpeta a la que está enlazada la conversación de la sesión; `bindNew(session, folder, epic)`, el enlace de A3.
  - `commands/next.ts`: los lee sin cambio activo; los huérfanos salen de `openChanges` (`commands/status.ts`), y si se entra por nombre, de `entersByName`.
  - `commands/new.ts`: llama a `bindNew` tras crear la carpeta.
- Docs: ARCHITECTURE §7 (la tarjeta de volver y los huérfanos) y formats.md §1 (`specty new` también escribe `sessions/`).

## Archivos

- crear packages/core/src/cards/rejoin.ts — la tarjeta de volver y el bloque de los huérfanos
- modificar packages/core/src/cards/next.ts — `own` y `orphans` en `NextView` y la tarjeta sin cambio activo
- modificar packages/core/src/cards/new.ts — exportar `carryOnText` con una entrada propia
- modificar packages/cli/src/enforce/sessions.ts — `conversationChange` y `bindNew`
- modificar packages/cli/src/commands/next.ts — el cambio de la conversación y los huérfanos
- modificar packages/cli/src/commands/new.ts — enlazar la conversación a la carpeta nueva
- crear packages/core/test/cards/rejoin.test.ts — los textos de volver y de los huérfanos, en español y en inglés
- crear packages/cli/test/session-return.test.ts — `next`, el `SessionStart` y `new` de punta a punta
- modificar docs/ARCHITECTURE.md — la tarjeta de volver y los huérfanos
- modificar docs/formats.md — `specty new` también escribe `sessions/`

## Tareas

- [x] T1: La tarjeta de volver y el bloque de los huérfanos
  - files: packages/core/src/cards/rejoin.ts, packages/core/src/cards/next.ts, packages/core/src/cards/new.ts, packages/core/test/cards/rejoin.test.ts
  - ac: AC1, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/rejoin.test.ts test/cards/new.test.ts test/cards/memory-start.test.ts && pnpm typecheck && pnpm lint
- [x] T2: `next` y `new` con el enlace de la conversación y los huérfanos, y la documentación
  - files: packages/cli/src/enforce/sessions.ts, packages/cli/src/commands/next.ts, packages/cli/src/commands/new.ts, packages/cli/test/session-return.test.ts, docs/ARCHITECTURE.md, docs/formats.md
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/session-return.test.ts test/sessions.test.ts test/session-start.test.ts test/enter.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: `next` sin cambio activo abre una sesión por worktree para buscar huérfanos, y lo hace en cada `SessionStart`. Mitigación: es lo mismo que hace `status`; solo ocurre sin cambio activo y sin enlace.
- R2: Una conversación que salió a propósito de su carpeta recibe la indicación de volver. Mitigación: es la regla de un cambio por sesión que el guard ya aplica, y la tarjeta dice que otra sesión puede llevar otro trabajo.

## Cierre

### Resumen

Una conversación que sale de la carpeta de su cambio ya no recibe «No hay un cambio activo» ni la propuesta de crear otro. Si está enlazada a la carpeta de un cambio abierto y pregunta desde otra, `specty next` le da la tarjeta «TU CAMBIO»: nombra el cambio y su carpeta, y dice cómo volver con la misma regla de `specty new`. El guard da esa tarjeta también en su `SessionStart`. `specty new` enlaza a la carpeta nueva la conversación que lo ejecuta, salvo que ya trabaje en otro cambio abierto que no sea la épica del nuevo. Sin enlace, la tarjeta sin cambio activo lista los cambios huérfanos con su carpeta y cómo retomarlos, antes de `specty new`. Cubre los AC1, AC2 y AC4 de la épica `20261104-sesiones-con-su-carpeta`.

### Desviaciones

- El corte C1 de la épica salía XL. Este cambio lleva su parte central. La tarjeta al reanudar (`SessionStart` con `resume` y su aviso de `doctor`, AC3 de la épica) y la marca «fuera de su carpeta» en `status` (AC5) van en los dos cambios de la épica que siguen.
- `bindNew` repite la condición de `sessionDenial` en lugar de llamarla, porque esa función no está en la API pública de core.

### Decisiones

- La tarjeta de volver gana a la de los cambios sin spec, la de la memoria y la lista de huérfanos: la conversación tiene un cambio, y lo primero es volver a él.
- Los huérfanos son los de `status` (`openChanges`), para que las dos salidas digan lo mismo.

### Pendientes

- `packages/core/src/cards/next.ts` tiene 301 líneas de código, una más que el aviso. Propuesta: llevar las tarjetas sin cambio activo (`noChangeCard`, `withoutSpecCard`, `skeletonCard`, `idleCard` y los textos de `specty new`) a un `cards/idle.ts` propio, que es una responsabilidad aparte de las tarjetas de cada fase.
- `specty cancel <id>` ejecutado desde la carpeta principal respondió «No hay un cambio activo» con un cambio abierto en su worktree (2026-11-04); dentro de la carpeta del cambio sí canceló. Revisar si las decisiones de la persona desde cualquier carpeta cubren `cancel` con id.
- `specty new` creó como `standard` un cambio cuya spec se cambió luego a `kind: epic`, y `propose` y `approve` lo aceptaron sin avisar: el cambio pasó a aceptación sin cortes. Que `propose` rechace un `kind` del frontmatter distinto del estado.
