---
kind: standard
---

# doctor avisa de las instalaciones de antes de specty enter

## Objetivo

La épica de `specty enter` cambió lo que `init` instala para cada herramienta: matchers con las lecturas, la carpeta de las worktrees en sus permisos, la regla de `cd` en Codex y el plugin de OpenCode que aplica la entrada reescrita. Una instalación anterior sigue funcionando, pero no lleva las acciones a la carpeta del cambio, o falla en ella. Con este cambio, `doctor` lo dice y pide `specty init`. Además, ARCHITECTURE §10 da por comprobado el plugin con la beta de OpenCode 2.

## Fuera de alcance

- Actualizar sola una instalación anterior: lo hace `specty init`, como hasta ahora.
- Los ajustes que van en git o que son de la persona: `init` no los toca y ya dice qué añadir, así que `doctor` no los da por anticuados.

## Supuestos

- A1: La beta de OpenCode 2 (`0.0.0-beta-202608110357`, la etiqueta `beta` de npm) carga el plugin por `setup`, y las seis pruebas de extremo a extremo de OpenCode pasan con ella, también la de `specty enter`. Comprobado el 2026-10-27.
- A2: Una instalación de antes de la épica se reconoce sin ambigüedad: el matcher de Specty no es el de ahora, falta la regla de `cd` de Codex, el plugin de OpenCode no manda `redirects`, o falta en unos ajustes locales la carpeta de las worktrees que `init` pone hoy.

## Criterios de aceptación

- AC1: CUANDO `doctor` encuentra el guard de una herramienta instalado antes de `specty enter` ENTONCES lo dice con el archivo y pide `specty init --tools <herramienta>`, y sale con 1. Vale para Gemini CLI, OpenCode, Codex, Antigravity, Devin y Cursor.
- AC2: CUANDO la instalación es la que escribe `init` hoy ENTONCES `doctor` no dice nada de esto.
- AC3: CUANDO unos ajustes de la herramienta van en git o son de la persona ENTONCES `doctor` no los da por anticuados por la carpeta de las worktrees, que `init` no les pone.
- AC4: CUANDO se lee ARCHITECTURE §10 ENTONCES dice que el plugin de OpenCode está comprobado con OpenCode 1.19.4 y con la beta de OpenCode 2, y qué avisa `doctor`.

## Diseño

- Core gana la línea `enter-outdated`, con la herramienta y el archivo.
- `install/agents.ts` gana `guardMatcher`: el matcher de la entrada de Specty en un evento de unos hooks.
- Cada módulo de agente, en su `doctor`, añade `enter-outdated` cuando su guard está instalado y le falta algo de lo que pone hoy `init`:
  - Gemini CLI: su matcher de `BeforeTool`, y la carpeta de las worktrees en `context.includeDirectories` de unos ajustes que git no sigue.
  - OpenCode: `redirects` en el plugin, y `permission.external_directory` en un `.opencode/opencode.jsonc` que git no sigue.
  - Codex: la regla de `cd`, y `.codex/config.toml` cuando git no lo sigue y no es de la persona.
  - Antigravity, Devin y Cursor: su matcher; en Devin, también `Read(...)` en unos ajustes locales que git no sigue.

## Archivos

- modificar packages/core/src/cards/doctor.ts — la línea `enter-outdated`
- modificar packages/cli/src/install/agents.ts — `guardMatcher`
- modificar packages/cli/src/agents/gemini-cli.ts — su comprobación
- modificar packages/cli/src/agents/opencode.ts — su comprobación
- modificar packages/cli/src/agents/codex.ts — su comprobación
- modificar packages/cli/src/agents/antigravity.ts — su comprobación
- modificar packages/cli/src/agents/windsurf.ts — su comprobación
- modificar packages/cli/src/agents/cursor.ts — su comprobación
- crear packages/cli/test/doctor-enter.test.ts — cada herramienta, al día y anticuada
- modificar docs/ARCHITECTURE.md — §10

## Tareas

- [ ] T1: doctor dice qué instalación de Gemini CLI, OpenCode y Codex es de antes de specty enter
  - files: packages/core/src/cards/doctor.ts, packages/cli/src/install/agents.ts, packages/cli/src/agents/gemini-cli.ts, packages/cli/src/agents/opencode.ts, packages/cli/src/agents/codex.ts, packages/cli/test/doctor-enter.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/doctor-enter.test.ts
- [ ] T2: doctor dice lo mismo de Antigravity, Devin y Cursor
  - files: packages/cli/src/agents/antigravity.ts, packages/cli/src/agents/windsurf.ts, packages/cli/src/agents/cursor.ts, packages/cli/test/doctor-enter.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/doctor-enter.test.ts
- [ ] T3: ARCHITECTURE dice qué avisa doctor y que OpenCode 2 está comprobado
  - files: docs/ARCHITECTURE.md
  - ac: AC4
  - type: docs

## Riesgos

- R1: Un cambio futuro de un matcher volvería a dar por anticuadas las instalaciones de hoy. Mitigación: es lo que debe pasar: `doctor` compara con lo que escribe `init` en esa versión, y `init` lo arregla.
