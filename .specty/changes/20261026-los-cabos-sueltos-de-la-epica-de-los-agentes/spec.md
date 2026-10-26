---
kind: standard
---

# Los cabos sueltos de la épica de los agentes

## Objetivo

La épica «Todos los agentes al nivel de Claude Code» dejó cuatro cosas sueltas, y este cambio las cierra:
- `uninstall` quita el guard de cada agente, pero no el hook de fin de turno que pone `check --install`, así que tras desinstalar el agente seguiría ejecutando `specty check` al terminar cada turno.
- Devin carga también los hooks de `.claude/`. Con Claude Code y Devin instalados, Devin ejecutaría el fin de turno de Claude Code además del suyo, y traería el informe dos veces.
- Fuera de un repositorio con Specty, `hook agent-stop` no responde nada, y Antigravity espera una respuesta en cada fin de turno.
- Al afinar las marcas de Antigravity, los archivos de `.agents/` (las skills de Codex, por ejemplo) dejaron de contar como archivos de agente al decidir si un proyecto es nuevo.

## Fuera de alcance

- Probar Cursor, Antigravity o Devin con la herramienta de verdad: su modelo va siempre por su servidor.
- Los hooks del usuario que dejó una versión anterior de Specty: `uninstall` ya los nombra y los deja ([ADR 0013](../../../docs/decisions/0013-specty-no-escribe-en-la-carpeta-del-usuario.md)).

## Supuestos

- A1: El hook de fin de turno que escribe `check --install` lleva siempre `hook agent-stop <agente>` en su comando, y vive en el mismo archivo que el guard: `Stop` en Claude Code, Codex y Devin, `stop` en Cursor y `AfterAgent` en Gemini CLI. El de OpenCode va dentro de su plugin, y el de Antigravity dentro del hook `specty`, que `uninstall` ya quita enteros.
- A2: Devin pone `DEVIN_PROJECT_DIR` en el entorno de los hooks que ejecuta, también los que carga de `.claude/`, según su documentación; Claude Code no la pone.
  - impacto: alto

## Criterios de aceptación

- AC1: CUANDO `specty uninstall` corre en un repositorio donde `check --install` puso el fin de turno de un agente ENTONCES lo quita junto con el guard, deja los demás hooks de la persona y borra el archivo si queda vacío.
- AC2: CUANDO Devin ejecuta los hooks de Claude Code (`DEVIN_PROJECT_DIR` en el entorno) ENTONCES el guard y el fin de turno de Claude Code no responden nada, y deciden los hooks de Devin.
- AC3: CUANDO `hook agent-stop` corre fuera de un repositorio con Specty para una herramienta que espera respuesta (Antigravity) ENTONCES responde lo que deja terminar el turno.
- AC4: CUANDO `specty init` corre en un repositorio sin código, salvo archivos de `.agents/` ENTONCES lo trata como un proyecto nuevo.

## Diseño

- `withoutAgentStop` (`install/agents.ts`) quita de un archivo de hooks las entradas cuyo comando lleva `hook agent-stop`, en `hooks` o en la raíz, y las listas que quedan vacías por eso. `removeAgentHooks` la aplica a los archivos de hooks JSON de los agentes.
- El contrato gana `borrowed`: si esos hooks corren dentro de otra herramienta que los carga como suyos, el guard y `agent-stop` callan. Claude Code lo es bajo Devin.
- `hook agent-stop` fuera de Specty imprime el `pass` del agente, si lo tiene.
- `isNewProject` cuenta `.agents/` como archivos de agente, además de las marcas de la tabla.

## Archivos

- modificar packages/cli/src/install/agents.ts — `withoutAgentStop` y los archivos donde vive el fin de turno
- modificar packages/cli/src/agents/index.ts — `removeAgentHooks` quita también el fin de turno
- modificar packages/cli/src/agents/adapter.ts — `borrowed` en el contrato
- modificar packages/cli/src/agents/claude-code.ts — sus hooks callan bajo Devin
- modificar packages/cli/src/enforce/guard.ts — no responde por un agente cuyos hooks corren en otra herramienta
- modificar packages/cli/src/enforce/agent-stop.ts — lo mismo para el fin de turno
- modificar packages/cli/src/enforce/entry.ts — `hook agent-stop` fuera de Specty da la respuesta que deja terminar
- modificar packages/cli/src/install/product.ts — `.agents/` en un proyecto nuevo
- modificar packages/cli/test/uninstall.test.ts — el fin de turno sale con el guard (AC1)
- modificar packages/cli/test/check-agent-stop.test.ts — Devin y Claude Code, y fuera de Specty (AC2, AC3)
- modificar packages/cli/test/enforce.test.ts — el guard de Claude Code bajo Devin (AC2)
- modificar packages/cli/test/new-project.test.ts — `.agents/` en un proyecto nuevo (AC4)
- modificar docs/ARCHITECTURE.md — `uninstall`, Devin con Claude Code y el fin de turno fuera de Specty (§10)

## Tareas

- [ ] T1: uninstall quita también el fin de turno
  - files: packages/cli/src/install/agents.ts, packages/cli/src/agents/index.ts, packages/cli/test/uninstall.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/uninstall.test.ts test/check-agent-stop.test.ts
- [ ] T2: Bajo Devin, los hooks de Claude Code no responden
  - files: packages/cli/src/agents/adapter.ts, packages/cli/src/agents/claude-code.ts, packages/cli/src/enforce/guard.ts, packages/cli/src/enforce/agent-stop.ts, packages/cli/test/check-agent-stop.test.ts, packages/cli/test/enforce.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-agent-stop.test.ts test/enforce.test.ts test/agents.test.ts
- [ ] T3: El fin de turno responde fuera de Specty a quien espera respuesta
  - files: packages/cli/src/enforce/entry.ts, packages/cli/test/check-agent-stop.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-agent-stop.test.ts test/hooks-entry.test.ts
- [ ] T4: Un proyecto con solo archivos de .agents sigue siendo nuevo
  - files: packages/cli/src/install/product.ts, packages/cli/test/new-project.test.ts, docs/ARCHITECTURE.md
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/new-project.test.ts test/antigravity.test.ts

## Riesgos

- R1: Si Devin no pusiera `DEVIN_PROJECT_DIR` en los hooks de `.claude/`, el fin de turno seguiría trayendo el informe dos veces. Mitigación: es lo que pasa hoy, sin bucle; nada empeora.
- R2: Una persona que ejecuta Claude Code con `DEVIN_PROJECT_DIR` en su entorno se quedaría sin sus hooks. Mitigación: Devin la pone para sus hooks, no para las terminales; ARCHITECTURE §10 lo dice.
