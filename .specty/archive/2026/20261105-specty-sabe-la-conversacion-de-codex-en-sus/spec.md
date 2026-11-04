---
kind: standard
---

# Specty sabe la conversación de Codex en sus comandos

## Objetivo

Specty solo sabe en qué conversación corre un comando suyo cuando el agente es Claude Code (`CLAUDE_CODE_SESSION_ID`), así que en los demás agentes `specty next` muestra la tarjeta de una conversación sin frente aunque esa conversación lleve uno. Codex pone `CODEX_THREAD_ID` en el entorno de cada comando de shell, con el id del hilo que sus hooks mandan como `session_id`. Con este cambio Specty lo usa, y la documentación dice qué da cada agente.

## Fuera de alcance

- Cursor, Gemini CLI, OpenCode, Devin y Antigravity: ninguno documenta una variable con el id de su conversación en el entorno de los comandos del agente. Cursor la manda solo a sus hooks (`conversation_id`, por stdin), Gemini CLI solo a sus hooks (`GEMINI_SESSION_ID`), OpenCode no la pone (`OPENCODE_SESSION_ID` es una propuesta sin publicar) y Devin solo la manda por stdin. Siguen como hoy.
- Que el consumo de una sesión de Codex llegue a la auditoría: `agentRun` sigue siendo solo de Claude Code.

## Supuestos

- A1: Codex pone `CODEX_THREAD_ID` en el entorno de los comandos de shell del agente (desde 0.125), y es el mismo id que sus hooks mandan como `session_id`: el SDK de Codex reanuda un hilo con él, y el `session_id` de los hooks es el de la sesión, que es el hilo.
  - impacto: alto

## Criterios de aceptación

- AC1: CUANDO la conversación de Codex que tomó un frente ejecuta `specty next` sin cambio activo, con su `CODEX_THREAD_ID` ENTONCES la tarjeta le muestra solo las entradas libres de su frente, en su orden, como a Claude Code.
- AC2: CUANDO otra conversación de Codex ejecuta `specty next` ENTONCES no ve las entradas de ese frente.
- AC3: CUANDO Codex corre de verdad con un modelo simulado que ejecuta un comando de shell ENTONCES el `CODEX_THREAD_ID` de ese comando es el `session_id` que su hook mandó al guard.

## Diseño

- `agents/run.ts`: `agentSession` lee `CODEX_THREAD_ID` cuando la herramienta es Codex, con la misma regla de nombre sin separadores.
- La prueba con Codex de verdad (`codex-e2e.test.ts`, que necesita Codex: `SPECTY_E2E_CODEX` o el PATH) hace que el modelo ejecute `echo $CODEX_THREAD_ID` y compara la salida con la conversación que el guard anotó en `activity/codex-<id>.json`.

## Archivos

- modificar packages/cli/src/agents/run.ts — la conversación de Codex por `CODEX_THREAD_ID`
- crear packages/cli/test/front-start-codex.test.ts — la tarjeta de los frentes en Codex
- modificar packages/cli/test/codex-e2e.test.ts — `CODEX_THREAD_ID` es el `session_id` de los hooks
- modificar docs/ARCHITECTURE.md — qué variable da cada agente

## Tareas

- [x] T1: La conversación de Codex por `CODEX_THREAD_ID`
  - files: packages/cli/src/agents/run.ts, packages/cli/test/front-start-codex.test.ts, packages/cli/test/codex-e2e.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/front-start-codex.test.ts test/front-start.test.ts test/codex-e2e.test.ts test/audit-who.test.ts && pnpm typecheck && pnpm lint
- [x] T2: La documentación
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Cierre

### Resumen

Specty sabe en qué hilo de Codex corre un comando suyo por `CODEX_THREAD_ID`, como ya sabía la conversación de Claude Code por `CLAUDE_CODE_SESSION_ID` (`agentSession` en `agents/run.ts`). Así `specty next` le muestra a un hilo de Codex que tomó un frente solo las entradas libres de ese frente, en su orden, igual que la tarjeta que le da el guard al empezar. La documentación dice qué da cada agente: Cursor, Gemini CLI, OpenCode, Devin y Antigravity solo se lo dan a sus hooks, y allí `next` sigue mostrando la tarjeta de una conversación sin frente.

### Desviaciones

- La prueba E2E con Codex (AC3: el `CODEX_THREAD_ID` de un comando es el `session_id` de sus hooks) no se ejecutó aquí: Codex no está instalado y no se pudo instalar. Se salta sin `SPECTY_E2E_CODEX`.

### Decisiones

- Que `CODEX_THREAD_ID` sea el `session_id` de los hooks de Codex sale de su SDK, que reanuda un hilo con él, y de que los hooks mandan el id de la sesión, que es el hilo; la prueba E2E lo comprueba con Codex.
- El consumo de un hilo de Codex sigue sin ir a la auditoría: `agentRun` es solo de Claude Code.

### Pendientes

- Ejecutar con Codex la prueba E2E de `CODEX_THREAD_ID` (`SPECTY_E2E_CODEX=<codex> pnpm --filter @baquia-dev/specty exec vitest run test/codex-e2e.test.ts`), junto con la de P105.
