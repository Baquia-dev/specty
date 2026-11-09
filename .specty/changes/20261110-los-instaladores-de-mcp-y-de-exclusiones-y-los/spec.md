---
kind: standard
---

# Los instaladores de MCP y de exclusiones y los tests del CLI dejan de usar Gemini CLI

## Objetivo

Segundo de los cambios consecutivos que retiran Gemini CLI, que Antigravity reemplaza (decisión de la persona del 2026-11-10: se quita todo, no se deshabilita). `specty init --mcp` deja de registrar el servidor MCP de Specty en `.gemini/settings.json` y `specty check --install` deja de escribir `.geminiignore`. Los tests del CLI dejan de instalar Gemini CLI o de usarlo de ejemplo, y se borra su prueba de extremo a extremo con el modelo simulado, para que el cambio que quita su módulo de agente y su tipo no tenga que tocarlos.

## Fuera de alcance

- El módulo de agente de Gemini CLI (`agents/gemini-cli.ts`), su registro, su fila de capacidades, su detección, sus textos de `init` y de `doctor` y sus tests unitarios (`gemini-cli.test.ts`): van en los cambios siguientes.
- La UI, la suite de cumplimiento (`evals/`) y los tests de core que lo ponen de ejemplo, salvo `cards/mcp.test.ts`: otro cambio.
- Lo de Antigravity que comparte nombre con Gemini (`~/.gemini/antigravity-cli/`, `ANTIGRAVITY_GEMINI_DIR`, los modelos `gemini-…` de sus tests), que se queda.

## Supuestos

- A1: Hasta el cambio que quita su módulo, `init --tools gemini-cli` sigue instalando el guard de Gemini CLI, ya sin servidor MCP ni exclusiones; nadie lo usa en este repositorio y Specty aún no está publicado.
  - impacto: medio
- A2: `gemini-cli.test.ts` sigue cubriendo el módulo de Gemini CLI mientras exista, así que quitar sus casos de los demás tests no baja la cobertura del CLI de su umbral. La prueba de extremo a extremo se salta sin Gemini CLI instalado, como en esta máquina y en la CI, así que borrarla no quita cobertura.
  - impacto: medio
- A3: `support.ts` y los ayudantes que usa `gemini-e2e.test.ts` los usan también otros tests, así que borrarlo no deja exportaciones sin uso.

## Criterios de aceptación

- AC1: CUANDO `specty init --mcp` registra el servidor MCP de Specty, o `specty doctor` lo comprueba ENTONCES no escribe ni mira `.gemini/settings.json`; Claude Code, Cursor, OpenCode, Devin (Windsurf) y Codex siguen como antes.
- AC2: CUANDO `specty check --install` prepara las exclusiones de un repositorio que tiene `.gemini/` ENTONCES no crea ni cambia `.geminiignore`; las de Cursor, Devin (Windsurf) y Antigravity siguen igual.
- AC3: CUANDO se buscan en los tests del CLI las instalaciones de Gemini CLI (`--tools gemini-cli`, `GEMINI_CLI`, `.gemini/settings.json`) o su prueba de extremo a extremo ENTONCES no queda ninguna; las de Antigravity siguen.
  - test: manual
- AC4: CUANDO se lee ARCHITECTURE ENTONCES su tabla de exclusiones no tiene `.geminiignore` y no describe la prueba de Gemini CLI con un modelo guionizado.
  - test: manual

## Diseño

- `install/mcp.ts`: `TARGETS` sin la fila de Gemini CLI; `doctor` y `init --mcp` la leen de esa tabla.
- `check/install-ignores.ts`: `IGNORE_FILES` sin `.geminiignore`.
- Tests: cada lista de agentes pierde Gemini CLI (MCP, exclusiones, fin de turno, `doctor`, `uninstall`); los casos que solo eran de Gemini CLI se van; `front-start-codex.test.ts` usa la marca de Cursor (`CURSOR_AGENT`) como «otra herramienta en el entorno»; el ejemplo `mcp-other` de `cards/mcp.test.ts` pasa a Devin (Windsurf).
- Las tareas son `chore` y no `refactor`: retiran una función con sus tests, y con `policy.tests: contract` un refactor no puede quitar aserciones.

