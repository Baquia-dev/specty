---
kind: standard
epic: 20261026-todos-los-agentes-al-nivel-de-claude-code
slice: C1
---

# Cada agente en su módulo

## Objetivo

Lo que Specty hace con cada agente está hoy repartido en ocho archivos, con ramas por herramienta (`tool === "cursor"`) en el guard, en el fin de turno, en `init`, en `check --install`, en `doctor` y en `uninstall`. Cada agente con guard pasa a tener un módulo en `packages/cli/src/agents/` con todo su protocolo: qué evento llega, cómo leer la acción, cómo responder, cómo vuelve tras el turno, qué instala, qué mira `doctor` y qué quita `uninstall`. Los demás archivos recorren esos módulos, así que los cortes siguientes de la épica añaden o cambian una herramienta tocando su módulo. Nada cambia para la persona ni para el agente.

## Fuera de alcance

- Cambiar lo que Specty decide, responde o instala con cualquier agente.
- Las exclusiones de `check --install` (`install-ignores.ts`), que también cubren herramientas sin guard.
- El puntero `CLAUDE.md`, que sigue en `install/project-files.ts` y lo escribe `init`; C11 lo generaliza para `GEMINI.md`.
- La tabla de capacidades, que es C2.
- Las rutas de los archivos de cada agente, `AGENT_HOOK_FILES`, `entersByName` y `codexHooksFile`, que siguen en `install/agents.ts` porque las usan `new`, las worktrees y la detección.

## Supuestos

- A1: Las pruebas actuales cubren por la CLI lo que hace cada agente (`enforce`, `cursor`, `codex`, `opencode`, `check-agent-stop`, `check-install`, `install`, `doctor` y `uninstall`), así que si pasan sin cambios el comportamiento es el mismo.
- A2: Cargar los módulos de los agentes desde el guard no lo hace más lento de forma apreciable, porque solo suman los ayudantes que escriben JSON y nada de lo que el test del bundle prohíbe (`commander`, los prompts, `program.ts`, el servidor e `init`); se mide la mediana del guard ante un `Bash` antes y después.
  - impacto: alto
- A3: Claude Code, Codex y OpenCode responden igual (salida 2 y el texto por stderr para bloquear o avisar, salida 1 si el guard falla), así que comparten una respuesta; Cursor tiene la suya, en JSON.
- A4: Que `uninstall` liste lo que quita agente por agente, y no en el orden de hoy, no cambia nada para la persona: las pruebas buscan cada línea, no su orden.

## Criterios de aceptación

- AC1: CUANDO se ejecutan las pruebas actuales del guard, del fin de turno, de `init`, de `check --install`, de `doctor` y de `uninstall` ENTONCES pasan sin cambiar lo que comprueban.
- AC2: CUANDO se busca en la CLI lo que Specty hace con Claude Code, Cursor, Codex u OpenCode ENTONCES está en su módulo de `packages/cli/src/agents/`, y el guard, el fin de turno, `check --install`, `init`, `doctor` y `uninstall` no tienen ramas por herramienta, salvo el puntero `CLAUDE.md` de `init`.
- AC3: CUANDO el módulo de un agente responde para permitir o bloquear una acción, avisar tras un comando o informar de un fallo del guard ENTONCES lo hace en la forma de su herramienta: código de salida y stderr en Claude Code, Codex y OpenCode, y JSON en Cursor.

## Diseño

- `agents/adapter.ts` define el contrato `AgentAdapter`:
  - `tool`, la herramienta;
  - `kind(event)`, que dice si el evento es `before`, `after`, `compact` o `worktree`;
  - `action(event)`, la acción, como hoy `toolAction`;
  - `reply(phase, verdict)`, `failed(message)` y `card(text)`, opcional, la respuesta en la forma de la herramienta;
  - `stop`, opcional, con `acts(event)`, `reply(message)` y dónde y cómo se instala su hook (`files` y `hook(command, timeout)`);
  - `install(context)`, que escribe sus archivos y devuelve las líneas de `init` (`done`, `warnings` y `written`);
  - `remove(root, files)` y `doctor(root)`;
  - `userFile(env)`, opcional, el guard en la carpeta del usuario, que `uninstall` deja y nombra.
- `agents/adapter.ts` también tiene `exitReply`, la respuesta por códigos de salida que comparten Claude Code, Codex y OpenCode.
- `agents/index.ts` tiene `ADAPTERS`, un `Record<GuardTool, AgentAdapter>` en el orden de hoy (Claude Code, Cursor, Codex y OpenCode), y `removeAgentHooks`. El tipo obliga a que cada agente con guard en `AGENT_CAPABILITIES` tenga su módulo.
- `agents/claude-code.ts`, `cursor.ts`, `codex.ts` y `opencode.ts` reúnen lo de cada uno, sacado de `enforce/actions.ts`, `enforce/guard.ts`, `enforce/agent-stop.ts`, `check/install-agents.ts`, `install/agents.ts`, `install/hooks.ts`, `commands/doctor.ts` y `commands/uninstall.ts`. El plugin de OpenCode sigue en `install/opencode.ts`, y su módulo lo instala desde allí.
- `enforce/actions.ts` se queda con lo común a todos: `GuardTool`, `RawAction`, `GuardReply` (que sale de `guard.ts`), `cwdOf` y `toolUseId`.
- `install/agents.ts` se queda con las rutas de los archivos de los agentes, `AGENT_HOOK_FILES`, `entersByName`, `codexHooksFile` y los ayudantes que escriben hooks en JSON (`withHooks`, `withoutEmpty`, `hasGuard` y `excludeLocally`); no importa ningún módulo de agente, así que no hay ciclos.
- Para no cambiar ninguna respuesta, el guard contesta como hoy cuando no hay sesión de Specty: con la forma de «permitir antes de una acción».

