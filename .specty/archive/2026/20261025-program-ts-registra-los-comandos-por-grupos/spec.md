---
kind: quick
---

# program.ts registra los comandos por grupos

## Objetivo

`packages/cli/src/program.ts` llegó a 307 líneas de código, por encima del aviso de 300, porque mezcla dos responsabilidades: preparar la ejecución (abrir la sesión, emitir la salida, leer las opciones globales) y registrar cada comando. Los comandos del agente y las decisiones de la persona pasan a registrarse desde su propio módulo, como ya hacen `enforcementCommands`, `checkCommand`, `auditCommand` y `exportCommand`. `program.ts` queda con la ejecución y los comandos de lectura e instalación, sin cambiar el comportamiento.

## Archivos

- modificar packages/cli/src/program.ts — la ejecución, y registrar cada grupo
- crear packages/cli/src/commands/agent-commands.ts — los comandos del agente: next, new, propose, review, task done, scope add, integrate, adjust y retro
- crear packages/cli/src/commands/person-commands.ts — las decisiones de la persona: approve, reject, accept, close, cancel y delegate

## Tareas

- [x] T1: Cada grupo de comandos se registra desde su módulo
  - files: packages/cli/src/program.ts, packages/cli/src/commands/agent-commands.ts, packages/cli/src/commands/person-commands.ts
  - verify: pnpm check
  - type: refactor

## Cierre

### Resumen

program.ts (de 307 a 135 líneas de código) queda con la ejecución y los comandos de lectura e instalación; los del agente se registran desde commands/agent-commands.ts y las decisiones de la persona desde commands/person-commands.ts, sin cambiar nada.
