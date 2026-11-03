---
kind: standard
follows:
  - 20261104-los-frentes-tienen-dueno
---

# Los frentes en el estado y en la tarjeta de inicio

## Objetivo

Tercer cambio de P33 (repartir el trabajo entre sesiones): la tarjeta sin cambio activo, que es también la de inicio de una sesión, muestra a la conversación que lleva un frente solo las siguientes entradas libres de ese frente, en su orden, y a las demás no les ofrece las entradas de los frentes que otra sesión lleva. `specty status` muestra los frentes con su dueño, también en su `--json`, para que la persona vea de un vistazo qué sesión lleva cada uno.

## Fuera de alcance

- Los frenos: que el guard rechace `new --resolves` de una entrada de un frente con dueño vivo de otra conversación, y el aviso de `propose` al tocar las rutas de otro frente. Son el cambio siguiente, que resuelve P33.
- Saber la conversación de los demás agentes cuando ejecutan `specty next` por su cuenta (Codex, Cursor, Gemini CLI, OpenCode, Antigravity, Devin): ninguno está comprobado; queda como pendiente.
- Que una conversación nueva de Claude Code tras un `/clear` herede el frente de la anterior: es otra conversación, y el frente sigue siendo de la vieja hasta `memory.orphanAfterMin`; queda como pendiente.
- Marcar en `specty status` cuál es el frente de quien lo ejecuta.
- Dividir `packages/cli/src/enforce/guard.ts` (P56) o `packages/core/src/cards/index.ts` (P2): este cambio no les añade líneas.

## Supuestos

- A1: Specty sabe qué conversación pide la tarjeta de dos formas. El guard la lee del evento de su hook (la tarjeta de inicio, la que vuelve tras compactar y la de cada turno). El comando la lee de su entorno cuando la herramienta del agente la dice: hoy solo Claude Code, con `CLAUDE_CODE_SESSION_ID`, que `agents/run.ts` ya lee para la auditoría y que coincide con el `session_id` de sus hooks. En los demás casos, la tarjeta es la de una conversación sin frente.
  - impacto: alto
- A2: Que la conversación salga del entorno no concede ningún permiso, porque solo elige qué entradas muestra la tarjeta. Los frenos del cambio siguiente los decide el guard, que sabe la conversación por el evento.
- A3: Una entrada libre sigue siendo una `open`. Las de un frente sin dueño vivo salen en la lista general, como hasta ahora.
- A4: El total de «Pendientes y mejoras abiertas» sigue contando todas, también las de los frentes.
- A5: `status` lista cada frente, tenga dueño o no, con sus entradas abiertas en el orden del frente (libres, tomadas o propuestas para descartar), como `specty front`. Sin frentes, la sección no sale y `fronts` es una lista vacía.

## Criterios de aceptación

- AC1: CUANDO la conversación que pide la tarjeta sin cambio activo lleva un frente con entradas libres (la tarjeta de inicio del guard, o `specty next` ejecutado por Claude Code) ENTONCES «MEMORIA DE SPECTY» dice que son las primeras libres de su frente y muestra hasta tres, en el orden del frente, sin ninguna de fuera de él.
- AC2: CUANDO la conversación que la pide no lleva ningún frente, o Specty no sabe cuál es, y algún frente tiene un dueño vivo ENTONCES las primeras libres no incluyen las entradas de esos frentes, y una línea los nombra y dice que `specty front` muestra quién los lleva.
- AC3: CUANDO el frente de la conversación no tiene entradas libres ENTONCES la sección lo dice y pide preguntarle a la persona qué sigue, sin mostrar entradas de otros frentes.
- AC4: CUANDO ningún frente tiene un dueño vivo y la conversación no lleva ninguno ENTONCES la tarjeta es la misma que antes de este cambio.
- AC5: CUANDO se ejecuta `specty status` y la memoria tiene frentes ENTONCES la sección «FRENTES» muestra cada uno con quién lo lleva y desde cuándo, o que está libre, y los ids de sus entradas abiertas en orden; sin frentes, la sección no sale.
- AC6: CUANDO se ejecuta `specty status --json` ENTONCES trae `fronts`, una lista con cada frente: `name`, `open` (los ids de sus entradas abiertas, en orden) y, si tiene un dueño vivo, `owner` con `tool` y `ago` en minutos.

## Diseño

