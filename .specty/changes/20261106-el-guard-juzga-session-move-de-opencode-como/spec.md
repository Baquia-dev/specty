---
kind: standard
---

# El guard juzga session_move de OpenCode como una entrada

## Objetivo

OpenCode 2.2.5 trae `execute` (Code Mode): ejecuta JavaScript que llama a ocho herramientas de OpenCode, entre ellas `session_move`, que muda la sesión a otra carpeta, y `worktree_create` y `worktree_remove` (P200). Comprobado con OpenCode 2.2.5 aislado: cada llamada de dentro de `execute` pasa por el hook del plugin de Specty con su propio nombre (`opencode_session_move`, `opencode_worktree_list`…) y su entrada, y un bloqueo del guard la detiene y le da el motivo al modelo; las herramientas de archivos y de shell no están en Code Mode. Hoy el guard deja pasar esas llamadas sin juzgarlas, así que `session_move` permite a una conversación que trabaja en un cambio mudarse a la carpeta de otro, saltándose la regla de un cambio a la vez. Con este cambio, el guard juzga `opencode_session_move` como una entrada en su carpeta, igual que `EnterWorktree` de Claude Code.

## Fuera de alcance

- `worktree_create` y `worktree_remove`: quedan como `git worktree add` y `git worktree remove` desde el shell, que el guard tampoco juzga hoy; proteger la carpeta de un cambio abierto de ambos caminos queda como pendiente.
- El resto de herramientas de Code Mode (`session_rename`, `worktree_list`, `models` y los recursos MCP): no cambian carpetas ni archivos del proyecto.
- `execute` en sí: sus llamadas se juzgan una a una.

## Supuestos

- A1: `opencode_session_move` con `directory` es una entrada en esa carpeta, resuelta desde la carpeta del evento como el `path` de `EnterWorktree`: la deniega mientras la conversación trabaja en otra carpeta cuyo cambio sigue abierto, y si la deja pasar liga la conversación a ella. Sin `directory`, no se juzga.
  - impacto: alto
- A2: Se juzga igual aunque traiga el `sessionID` de otra sesión: el guard solo conoce la conversación del evento, y bloquear de más es más seguro que mudar sin regla.

## Criterios de aceptación

- AC1: CUANDO una conversación de OpenCode trabaja en la carpeta de un cambio abierto y `session_move` la mudaría a otra carpeta ENTONCES el guard lo bloquea con el motivo de que la sesión trabaja un solo cambio a la vez, como a `EnterWorktree`; mudarla a su propia carpeta pasa.
- AC2: CUANDO una conversación de OpenCode que no trabaja en ningún cambio abierto se muda con `session_move` a la carpeta de un cambio, también con una ruta relativa ENTONCES el guard lo deja pasar y la conversación queda ligada a esa carpeta.

## Diseño

- `agents/opencode.ts`: `action` lee `opencode_session_move` como `{ kind: "enter", request: { path: directory } }`, la acción que el guard ya juzga para `EnterWorktree` (`enterAction`, `sessionDenial`, `bindSession`).

## Archivos

- modificar packages/cli/src/agents/opencode.ts — `session_move` de Code Mode como una entrada
- crear packages/cli/test/opencode-session-move.test.ts — los criterios con los eventos del plugin
- modificar docs/ARCHITECTURE.md — OpenCode: el guard juzga las llamadas de Code Mode, y `session_move` como una entrada

## Tareas

- [x] T1: session_move de OpenCode se juzga como una entrada
  - files: packages/cli/src/agents/opencode.ts, packages/cli/test/opencode-session-move.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/opencode-session-move.test.ts test/opencode.test.ts test/enter.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: feat
