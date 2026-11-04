---
kind: standard
---

# La tarjeta al empezar una sesión, también en Codex y Devin

## Objetivo

La tarjeta de Specty al empezar una sesión (la de `specty next`, con la memoria y los frentes cuando no hay cambio activo) solo llega en Claude Code. Codex manda `SessionStart` con `source` `startup`, `resume`, `clear`, `compact` o `fork`, y su matcher se aplica a `source`; Devin manda `SessionStart` con `source` `startup` o `resume`, y los dos añaden `additionalContext` al contexto del modelo. Con este cambio, Codex recibe la tarjeta al empezar, al reanudar, tras `/clear` y tras compactar, y Devin al empezar y al reanudar, como Claude Code.

## Fuera de alcance

- `fork` en Codex: una sesión bifurcada sigue sin tarjeta, como ahora.
- Cursor, OpenCode, Gemini CLI y Antigravity: siguen como están.
- Saber la conversación de Codex en `specty next` (`CODEX_THREAD_ID`), que es P57.

## Supuestos

- A1: Codex aplica el matcher de `SessionStart` a `source` como expresión regular, y su salida en texto o en `hookSpecificOutput.additionalContext` va al contexto del modelo (documentación de hooks de Codex).
  - impacto: alto
- A2: Devin manda `SessionStart` sin matcher, con `source` `startup` o `resume`, y añade el `additionalContext` de `hookSpecificOutput` con `hookEventName: "SessionStart"` (documentación de los hooks de ciclo de vida de Devin CLI, que comparten Devin Desktop y Devin CLI).
  - impacto: alto
- A3: Tres tests que ya existían fijan lo de antes y cambian con este cambio, a propósito: el matcher de Codex (`codex.test.ts`), su `kind` al empezar (`agents.test.ts`) y que sus otros inicios no añadían nada (`session-start.test.ts`).

## Criterios de aceptación

- AC1: CUANDO Codex manda `SessionStart` con `source` `startup`, `resume`, `clear` o `compact` en un repositorio con Specty ENTONCES el guard responde con lo que imprimiría `specty next`; con `fork`, no añade nada.
- AC2: CUANDO `specty init --tools codex` escribe el guard ENTONCES el matcher de su `SessionStart` admite `startup`, `resume`, `clear` y `compact`, y no `fork`; y `specty doctor` avisa, con el comando que lo arregla, si el `SessionStart` del guard no admite `startup`.
- AC3: CUANDO Devin manda `SessionStart` en un repositorio con Specty ENTONCES el guard responde con la tarjeta de `specty next` en `hookSpecificOutput.additionalContext`, con `hookEventName: "SessionStart"`; y `specty init --tools windsurf` escribe ese evento en `.devin/hooks.v1.json`.
- AC4: CUANDO Codex empieza una sesión de verdad con un modelo simulado ENTONCES la tarjeta de `specty next` llega a lo que lee el modelo.

## Diseño

- `agents/codex.ts`: `SessionStart: "^(startup|resume|clear|compact)$"`; `kind` da `compact` a esos cuatro `source`. `doctor` avisa `codex-startup` cuando el guard tiene `SessionStart` y ninguna de sus entradas admite `startup`, con `runsAtSessionStart` de `claude-code.ts`.
- `agents/windsurf.ts`: `SessionStart` sin matcher en sus eventos; `kind` le da `compact`; `card` responde con `hookSpecificOutput.additionalContext`.
- Core: el texto de `codex-startup` en `cards/doctor-agents.ts` y su código en `cards/doctor.ts`.
- La prueba E2E con Codex (`codex-e2e.test.ts`, que necesita Codex: `SPECTY_E2E_CODEX` o el PATH) comprueba que la tarjeta llega en las peticiones al modelo simulado.

## Archivos

- modificar packages/cli/src/agents/codex.ts — la tarjeta al empezar, reanudar y tras `/clear`, y su aviso de doctor
- modificar packages/cli/src/agents/windsurf.ts — `SessionStart` de Devin con la tarjeta
- modificar packages/core/src/cards/doctor.ts — el código `codex-startup`
- modificar packages/core/src/cards/doctor-agents.ts — el texto de `codex-startup`
- crear packages/core/test/cards/doctor-codex-startup.test.ts — el texto de `codex-startup` en español y en inglés
- crear packages/cli/test/session-start-codex.test.ts — la tarjeta de Codex al empezar, su instalación y el aviso de doctor
- crear packages/cli/test/session-start-devin.test.ts — la tarjeta de Devin al empezar y su instalación
- modificar packages/cli/test/session-start.test.ts — los otros inicios de Codex ya dan la tarjeta, salvo `fork`
- modificar packages/cli/test/codex.test.ts — el matcher nuevo de `SessionStart`
- modificar packages/cli/test/agents.test.ts — el `kind` de Codex al empezar
- modificar packages/cli/test/codex-e2e.test.ts — la tarjeta llega al modelo al empezar
- modificar docs/ARCHITECTURE.md — la tarjeta al empezar en Codex y Devin

## Tareas

- [x] T1: El aviso de doctor de Codex
  - files: packages/core/src/cards/doctor.ts, packages/core/src/cards/doctor-agents.ts, packages/core/test/cards/doctor-codex-startup.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/doctor-codex-startup.test.ts && pnpm lint && pnpm sources
- [x] T2: Codex recibe la tarjeta al empezar, reanudar y tras `/clear`
  - files: packages/cli/src/agents/codex.ts, packages/cli/test/session-start-codex.test.ts, packages/cli/test/session-start.test.ts, packages/cli/test/codex.test.ts, packages/cli/test/agents.test.ts, packages/cli/test/codex-e2e.test.ts
  - ac: AC1, AC2, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/session-start-codex.test.ts test/session-start.test.ts test/codex.test.ts test/agents.test.ts test/codex-e2e.test.ts && pnpm typecheck && pnpm lint
- [x] T3: Devin recibe la tarjeta al empezar y al reanudar
  - files: packages/cli/src/agents/windsurf.ts, packages/cli/test/session-start-devin.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/session-start-devin.test.ts test/windsurf.test.ts test/agents.test.ts && pnpm typecheck && pnpm lint
- [ ] T4: La documentación
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm lint
  - type: docs
