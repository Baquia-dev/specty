---
kind: quick
---

# Tarjeta de Specty tras compactar

## Objetivo

Cuando Claude Code compacta la conversación, la tarjeta de la tarea se resume y el agente pierde sus archivos permitidos y sus criterios. `init` instala un hook `SessionStart` con el matcher `compact` que llama al guard, y el guard responde con lo que imprimiría `specty next`, que Claude Code añade al contexto: la tarjeta vuelve entera sin alargar AGENTS.md. Solo tras compactar (no al empezar, reanudar ni limpiar), porque es cuando el contexto pierde la tarjeta; si `next` activa la siguiente tarea, es lo mismo que haría el agente al seguir. `doctor` avisa si falta el hook, aparte de los demás.

## Archivos

- modificar packages/cli/src/enforce/guard.ts — `SessionStart` responde con la salida de `next`
- modificar packages/cli/src/install/agents.ts — `SessionStart` con el matcher `compact`
- modificar packages/cli/src/commands/doctor.ts — el aviso propio de `SessionStart`
- crear packages/cli/test/session-start.test.ts — la tarjeta tras compactar, y nada fuera de un repositorio con Specty
- modificar packages/cli/test/setup.test.ts — `init` lo instala y `doctor` avisa si falta
- modificar docs/ARCHITECTURE.md — la tarjeta tras compactar (§7 y §10)

## Tareas

- [x] T1: El guard devuelve la tarjeta tras compactar, `init` instala el hook y `doctor` lo revisa
  - files: packages/cli/src/enforce/guard.ts, packages/cli/src/install/agents.ts, packages/cli/src/commands/doctor.ts, packages/cli/test/session-start.test.ts, packages/cli/test/setup.test.ts, docs/ARCHITECTURE.md
  - verify: pnpm check
  - type: feat

## Cierre

### Resumen

El guard responde a SessionStart con la salida de next (Claude Code la añade al contexto); init instala SessionStart con el matcher compact; doctor tiene un aviso propio para ese hook. ARCHITECTURE §7 y §10.
