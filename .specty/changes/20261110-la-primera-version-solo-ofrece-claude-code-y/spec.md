---
kind: standard
---

# La primera versión solo ofrece Claude Code y Antigravity

## Objetivo

La primera versión publicada (0.1.0, beta pública) sale solo con Claude Code y Antigravity (la app y su CLI `agy`): `specty init` solo ofrece, detecta e instala esos dos, y la documentación lo dice. Codex, OpenCode, Cursor y Devin (Windsurf) quedan para más adelante: su código se queda, pero esta versión no los ofrece.

## Fuera de alcance

- `specty doctor` y la suite de cumplimiento (`evals/`) con los agentes habilitados, y ARCHITECTURE §16 y §18: van en el cambio siguiente, que sigue a este, para no pasar del tamaño L.
- Borrar los módulos, instaladores o tests de los agentes deshabilitados: su código se queda para cuando se habiliten.
- Quitar Gemini CLI: lo hace otro cambio en paralelo («Specty deja de soportar Gemini CLI, que reemplaza Antigravity»); aquí no se anuncia como «llegará más adelante».
- Las órdenes para retomar un cambio con cada agente en la UI (`packages/ui/src/change/resume-hints.ts`) y la de abrir la carpeta que da `specty new` al agente que lo ejecuta: quedan como están y se anotan como pendiente.
- `specty check --install`, que sigue añadiendo las exclusiones a los archivos de ignorar de cualquier agente que el repositorio usa, y sigue moviendo el fin de turno de los guards ya instalados.
- El guard: sigue entendiendo los hooks de todos los agentes con guard.

## Supuestos

- A1: Una sola lista dice qué agentes ofrece esta versión, `ENABLED_AGENTS` en `packages/core/src/capabilities.ts`, junto a la tabla de capacidades; la usan `init` y, en el cambio siguiente, `doctor` y la suite de cumplimiento. No se añade como campo de `AGENT_CAPABILITIES`, porque sus tests tratan cada campo, salvo `markers`, como una capacidad con estado.
  - impacto: alto
- A2: Para seguir probando los módulos deshabilitados, el entorno de la CLI (`Environment`) puede decir qué agentes se ofrecen (`agents`), como ya inyecta la terminal; sin él, son los de `ENABLED_AGENTS`. Los tests de la CLI (`cli` de `test/support.ts`) ofrecen todos; ningún usuario puede cambiarlo, porque no hay variable de entorno ni opción.
  - impacto: alto
- A3: `init --tools` rechaza cualquier nombre que esta versión no ofrece, deshabilitado o desconocido (hoy uno desconocido se ignora sin avisar), sin escribir nada.
- A4: GitHub Copilot, que no tiene guard, tampoco se ofrece en `init`: sigue con las capas 1, 3 y 4, que no dependen de lo que se elija.
- A5: `agentChoices` y `noAgentWarning` reciben los agentes ofrecidos, con `ENABLED_AGENTS` por defecto; sus tests de antes, que esperaban todos los agentes, pasan a esperar los habilitados o a pasar todos.

## Criterios de aceptación

- AC1: CUANDO `specty init` pregunta a una persona con qué agentes trabaja ENTONCES solo ofrece Claude Code y Antigravity, y de los detectados solo marca esos dos.
- AC2: CUANDO `specty init` corre sin nadie que responda en un repositorio con archivos de un agente deshabilitado (por ejemplo `.cursor`), o lo ejecuta un agente deshabilitado (por ejemplo Codex) ENTONCES no lo instala: instala el guard de Claude Code, con el aviso de que no detectó ningún agente que nombra solo `claude-code` y `antigravity`.
- AC3: CUANDO `specty init --tools` nombra un agente que esta versión no ofrece (por ejemplo `codex`, o uno desconocido) ENTONCES se niega sin escribir nada y dice, en el idioma de Specty, que esta versión solo ofrece Claude Code y Antigravity, que los demás agentes llegarán más adelante y con qué valores usar `--tools`.
- AC4: CUANDO `specty init --mcp` corre en un repositorio con archivos de un agente deshabilitado ENTONCES registra el servidor MCP solo en los agentes habilitados que instala.
- AC5: CUANDO `specty uninstall` corre en un repositorio con el guard de un agente deshabilitado ENTONCES lo quita, como antes.
- AC6: CUANDO alguien lee README.md, README.es.md, PRODUCT.md o ARCHITECTURE §10 ENTONCES ve que esta versión ofrece solo Claude Code y Antigravity y que Codex, OpenCode, Cursor y Devin (Windsurf) llegarán más adelante.
  - test: manual

## Diseño

