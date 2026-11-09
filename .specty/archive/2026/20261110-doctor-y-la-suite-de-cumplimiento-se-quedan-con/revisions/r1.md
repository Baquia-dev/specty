---
kind: standard
---

# doctor y la suite de cumplimiento se quedan con los agentes habilitados

## Objetivo

Sigue a «La primera versión solo ofrece Claude Code y Antigravity», que dejó `init` con esos dos agentes (`ENABLED_AGENTS`). Ahora `specty doctor` tampoco habla de los agentes que esta versión no ofrece, salvo para avisar de que el guard de uno sigue instalado, y la suite de cumplimiento mide por defecto los habilitados; ARCHITECTURE §16 y §18 recogen la medición del 2026-11-09 con los dos.

## Fuera de alcance

- Las órdenes para retomar un cambio con cada agente en la UI (`packages/ui/src/change/resume-hints.ts`): quedan como están (P412).
- Quitar Gemini CLI: lo hace otro cambio en paralelo; aquí no se anuncia como «llegará más adelante» ni se añaden textos suyos.
- `specty check --install`, que sigue con las exclusiones y el fin de turno de cualquier agente que el repositorio usa.
- Comprobar los guards de los agentes deshabilitados: `doctor` solo dice que siguen ahí.

## Supuestos

- A1: Un agente deshabilitado «está instalado» cuando alguno de los archivos de hooks de `AGENT_HOOK_FILES` del repositorio tiene su guard (`guard --tool <id>`); sus archivos de marca solos (`.cursor`, `.codex`…) no cuentan.
  - impacto: alto
- A2: De un agente deshabilitado instalado, `doctor` da un aviso, que no lo pone en rojo, y no ejecuta sus comprobaciones: sus arreglos piden un `init --tools` que esta versión ya rechaza.
- A3: `doctor` lee los agentes ofrecidos del entorno (`offeredAgents`), como `init`, así que los tests de la CLI, que los ofrecen todos, siguen comprobando cada módulo como antes.
- A4: La suite de cumplimiento ejecuta Specty en proceso; para que `SPECTY_EVALS_AGENTS` pueda seguir nombrando un agente deshabilitado y medirlo antes de habilitarlo, su `specty` ofrece todos los agentes, como los tests de la CLI.

## Criterios de aceptación

- AC1: CUANDO `specty doctor` corre en un repositorio con archivos de un agente deshabilitado (por ejemplo `.cursorrules`) y sin su guard ENTONCES no dice nada de ese agente.
- AC2: CUANDO `specty doctor` corre en un repositorio donde el guard de un agente deshabilitado sigue instalado ENTONCES da un aviso, no un problema, en el idioma de Specty, que dice que esta versión aún no lo ofrece y en qué archivo sigue su guard, y no da sus comprobaciones.
- AC3: CUANDO la suite de cumplimiento corre sin `SPECTY_EVALS_AGENTS` ENTONCES mide solo Claude Code y Antigravity CLI; CUANDO la variable nombra agentes ENTONCES mide esos, también uno deshabilitado, cuyo `init` lo instala.
- AC4: CUANDO alguien lee ARCHITECTURE ENTONCES §10 dice qué hace `doctor` con los agentes deshabilitados, §16 trae la medición del 2026-11-09 (Claude Code y Antigravity CLI, 16 de 16 cumplidos) y §18 deja el criterio de salida de F3 como «estable con cada agente habilitado», cumplido.
  - test: manual

## Diseño

- Core: `DoctorLine` gana `{ code: "agent-disabled", tool, file }` (`cards/doctor.ts`), con su texto en es y en en `cards/doctor-agents.ts`.
- CLI: `guardFile(root, tool)` en `install/agents.ts`: el primero de `AGENT_HOOK_FILES` con el guard de ese agente. `doctor` (`commands/doctor.ts`) solo ejecuta las comprobaciones de los módulos ofrecidos que detecta y les pasa solo esos a `mcpDoctor`; de cada módulo no ofrecido con `guardFile`, añade el aviso.
- Evals: `agentsToRun(variable)` en `src/agents.ts` (los de `AGENTS` que nombra la variable o, sin ella, los de `ENABLED_AGENTS`), que usa `run/compliance.eval.ts`; `specty` de `src/repo.ts` pasa `agents` con todos los agentes.

## Archivos

- modificar packages/core/src/cards/doctor.ts — la línea `agent-disabled`
- modificar packages/core/src/cards/doctor-agents.ts — su texto en es y en
- crear packages/core/test/cards/doctor-disabled.test.ts — el texto del aviso (AC2)
- modificar packages/cli/src/install/agents.ts — `guardFile`
- modificar packages/cli/src/commands/doctor.ts — solo los ofrecidos; aviso de los deshabilitados instalados
- crear packages/cli/test/doctor-disabled.test.ts — `doctor` con agentes deshabilitados (AC1, AC2)
- modificar evals/src/agents.ts — `agentsToRun`
- modificar evals/run/compliance.eval.ts — usa `agentsToRun`
- modificar evals/src/repo.ts — Specty en proceso ofrece todos los agentes
- crear evals/test/agents-default.test.ts — los agentes que mide la suite (AC3)
- modificar docs/ARCHITECTURE.md — §10, §16 y §18

## Tareas

- [ ] T1: Core: el aviso de `doctor` de un agente deshabilitado instalado
  - files: packages/core/src/cards/doctor.ts, packages/core/src/cards/doctor-agents.ts, packages/core/test/cards/doctor-disabled.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/doctor-disabled.test.ts test/cards/doctor.test.ts
  - type: feat
- [ ] T2: CLI: `doctor` calla de los deshabilitados y avisa de los instalados
  - files: packages/cli/src/install/agents.ts, packages/cli/src/commands/doctor.ts, packages/cli/test/doctor-disabled.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/doctor-disabled.test.ts test/install.test.ts test/doctor-enter.test.ts
  - type: feat
- [ ] T3: Evals: la suite mide por defecto los agentes habilitados
  - files: evals/src/agents.ts, evals/run/compliance.eval.ts, evals/src/repo.ts, evals/test/agents-default.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-evals exec vitest run test/agents-default.test.ts && pnpm typecheck
  - type: feat
- [ ] T4: ARCHITECTURE: `doctor`, la medición del 2026-11-09 y el criterio de F3
  - files: docs/ARCHITECTURE.md
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/capabilities.test.ts
  - type: docs

## Riesgos

- R1: El cambio que quita Gemini CLI toca los mismos textos de `doctor` y ARCHITECTURE. Mitigación: las líneas nuevas van tras `enter-outdated` y no nombran a Gemini CLI; al incorporar main se conservan las dos intenciones.
