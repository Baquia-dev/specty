---
kind: standard
---

# Un panel de sesiones en la UI, con su consumo: los datos del servidor

## Objetivo

La persona no ve en un sitio qué sesiones de agente trabajan en el repositorio, en qué carpeta, desde cuándo y cuánto llevan gastado (séptimo punto acordado de la épica «Memoria de Specty»). Specty ya anota el primer y el último paso de cada conversación (`.git/common/specty/activity/`), y ccusage sabe lo que gastó cada sesión de Claude Code. Este cambio, la primera mitad del panel, da esos datos en `GET /api/sessions` del servidor de `specty ui`; la página «Sesiones» que los muestra va en un cambio que sigue a este.

## Fuera de alcance

- La página «Sesiones» de la UI: va en el cambio siguiente.
- El consumo de las sesiones que no son de Claude Code: ccusage solo se le pide a Claude Code, como al cerrar un cambio.
- Las sesiones de otros clones del repositorio.

## Supuestos

- A1: Una sesión es una conversación de agente con su archivo `activity/<agente>-<conversación>.json`; sigue viva si su último paso cae en `memory.orphanAfterMin`, como decide `status` quién lleva un cambio.
  - impacto: alto
- A2: El consumo de cada sesión de Claude Code es la suma del coste y los tokens de sus modelos en una sola llamada a `ccusage claude session --json --offline`; sin ccusage, o si falla, ninguna sesión trae consumo y lo demás no cambia.
  - impacto: alto

## Criterios de aceptación

- AC1: CUANDO se pide `GET /api/sessions` ENTONCES responde cada conversación con su agente, su conversación, la carpeta de su último paso (relativa a la principal), el cambio abierto de esa carpeta si lo hay, su primer y su último paso y si sigue viva, de la más reciente a la más antigua.
- AC2: CUANDO ccusage responde por una sesión de Claude Code ENTONCES esa sesión trae su consumo, con los tokens y el coste; sin ccusage, ninguna lo trae y la respuesta es la misma en lo demás.

## Diseño

- Core: `SessionView` (agente, conversación, carpeta, cambio, primer y último paso, viva, consumo) en `memory/sessions.ts`, exportada como tipo en `index.ts` y en `light.ts`, para que la UI la lea.
- CLI:
  - `store/activity.ts`: `readSessions(git)` da cada actividad con su conversación, leída del nombre del archivo.
  - `flow/usage.ts`: `sessionTotals(session)` pide a ccusage el informe de sesiones de Claude Code una vez y suma, por sesión, los tokens y el coste de sus modelos.
  - `server/sessions.ts`, nuevo: `sessionsView(session)` junta las sesiones, el cambio abierto de cada carpeta (`locateChanges`) y su consumo; `server/http.ts` lo sirve en `GET /api/sessions`.

## Archivos

- crear packages/core/src/memory/sessions.ts — `SessionView`
- modificar packages/core/src/index.ts — exporta `SessionView`
- modificar packages/core/src/light.ts — exporta `SessionView`
- modificar packages/cli/src/store/activity.ts — `readSessions`, cada actividad con su conversación
- modificar packages/cli/src/flow/usage.ts — `sessionTotals`, el consumo de cada sesión de Claude Code
- crear packages/cli/src/server/sessions.ts — `sessionsView`
- modificar packages/cli/src/server/http.ts — `GET /api/sessions`
- crear packages/cli/test/server/sessions.test.ts — la respuesta, con y sin ccusage
- modificar docs/ARCHITECTURE.md — `GET /api/sessions`

## Tareas

- [ ] T1: `SessionView`, el tipo que comparten el servidor y la UI
  - files: packages/core/src/memory/sessions.ts, packages/core/src/index.ts, packages/core/src/light.ts
  - ac: —
  - verify: pnpm typecheck && pnpm lint
  - type: chore
- [ ] T2: Las sesiones y su consumo, en `GET /api/sessions`
  - files: packages/cli/src/store/activity.ts, packages/cli/src/flow/usage.ts, packages/cli/src/server/sessions.ts, packages/cli/src/server/http.ts, packages/cli/test/server/sessions.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server/sessions.test.ts test/server/memory.test.ts test/activity.test.ts && pnpm typecheck && pnpm lint && pnpm exec knip
- [ ] T3: La documentación
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm lint
  - type: docs