- Core: `ENABLED_AGENTS: readonly AgentTool[]` (`["claude-code", "antigravity"]`) en `capabilities.ts`, exportada en `index.ts`. `agentChoices` y `noAgentWarning` reciben los agentes ofrecidos (por defecto, `ENABLED_AGENTS`). `InitRefusal` gana `{ reason: "unavailable-tools", tools, offered }`, con su tarjeta bloqueada en es y en en.
- CLI: `Environment.agents?` y `offeredAgents(environment)` en `session.ts`. `initCommand` separa `--tools` por comas y rechaza los nombres que no están entre los ofrecidos. `agentsToInstall` (`install/hooks.ts`) se queda de los detectados y del agente que lo ejecuta solo con los ofrecidos, y pasa los ofrecidos a la pregunta y al aviso; `init --mcp` recibe esa misma lista. La ayuda de `--tools` pone de ejemplo `claude-code,antigravity`.

## Archivos

- modificar packages/core/src/capabilities.ts — `ENABLED_AGENTS`, los agentes que ofrece esta versión
- modificar packages/core/src/index.ts — exporta `ENABLED_AGENTS` (lo usa cli)
- modificar packages/core/src/cards/init-questions.ts — la pregunta y el aviso de `init` solo con los ofrecidos
- modificar packages/core/src/cards/init.ts — la negativa de `init --tools` con un agente no ofrecido
- crear packages/core/test/enabled-agents.test.ts — tests de la lista y de los textos (AC1, AC2, AC3)
- modificar packages/core/test/cards/init.test.ts — la pregunta y el aviso ya no ofrecen todos los agentes
- modificar packages/cli/src/session.ts — `Environment.agents` y `offeredAgents`
- modificar packages/cli/src/commands/init.ts — rechaza en `--tools` lo que no se ofrece
- modificar packages/cli/src/program.ts — el ejemplo de la ayuda de `--tools`
- modificar packages/cli/test/support.ts — los tests de la CLI ofrecen todos los agentes
- crear packages/cli/test/init-tools.test.ts — `init --tools` con un agente no ofrecido (AC3)
- modificar packages/cli/src/install/hooks.ts — detecta, pregunta e instala solo los ofrecidos
- crear packages/cli/test/enabled-agents.test.ts — `init`, `init --mcp` y `uninstall` con los agentes de esta versión (AC1, AC2, AC4, AC5)
- modificar README.md — solo los dos agentes; los demás, más adelante
- modificar README.es.md — lo mismo en español
- modificar PRODUCT.md — los agentes con los que funciona
- modificar docs/ARCHITECTURE.md — §10 marca los habilitados

## Tareas

- [x] T1: Core: los agentes que ofrece esta versión, la pregunta, el aviso y la negativa de `init`
  - files: packages/core/src/capabilities.ts, packages/core/src/index.ts, packages/core/src/cards/init-questions.ts, packages/core/src/cards/init.ts, packages/core/test/enabled-agents.test.ts, packages/core/test/cards/init.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/enabled-agents.test.ts test/cards/init.test.ts
  - type: feat
- [ ] T2: CLI: `init --tools` rechaza los agentes que esta versión no ofrece
  - files: packages/cli/src/session.ts, packages/cli/src/commands/init.ts, packages/cli/src/program.ts, packages/cli/test/support.ts, packages/cli/test/init-tools.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/init-tools.test.ts test/uninstall.test.ts test/opencode-install.test.ts
  - type: feat
- [ ] T3: CLI: `init` solo detecta, pregunta e instala los agentes habilitados
  - files: packages/cli/src/install/hooks.ts, packages/cli/test/enabled-agents.test.ts
  - ac: AC1, AC2, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/enabled-agents.test.ts test/init-agents.test.ts test/mcp-install.test.ts && pnpm typecheck
  - type: feat
- [ ] T4: Documentación: los dos agentes de la 0.1.0
  - files: README.md, README.es.md, PRODUCT.md, docs/ARCHITECTURE.md
  - ac: AC6
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/capabilities.test.ts
  - type: docs

## Riesgos

- R1: Otro cambio quita Gemini CLI en paralelo y toca los mismos archivos (capacidades, README, ARCHITECTURE). Mitigación: las líneas nuevas van al final de cada lista y los textos no nombran a Gemini CLI; al incorporar main se conservan las dos intenciones.
- R2: Un test de la CLI que ejecuta `init` sin `cli` de `test/support.ts` y con un agente deshabilitado fallaría. Mitigación: los que construyen su entorno llaman a `installHooks`, que sigue instalando cualquiera; `accept` ejecuta la suite completa.