## Archivos

- crear packages/cli/src/agents/adapter.ts — el contrato de un agente y la respuesta por códigos de salida
- crear packages/cli/src/agents/index.ts — el registro de los agentes y `removeAgentHooks`
- crear packages/cli/src/agents/claude-code.ts — todo lo de Claude Code
- crear packages/cli/src/agents/cursor.ts — todo lo de Cursor
- crear packages/cli/src/agents/codex.ts — todo lo de Codex
- crear packages/cli/src/agents/opencode.ts — todo lo de OpenCode, salvo el texto de su plugin
- modificar packages/cli/src/enforce/actions.ts — se queda con lo común a todos los agentes
- modificar packages/cli/src/enforce/guard.ts — lee y responde por el módulo del agente
- modificar packages/cli/src/enforce/agent-stop.ts — el fin de turno por el módulo del agente
- modificar packages/cli/src/check/install-agents.ts — el hook de fin de turno que dice cada módulo
- modificar packages/cli/src/install/agents.ts — se queda con las rutas y los ayudantes comunes
- modificar packages/cli/src/install/hooks.ts — `init` instala por el módulo de cada agente
- modificar packages/cli/src/commands/doctor.ts — las comprobaciones de cada agente, por su módulo
- modificar packages/cli/src/commands/uninstall.ts — quita y nombra lo de cada agente por su módulo
- crear packages/cli/test/agents.test.ts — la respuesta de cada módulo, en la forma de su herramienta
- modificar docs/ARCHITECTURE.md — dónde vive cada agente (§10)
- modificar AGENTS.md — el mapa nombra `agents/`

## Tareas

- [ ] T1: El guard lee y responde a cada agente por su módulo
  - files: packages/cli/src/agents/adapter.ts, packages/cli/src/agents/index.ts, packages/cli/src/agents/claude-code.ts, packages/cli/src/agents/cursor.ts, packages/cli/src/agents/codex.ts, packages/cli/src/agents/opencode.ts, packages/cli/src/enforce/actions.ts, packages/cli/src/enforce/guard.ts, packages/cli/test/agents.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/agents.test.ts test/enforce.test.ts test/cursor.test.ts test/codex.test.ts test/opencode.test.ts test/bundle.test.ts
  - type: refactor
  - notes: Medir la mediana del guard ante un `Bash` (20 ejecuciones) con el `dist` de main y con el de la rama (A2).
- [ ] T2: El fin de turno por el módulo de cada agente
  - files: packages/cli/src/agents/adapter.ts, packages/cli/src/agents/claude-code.ts, packages/cli/src/agents/cursor.ts, packages/cli/src/agents/codex.ts, packages/cli/src/enforce/agent-stop.ts, packages/cli/src/check/install-agents.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-agent-stop.test.ts test/check-install.test.ts
  - type: refactor
- [ ] T3: init instala por el módulo de cada agente
  - files: packages/cli/src/agents/adapter.ts, packages/cli/src/agents/claude-code.ts, packages/cli/src/agents/cursor.ts, packages/cli/src/agents/codex.ts, packages/cli/src/agents/opencode.ts, packages/cli/src/install/agents.ts, packages/cli/src/install/hooks.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/install.test.ts test/codex.test.ts test/opencode.test.ts test/init-commit.test.ts test/init-reversible.test.ts
  - type: refactor
- [ ] T4: doctor y uninstall por el módulo de cada agente
  - files: packages/cli/src/agents/adapter.ts, packages/cli/src/agents/index.ts, packages/cli/src/agents/claude-code.ts, packages/cli/src/agents/cursor.ts, packages/cli/src/agents/codex.ts, packages/cli/src/agents/opencode.ts, packages/cli/src/install/agents.ts, packages/cli/src/commands/doctor.ts, packages/cli/src/commands/uninstall.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty test
  - type: refactor
- [ ] T5: La documentación dice dónde vive cada agente
  - files: docs/ARCHITECTURE.md, AGENTS.md
  - ac: —
  - type: docs

## Riesgos

- R1: Una respuesta cambia sin que ninguna prueba lo note, por ejemplo la de Cursor tras un comando fuera de un repositorio de Specty. Mitigación: AC3 fija en `agents.test.ts` la respuesta de cada módulo, y el guard conserva la forma de «permitir» de hoy cuando no hay sesión.
- R2: Otra sesión cambia el guard o la instalación mientras tanto. Mitigación: se incorpora `main` antes de cerrar y se vuelve a pasar `pnpm check`.
