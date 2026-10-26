---
kind: standard
epic: 20261026-todos-los-agentes-al-nivel-de-claude-code
slice: C13
---

# Cada herramienta sabe seguir en la carpeta del cambio, y la tabla queda sin pendientes

## Objetivo

Tras `specty new`, solo Claude Code cambia de carpeta en mitad de la sesión (`EnterWorktree`). Con las demás hace falta abrir otra sesión en la carpeta del cambio, pero el SIGUIENTE solo dice «abre allí un agente». Ahora, cuando Specty reconoce por su entorno la herramienta que ejecutó `new`, el SIGUIENTE le pide al agente que la persona la abra en esa carpeta, con su comando, y que termine su turno.

Además, como ya no queda ninguna capacidad «pendiente», ese estado sale del tipo `Support`, para que no pueda volver. La tabla solo muestra «sí», «indirecto», «no posible» o «—».

## Fuera de alcance

- Abrir la herramienta desde Specty: lo hace la persona.
- Las herramientas sin marca en su entorno (la app de Antigravity, Devin): siguen con el texto general.

## Supuestos

- A1: Codex abre una sesión en una carpeta con `codex -C <carpeta>` y OpenCode con `opencode <carpeta>`, comprobado con Codex 0.164.0 y OpenCode 1.19.4. Cursor abre una ventana con `cursor <carpeta>`. Gemini CLI y Antigravity CLI (`agy`) no tienen esa opción: arrancan en la carpeta donde se ejecutan.
- A2: Specty reconoce el agente que ejecuta `new` por su entorno (`detectAgentTool`, ARCHITECTURE §4); sin marca, no sabe cuál es.

## Criterios de aceptación

- AC1: CUANDO `specty new` crea la carpeta de un cambio desde Codex, OpenCode, Cursor, Gemini CLI o Antigravity CLI ENTONCES su SIGUIENTE le pide al agente que la persona abra esa herramienta en la carpeta, con su comando, y que termine su turno; desde Claude Code, o sin un agente reconocido, sigue como hasta ahora.
- AC2: CUANDO se lee la tabla de capacidades de ARCHITECTURE §10 ENTONCES ninguna celda está «pendiente», y el tipo `Support` ya no tiene ese estado.

## Diseño

- `WorktreeCreated` gana `agent`, el que detectó la sesión (`session.tool`). La tarjeta de `new` saca de una tabla, por agente, cómo se abre la herramienta en una carpeta. Claude Code y los agentes sin entrada siguen con el texto de siempre.
- `testEnv` quita también `HGEDITOR` y `JJ_EDITOR`, la marca de Antigravity CLI, para que los tests no tomen por la del agente la terminal en que corren.
- `Support` pierde `pending`, `STATES` su texto y ARCHITECTURE §10 su descripción.

## Archivos

- modificar packages/core/src/cards/new.ts — cómo se abre cada herramienta en la carpeta del cambio
- modificar packages/cli/src/commands/new.ts — pasa a la tarjeta el agente que detectó la sesión
- modificar packages/cli/test/support.ts — `testEnv` quita la marca de Antigravity CLI
- modificar packages/core/test/cards/new.test.ts — el SIGUIENTE por herramienta (AC1)
- modificar packages/cli/test/worktrees.test.ts — `new` desde Codex (AC1)
- modificar packages/core/src/capabilities.ts — `Support` sin `pending`
- modificar packages/core/test/capabilities.test.ts — sin pendientes (AC2)
- modificar docs/ARCHITECTURE.md — el SIGUIENTE de `new` por herramienta y los estados de la tabla (§10)

## Tareas

- [x] T1: El SIGUIENTE de `new` dice cómo abrir cada herramienta en la carpeta del cambio
  - files: packages/core/src/cards/new.ts, packages/cli/src/commands/new.ts, packages/cli/test/support.ts, packages/core/test/cards/new.test.ts, packages/cli/test/worktrees.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/worktrees.test.ts
- [x] T2: La tabla queda sin pendientes
  - files: packages/core/src/capabilities.ts, packages/core/test/capabilities.test.ts, docs/ARCHITECTURE.md
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/capabilities.test.ts test/cards/new.test.ts

## Riesgos

- R1: Un comando de una herramienta puede cambiar con su versión. Mitigación: la tarjeta da también la carpeta, y ARCHITECTURE dice con qué versiones se comprobó.
