---
kind: quick
---

# La UI solo propone retomar un cambio con Claude Code o Antigravity

## Objetivo

La primera versión solo habilita Claude Code y Antigravity (`ENABLED_AGENTS` de `packages/core/src/capabilities.ts`), pero «Cómo retomarlo», en la página de un cambio que nadie lleva, aún propone abrirlo con Codex, OpenCode y Cursor (P412). Con este cambio, la UI propone solo las órdenes de los agentes habilitados, derivadas de esa misma lista, que la entrada ligera de core (`@baquia-dev/specty-core/light`) pasa a exportar: Claude Code (`cd "<carpeta>" && claude`) y Antigravity CLI (`cd "<carpeta>" && agy`); la app de Antigravity sigue entrando desde una sesión ya abierta con `specty enter <id>`, como dice la línea de debajo. Las órdenes de Codex, OpenCode y Cursor se quedan en la tabla, por agente, para cuando se habiliten. P411 ya quedó hecha en main con el cambio anterior (`doctor`, la suite de cumplimiento y ARCHITECTURE §16 y §18 con los agentes habilitados); este cambio solo la marca resuelta.

## Archivos

- modificar packages/core/src/light.ts — exporta `ENABLED_AGENTS` y el tipo `AgentTool` para la UI
- modificar packages/ui/src/change/resume-hints.ts — las órdenes, por agente, y solo las de `ENABLED_AGENTS`
- modificar packages/ui/src/change/resume-hints.test.ts — «Cómo retomarlo» propone solo Claude Code y Antigravity CLI

## Tareas

- [ ] T1: La UI solo propone retomar un cambio con Claude Code o Antigravity
  - files: packages/core/src/light.ts, packages/ui/src/change/resume-hints.ts, packages/ui/src/change/resume-hints.test.ts
  - verify: pnpm --filter @baquia-dev/specty-ui exec vitest run src/change/resume-hints.test.ts && pnpm typecheck && pnpm lint
  - type: fix
