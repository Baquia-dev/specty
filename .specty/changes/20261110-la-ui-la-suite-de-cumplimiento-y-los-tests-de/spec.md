---
kind: standard
---

# La UI, la suite de cumplimiento y los tests de ejemplo dejan de nombrar Gemini CLI

## Objetivo

Tercero de los cambios consecutivos que retiran Gemini CLI, que Antigravity reemplaza (decisión de la persona del 2026-11-10: se quita todo, no se deshabilita). La UI deja de proponer `gemini` para retomar un cambio en su carpeta, la suite de cumplimiento (`evals/`) deja de ejecutar Gemini CLI, y los tests de core y del CLI que lo usaban de ejemplo pasan a otra herramienta, para que el cambio que quita su tipo y su módulo de agente no tenga que tocarlos.

## Fuera de alcance

- El módulo de agente de Gemini CLI, su registro, su fila de capacidades, su detección (`GEMINI_CLI` en `core/src/agents.ts`), sus textos de `init`, `doctor` y `uninstall`, y la protección de `.gemini/settings.json` en el guard: van en los cambios siguientes.
- Lo de Antigravity que comparte nombre con Gemini (`~/.gemini/antigravity-cli/`, `ANTIGRAVITY_GEMINI_DIR`, los modelos `gemini-…` de sus transcripciones y tests), que se queda.
- `stats/summary.test.ts`, que usa `gemini` como nombre cualquiera de una herramienta desconocida, no a Gemini CLI.

## Supuestos

- A1: Los ejemplos de los tests de core usaban Gemini CLI como «una herramienta sin cortes en subagentes que entra con `specty enter`»; Devin (Windsurf) cumple lo mismo (`subagentSlices: impossible`, entra con `specty enter`), así que los tests comprueban lo mismo con él.
  - impacto: medio
- A2: Que Specty reconozca las worktrees de otras herramientas dentro del repositorio no depende de su carpeta (git las lista), así que el test que creaba la de Gemini CLI en `.gemini/worktrees/` sirve igual con una carpeta de otra herramienta.
- A3: El cambio abierto «doctor y la suite de cumplimiento se quedan con los agentes habilitados» también toca `evals/`; si choca al incorporar main, se conservan las dos intenciones.

## Criterios de aceptación

- AC1: CUANDO la UI muestra cómo retomar un cambio que espera al agente sin una conversación en su carpeta ENTONCES no ofrece abrir Gemini CLI (`cd … && gemini`); Claude Code, Codex, OpenCode, Cursor y Antigravity CLI conservan su orden.
- AC2: CUANDO la suite de cumplimiento lista los agentes que puede ejecutar y cuenta sus transcripciones ENTONCES Gemini CLI no está entre ellos, y `GEMINI_CLI` ya no está entre las marcas de agente que quita del entorno.
- AC3: CUANDO se buscan en los tests de core y del CLI los ejemplos con Gemini CLI (`gemini-cli`, `GEMINI_CLI`, `.gemini/worktrees`) ENTONCES no queda ninguno fuera de los de su módulo de agente, que se van con él.
  - test: manual
- AC4: CUANDO se lee ARCHITECTURE ENTONCES la suite de cumplimiento y las worktrees de otras herramientas dentro del repositorio no nombran a Gemini CLI.
  - test: manual

## Diseño

- `ui/src/change/resume-hints.ts`: `OPEN_IN` sin la orden de Gemini CLI, como ya no la da `specty new`.
- `evals/src/agents.ts`: sin `gemini-cli` en `AgentId`, `ROUNDS` y `AGENTS`; `evals/src/repo.ts` y `evals/run/compliance.eval.ts`, sin la marca `GEMINI_CLI`.
- Tests de core: `epic`, `idle-subagents`, `orphans-subagents` y `rejoin` usan Devin (Windsurf) donde usaban Gemini CLI, o lo quitan de una lista que ya lo tenía.
- Tests del CLI: `worktrees.test.ts` crea la worktree en una carpeta de otra herramienta, `epic-subagents.test.ts` deja de nombrarlo en su spec de ejemplo y `support.ts` deja de quitar `GEMINI_CLI` del entorno.
- Las tareas son `chore` o `test` y no `refactor`: con `policy.tests: contract` un refactor no puede quitar aserciones.

## Archivos

- modificar packages/ui/src/change/resume-hints.ts — sin la orden de Gemini CLI
- modificar packages/ui/src/change/resume-hints.test.ts — las órdenes sin Gemini CLI
- modificar packages/ui/src/sessions/sessions-page.test.ts — la sesión de ejemplo es de Devin (Windsurf)
- modificar evals/src/agents.ts — la suite sin Gemini CLI
- modificar evals/src/repo.ts — sin la marca `GEMINI_CLI`
- modificar evals/run/compliance.eval.ts — sin la marca `GEMINI_CLI`
- modificar evals/test/report.test.ts — las transcripciones sin Gemini CLI
- modificar packages/core/test/cards/epic.test.ts — sin Gemini CLI entre las herramientas sin cortes
- modificar packages/core/test/cards/idle-subagents.test.ts — sin Gemini CLI entre las herramientas sin subagentes
- modificar packages/core/test/cards/orphans-subagents.test.ts — el ejemplo es Devin (Windsurf)
- modificar packages/core/test/cards/rejoin.test.ts — el ejemplo es Devin (Windsurf)
- modificar packages/cli/test/worktrees.test.ts — la worktree de otra herramienta, no la de Gemini CLI
- modificar packages/cli/test/epic-subagents.test.ts — la spec de ejemplo sin Gemini CLI
- modificar packages/cli/test/support.ts — sin quitar `GEMINI_CLI` del entorno
- modificar docs/ARCHITECTURE.md — la suite y las worktrees de otras herramientas sin Gemini CLI

## Tareas

- [x] T1: La UI deja de proponer Gemini CLI para retomar un cambio
  - files: packages/ui/src/change/resume-hints.ts, packages/ui/src/change/resume-hints.test.ts, packages/ui/src/sessions/sessions-page.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/change/resume-hints.test.ts --include src/sessions/sessions-page.test.ts
  - type: chore
- [ ] T2: La suite de cumplimiento deja de ejecutar Gemini CLI
  - files: evals/src/agents.ts, evals/src/repo.ts, evals/run/compliance.eval.ts, evals/test/report.test.ts, docs/ARCHITECTURE.md
  - ac: AC2, AC4
  - verify: pnpm --filter @baquia-dev/specty-evals exec vitest run test/report.test.ts
  - type: chore
- [ ] T3: Los tests de core usan otra herramienta de ejemplo
  - files: packages/core/test/cards/epic.test.ts, packages/core/test/cards/idle-subagents.test.ts, packages/core/test/cards/orphans-subagents.test.ts, packages/core/test/cards/rejoin.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/epic.test.ts test/cards/idle-subagents.test.ts test/cards/orphans-subagents.test.ts test/cards/rejoin.test.ts
  - type: test
- [ ] T4: Los tests del CLI dejan de nombrar Gemini CLI
  - files: packages/cli/test/worktrees.test.ts, packages/cli/test/epic-subagents.test.ts, packages/cli/test/support.ts, docs/ARCHITECTURE.md
  - ac: AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/worktrees.test.ts test/epic-subagents.test.ts && pnpm lint && pnpm typecheck && pnpm knip
  - type: test

## Riesgos

- R1: El cambio abierto sobre `doctor` y la suite de cumplimiento puede chocar en `evals/` y ARCHITECTURE al incorporar main. Mitigación: se resuelve conservando las dos intenciones.
