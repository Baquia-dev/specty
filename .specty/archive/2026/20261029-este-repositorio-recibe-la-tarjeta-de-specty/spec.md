---
kind: quick
---

# Este repositorio recibe la tarjeta de Specty tras un /clear

## Objetivo

Specty instala ahora el `SessionStart` de Claude Code con `compact|clear`, para que tras un `/clear` la tarjeta vuelva sola. Este repositorio aún tiene el de antes, que solo escucha `compact`. El guard no deja editar `.claude/settings.json` a mano, así que lo actualiza `specty init`, con la CLI del PATH ya reconstruida. Lo que `init` cambie además en el bloque del proyecto de AGENTS.md entra aquí también.

## Archivos

- modificar .claude/settings.json — el matcher `compact|clear`, escrito por `specty init`
- modificar AGENTS.md — el bloque que reescribe `specty init`

## Tareas

- [x] T1: `specty init` actualiza la instalación de Claude Code de este repositorio
  - files: .claude/settings.json, AGENTS.md
  - verify: pnpm lint
  - type: chore

## Cierre

### Resumen

specty init, con la CLI del PATH reconstruida, deja en .claude/settings.json el SessionStart con compact|clear y pone al día el bloque del proyecto de AGENTS.md (suma evals y packages/vscode).