## Archivos

- modificar packages/cli/src/install/mcp.ts — sin la fila de Gemini CLI
- modificar packages/cli/test/mcp-install.test.ts — `init --mcp` sin Gemini CLI
- modificar packages/core/test/cards/mcp.test.ts — el ejemplo `mcp-other` con Devin (Windsurf)
- modificar packages/cli/src/check/install-ignores.ts — sin `.geminiignore`
- modificar packages/cli/test/check-ignores.test.ts — las exclusiones sin Gemini CLI
- modificar packages/cli/test/agents.test.ts — sin los casos del módulo de Gemini CLI
- modificar packages/cli/test/doctor-agent-stop.test.ts — el fin de turno de `doctor` sin Gemini CLI
- modificar packages/cli/test/doctor-enter.test.ts — sin los casos de Gemini CLI
- modificar packages/cli/test/init-agent-stop.test.ts — el fin de turno de `init` sin Gemini CLI
- modificar packages/cli/test/uninstall.test.ts — `uninstall` sin Gemini CLI
- modificar packages/cli/test/agent-stop-wait.test.ts — `--no-check` sin Gemini CLI
- modificar packages/cli/test/front-start-codex.test.ts — la marca de otra herramienta es la de Cursor
- borrar packages/cli/test/gemini-e2e.test.ts — la prueba de Gemini CLI con un modelo simulado
- borrar packages/cli/test/fake-gemini.ts — el servidor simulado de la API de Gemini, que solo usaba esa prueba
- modificar docs/ARCHITECTURE.md — sin `.geminiignore` ni la prueba de Gemini CLI

## Tareas

- [x] T1: `init --mcp` y `doctor` dejan de registrar y mirar el servidor MCP en Gemini CLI
  - files: packages/cli/src/install/mcp.ts, packages/cli/test/mcp-install.test.ts, packages/core/test/cards/mcp.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/mcp-install.test.ts && pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/mcp.test.ts
  - type: chore
- [x] T2: `check --install` deja de escribir `.geminiignore`
  - files: packages/cli/src/check/install-ignores.ts, packages/cli/test/check-ignores.test.ts, docs/ARCHITECTURE.md
  - ac: AC2, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-ignores.test.ts
  - type: chore
- [x] T3: Los tests de `init`, `doctor` y `uninstall` dejan de instalar Gemini CLI
  - files: packages/cli/test/agents.test.ts, packages/cli/test/doctor-agent-stop.test.ts, packages/cli/test/doctor-enter.test.ts, packages/cli/test/init-agent-stop.test.ts, packages/cli/test/uninstall.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/agents.test.ts test/doctor-agent-stop.test.ts test/doctor-enter.test.ts test/init-agent-stop.test.ts test/uninstall.test.ts
  - type: chore
- [x] T4: Se van la prueba de extremo a extremo de Gemini CLI y sus demás casos en los tests del CLI
  - files: packages/cli/test/agent-stop-wait.test.ts, packages/cli/test/front-start-codex.test.ts, packages/cli/test/gemini-e2e.test.ts, packages/cli/test/fake-gemini.ts, docs/ARCHITECTURE.md
  - ac: AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/agent-stop-wait.test.ts test/front-start-codex.test.ts && pnpm lint && pnpm typecheck && pnpm knip
  - type: chore

## Riesgos

- R1: El cambio paralelo «La primera versión solo ofrece Claude Code y Antigravity» toca ARCHITECTURE, `init` y `doctor`, y puede chocar al incorporar main. Mitigación: se resuelve conservando las dos intenciones.
