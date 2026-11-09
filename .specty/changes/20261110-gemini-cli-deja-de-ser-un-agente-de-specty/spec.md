---
kind: standard
---

# Gemini CLI deja de ser un agente de Specty

## Objetivo

Cuarto de los cambios consecutivos que retiran Gemini CLI, que Antigravity reemplaza (decisión de la persona del 2026-11-10: se quita todo, no se deshabilita). Gemini CLI sale de los agentes que Specty conoce: su nombre, su detección por `GEMINI_CLI`, su fila de la tabla de capacidades con sus marcas (`.gemini`, `GEMINI.md`), su pista en la pregunta de `init`, su forma de esperar en `specty wait`, su módulo de agente con guard (`agents/gemini-cli.ts`) con sus tests, y los archivos que su instalación escribía. ARCHITECTURE y formats.md dejan de describir sus hooks, su sandbox, su `GEMINI.md` y su fin de turno.

## Fuera de alcance

- Los textos de core que solo usaba su módulo (`cards/install.ts`, los códigos de `doctor` de Gemini CLI en `cards/doctor.ts` y `cards/doctor-agents.ts`, la línea de `GEMINI.md` de `cards/uninstall.ts` y sus exportaciones), la línea de `uninstall` que nombra `GEMINI.md`, la protección de `.gemini/settings.json` en el guard y las notas de los ADR 0013 y 0018: van en el cambio siguiente.
- Lo de Antigravity que comparte nombre con Gemini (`~/.gemini/antigravity-cli/`, `ANTIGRAVITY_GEMINI_DIR`, los modelos `gemini-…`), que se queda.
- Las instalaciones de Gemini CLI que ya existan: Specty aún no está publicado y este repositorio no tiene `.gemini/`, así que no hay nada que limpiar.

## Supuestos

- A1: Sin la marca `GEMINI_CLI`, Specty trata los comandos de Gemini CLI como los de cualquier herramienta que no conoce: la detección del agente es de mejor esfuerzo y solo quita permisos (ARCHITECTURE §13), así que no guarda la marca de una herramienta que ya no soporta.
  - impacto: medio
- A2: `specty init --tools gemini-cli` ya lo rechaza desde que esta versión solo ofrece Claude Code y Antigravity (`ENABLED_AGENTS`); sin Gemini CLI entre los agentes, lo rechaza igual, como a cualquier herramienta que no ofrece.
- A3: Con `policy.tests: contract`, la última tarea de código ejecuta `pnpm typecheck`; las anteriores solo sus tests, porque quitar el tipo `gemini-cli` toca a la vez core, el CLI y sus tests.

## Criterios de aceptación

- AC1: CUANDO se listan los agentes que Specty conoce (sus nombres, la tabla de capacidades de ARCHITECTURE §10 y las respuestas posibles de `init`) ENTONCES Gemini CLI no está, y `.gemini` y `GEMINI.md` ya no son marcas de ningún agente.
- AC2: CUANDO un comando corre con `GEMINI_CLI=1` en su entorno ENTONCES Specty no lo atribuye a ningún agente, como con cualquier herramienta que no conoce.
- AC3: CUANDO el guard, `init`, `doctor` o `uninstall` recorren los módulos de agente con guard ENTONCES no hay uno de Gemini CLI, y `.gemini/settings.json` ya no está entre los archivos de hooks que `new` copia a la carpeta del cambio ni entre los del fin de turno.
- AC4: CUANDO se leen ARCHITECTURE y formats.md ENTONCES no describen los hooks de Gemini CLI, su sandbox, su `GEMINI.md`, su fin de turno ni su fila de la tabla de capacidades.
  - test: manual

## Diseño

- core `agents.ts`: sin `gemini-cli` en `AgentTool`, `AGENT_NAMES` ni `MARKS`. `capabilities.ts`: sin su fila; la tabla de ARCHITECTURE §10 se vuelve a pegar desde `capabilityTable("es")`. `cards/init-questions.ts`: sin su pista. `cards/wait.ts`: sin su forma de esperar.
- cli `agents/index.ts`: `ADAPTERS` sin Gemini CLI; se borra `agents/gemini-cli.ts`. `install/agents.ts`: sin `GEMINI_SETTINGS` en los archivos de hooks y del fin de turno. `install/project-files.ts`: `writePointer` deja de exportarse, porque solo lo usaba Gemini CLI fuera del archivo; `GEMINI_POINTER` sigue hasta que `uninstall` deje de usarlo en el cambio siguiente.
- Tests: `capabilities.test.ts` y `delegated.test.ts` sin Gemini CLI; `cards.test.ts` comprueba que `GEMINI_CLI=1` no da ningún agente; se borra `gemini-cli.test.ts`.
- Las tareas son `chore` y no `refactor`: retiran una función con sus tests, y con `policy.tests: contract` un refactor no puede quitar aserciones.

## Archivos

- modificar packages/core/src/agents.ts — sin `gemini-cli` en el tipo, los nombres ni las marcas del entorno
- modificar packages/core/src/capabilities.ts — sin la fila de Gemini CLI
- modificar packages/core/src/cards/init-questions.ts — sin su pista
- modificar packages/core/test/capabilities.test.ts — la tabla sin Gemini CLI
- modificar packages/core/src/cards/wait.ts — sin su forma de esperar
- modificar packages/core/test/cards/delegated.test.ts — las formas de esperar sin Gemini CLI
- modificar packages/core/test/cards.test.ts — `GEMINI_CLI=1` no da ningún agente
- modificar packages/cli/src/agents/index.ts — `ADAPTERS` sin Gemini CLI
- borrar packages/cli/src/agents/gemini-cli.ts — el módulo de agente de Gemini CLI
- modificar packages/cli/src/install/agents.ts — sin `GEMINI_SETTINGS`
- modificar packages/cli/src/install/project-files.ts — `writePointer` deja de exportarse
- borrar packages/cli/test/gemini-cli.test.ts — los tests de su módulo
- modificar docs/ARCHITECTURE.md — sin Gemini CLI en §10 ni en los hooks, los permisos, los punteros y el fin de turno
- modificar docs/formats.md — los archivos de hooks y el fin de turno sin Gemini CLI

## Tareas

- [x] T1: Gemini CLI sale de los agentes que conoce core y de la tabla de capacidades
  - files: packages/core/src/agents.ts, packages/core/src/capabilities.ts, packages/core/src/cards/init-questions.ts, packages/core/test/capabilities.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/capabilities.test.ts test/enabled-agents.test.ts
  - type: chore
- [x] T2: Specty deja de detectar Gemini CLI y de decirle cómo esperar
  - files: packages/core/src/cards/wait.ts, packages/core/test/cards/delegated.test.ts, packages/core/test/cards.test.ts, docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC2, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards.test.ts test/cards/delegated.test.ts test/cards/wait.test.ts
  - type: chore
- [x] T3: El CLI deja de tener el módulo de agente de Gemini CLI
  - files: packages/cli/src/agents/index.ts, packages/cli/src/agents/gemini-cli.ts, packages/cli/src/install/agents.ts, packages/cli/src/install/project-files.ts, packages/cli/test/gemini-cli.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/agents.test.ts test/worktrees.test.ts test/uninstall.test.ts && pnpm lint && pnpm typecheck && pnpm knip
  - type: chore

## Riesgos

- R1: El cambio abierto sobre `doctor` y la suite de cumplimiento puede chocar en ARCHITECTURE al incorporar main. Mitigación: se resuelve conservando las dos intenciones, y la tabla de §10 se vuelve a pegar desde `capabilityTable("es")`.