- Core, `cards/fronts.ts`: `FrontsView` (`fronts`, `owners`: los `FrontOwner` vivos, y `own`: el frente de la conversación que pregunta, si Specty lo sabe).
- Core, `cards/memory.ts`: `memoryStartBlocks(entries, ctx, fronts?)`. Con `own`, las primeras libres son las de ese frente en su orden, o una línea que dice que no tiene ninguna. Sin `own`, quita de las libres las entradas de los frentes con dueño y añade la línea que los nombra si alguno lo tiene. Sin frentes con dueño ni `own`, nada cambia.
- Core, `cards/next.ts`: `NextView.fronts`, que pasa a `memoryStartBlocks`.
- Core, `cards/status.ts`: `statusCard(entries, ctx, memory, fronts?)` añade «FRENTES» tras «CAMBIOS ABIERTOS» y `fronts` a la salida (`StatusFront`: `name`, `open`, `owner?`).
- CLI, `agents/run.ts`: `agentSession(tool, env)`, la sesión que dice el agente (hoy, `CLAUDE_CODE_SESSION_ID` de Claude Code), que también usa `agentRun`.
- CLI, `session.ts`: `Session.conversation` (`tool` e `id`), de `agentSession` al abrir la sesión.
- CLI, `enforce/sessions.ts`: `enteredSession` le pone a la sesión que responde al evento la conversación del evento, así que las tarjetas del guard (`next`) la llevan sin tocar `guard.ts`.
- CLI, `commands/next.ts`: sin cambio activo, pasa a la tarjeta los frentes, sus dueños vivos (`liveHolds`) y el de `session.conversation`.
- CLI, `commands/status.ts`: pasa a `statusCard` los frentes y sus dueños vivos (`liveHolds`).

## Archivos

- modificar packages/core/src/cards/fronts.ts — `FrontsView`: los frentes, sus dueños vivos y el de la conversación
- modificar packages/core/src/cards/memory.ts — la tarjeta de inicio con el frente de la conversación y sin los frentes con dueño
- modificar packages/core/src/cards/next.ts — los frentes en la vista de `next` sin cambio activo
- crear packages/core/test/cards/front-start.test.ts — la memoria de la tarjeta de inicio con frentes, en español y en inglés
- modificar packages/core/src/cards/status.ts — la sección «FRENTES» y `fronts` en la salida de `status`
- crear packages/core/test/cards/status-fronts.test.ts — los frentes en `status`, en español y en inglés
- modificar packages/cli/src/agents/run.ts — la sesión que dice el agente en su entorno, aparte
- modificar packages/cli/src/session.ts — la conversación que ejecuta el comando
- modificar packages/cli/src/enforce/sessions.ts — la conversación del evento en la sesión que responde el guard
- modificar packages/cli/src/commands/next.ts — los frentes en la tarjeta sin cambio activo
- crear packages/cli/test/front-start.test.ts — la tarjeta de inicio con frentes, por el guard y por `specty next`
- modificar packages/cli/src/commands/status.ts — los frentes con su dueño en `status`
- crear packages/cli/test/front-status.test.ts — los frentes en `status` y en su `--json`, de punta a punta
- modificar docs/formats.md — los frentes en la tarjeta de inicio y en `status`
- modificar docs/ARCHITECTURE.md — «FRENTES» y `fronts` en `status`, y el frente en la tarjeta de inicio

## Tareas

- [x] T1: La tarjeta de inicio con los frentes
  - files: packages/core/src/cards/fronts.ts, packages/core/src/cards/memory.ts, packages/core/src/cards/next.ts, packages/core/test/cards/front-start.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/front-start.test.ts test/cards/memory-start.test.ts && pnpm typecheck && pnpm lint
- [x] T2: Los frentes en la tarjeta de `status`
  - files: packages/core/src/cards/status.ts, packages/core/test/cards/status-fronts.test.ts
  - ac: AC5, AC6
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/status-fronts.test.ts test/cards/status-holder.test.ts test/cards/status-turn.test.ts && pnpm typecheck && pnpm lint
- [ ] T3: La conversación que pregunta y su frente en `next`
  - files: packages/cli/src/agents/run.ts, packages/cli/src/session.ts, packages/cli/src/enforce/sessions.ts, packages/cli/src/commands/next.ts, packages/cli/test/front-start.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/front-start.test.ts test/memory-start.test.ts test/session-start.test.ts && pnpm typecheck && pnpm lint && pnpm exec knip
- [ ] T4: Los frentes con su dueño en `status`
  - files: packages/cli/src/commands/status.ts, packages/cli/test/front-status.test.ts
  - ac: AC5, AC6
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/front-status.test.ts test/status-json.test.ts test/memory-status.test.ts && pnpm typecheck && pnpm lint && pnpm exec knip
- [ ] T5: La documentación de los frentes en el estado y en el inicio
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC1, AC5, AC6
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: `next` sin cambio activo y `status` leen ahora los dueños de los frentes (un archivo por frente y el de actividad de cada dueño) — solo cuando la memoria tiene frentes, así que un repositorio sin ellos no paga nada.
- R2: Un agente que ejecuta `specty next` sin decir su conversación ve las entradas de su propio frente fuera de la lista, como si fuera de otro — la línea que nombra los frentes con dueño lo dice, y la tarjeta de inicio y la de tras compactar, que llegan por el guard, sí saben la conversación.
