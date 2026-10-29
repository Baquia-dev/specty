---
kind: standard
---

# AGENTS.md pide usar las herramientas MCP de Specty cuando el repositorio registra su servidor

## Objetivo

Con el servidor MCP de Specty registrado, el agente de VS Code ejecutaba `specty next` en la terminal en lugar de llamar a la herramienta `specty_next`. El bloque de flujo de AGENTS.md le dice que ejecute el comando, así que la vista del chat (MCP Apps) no salía. Si el repositorio registra el servidor, el bloque le pide además que use las herramientas `specty_*` en lugar de los comandos que hacen lo mismo, para que el chat muestre el cambio.

## Fuera de alcance

- Detectar servidores registrados en la carpeta del usuario (VS Code, Claude Desktop, Antigravity): Specty no escribe ni lee allí.
- Herramientas MCP para lo que decide la persona (aprobar, aceptar, cerrar): siguen en la terminal.
- Cambiar el bloque de los repositorios sin el servidor.

## Supuestos

- A1: El repositorio registra el servidor cuando el archivo MCP de proyecto de algún agente (los de `install/mcp.ts`) tiene una entrada `specty`, aunque ejecute otro comando, como un envoltorio de prueba. `init --mcp` escribe las entradas antes que AGENTS.md, así que la línea sale en la misma ejecución.
  - impacto: alto
- A2: La línea es condicional («si tienes las herramientas…»): un agente del mismo repositorio sin el servidor, como Codex sin su entrada, sigue con los comandos.
- A3: El bloque sin el servidor queda igual, con sus 15 líneas como mucho (los tests de hoy lo fijan); con el servidor tiene una línea más.

## Criterios de aceptación

- AC1: CUANDO se pide el bloque de flujo con el servidor MCP ENTONCES lleva, tras la primera línea, la que pide usar las herramientas `specty_*` en lugar de los comandos que hacen lo mismo, en español y en inglés; sin el servidor, el bloque es el de hoy.
- AC2: CUANDO `specty init` encuentra la entrada `specty` en el archivo MCP de algún agente del repositorio, o la acaba de escribir con `--mcp` ENTONCES AGENTS.md lleva esa línea; sin ninguna entrada, no la lleva.

## Diseño

- `flowBlock(lang, command, { mcp })` en core añade la línea tras la primera cuando `mcp` es verdadero.
- `install/mcp.ts` exporta `mcpInRepo(root)`, que dice si el archivo de algún agente tiene la entrada `specty`.
- `install/install.ts` registra el servidor antes de escribir los archivos del proyecto y le pasa a `writeAgentsMd` si el repositorio lo tiene: lo que acaba de escribir o lo que ya estaba.

## Archivos

- modificar packages/core/src/agents-md.ts — la línea de las herramientas MCP en el bloque de flujo
- modificar packages/core/test/agents-md.test.ts — AC1
- modificar packages/cli/src/install/mcp.ts — `mcpInRepo`
- modificar packages/cli/src/install/install.ts — el servidor antes que AGENTS.md
- modificar packages/cli/src/install/project-files.ts — `writeAgentsMd` con el servidor
- modificar packages/cli/test/mcp-install.test.ts — AC2
- modificar docs/formats.md — §8: la línea con el servidor
- modificar docs/ARCHITECTURE.md — §6: lo que cambia en AGENTS.md al registrarlo

## Tareas

- [x] T1: El bloque de flujo pide usar las herramientas MCP si hay servidor
  - files: packages/core/test/agents-md.test.ts, packages/core/src/agents-md.ts, docs/formats.md
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/agents-md.test.ts test/cards.test.ts test/cards/language.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint
- [ ] T2: init escribe esa línea cuando el repositorio registra el servidor
  - files: packages/cli/test/mcp-install.test.ts, packages/cli/src/install/mcp.ts, packages/cli/src/install/install.ts, packages/cli/src/install/project-files.ts, docs/ARCHITECTURE.md
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/mcp-install.test.ts test/install.test.ts test/init-agents.test.ts && pnpm --filter @baquia-dev/specty typecheck && pnpm lint && pnpm knip

## Riesgos

- R1: Un agente sigue prefiriendo la terminal aunque tenga la herramienta. Mitigación: la línea lo pide de forma explícita y dice para qué, y en VS Code la persona puede nombrar la herramienta con `#`.
