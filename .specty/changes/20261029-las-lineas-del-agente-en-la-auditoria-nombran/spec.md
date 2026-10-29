---
kind: quick
---

# Las líneas del agente en la auditoría nombran su sesión

## Objetivo

Para medir lo que consume cada cambio hay que saber qué sesiones del agente trabajaron en él, y la auditoría no lo guarda. Las líneas del agente llevan `session`, el id de la sesión que dice su herramienta: hoy, en Claude Code, `CLAUDE_CODE_SESSION_ID`, con la misma validación que ya impide leer una ruta a partir de él. Sin id válido, la línea va sin el campo, como pasa con el modelo y el esfuerzo.

## Archivos

- modificar packages/cli/src/agents/run.ts — la sesión, junto al modelo y el esfuerzo
- modificar packages/cli/src/flow/active.ts — la línea del agente la lleva
- modificar packages/cli/src/store/changes.ts — el campo `session` de la línea
- modificar packages/cli/test/audit-who.test.ts — la sesión en las líneas de Claude Code, y su ausencia sin id válido o fuera de Claude Code
- modificar docs/formats.md — §4, el campo `session`

## Tareas

- [x] T1: Las líneas del agente nombran su sesión
  - files: packages/cli/src/agents/run.ts, packages/cli/src/flow/active.ts, packages/cli/src/store/changes.ts, packages/cli/test/audit-who.test.ts, docs/formats.md
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/audit-who.test.ts && pnpm lint
