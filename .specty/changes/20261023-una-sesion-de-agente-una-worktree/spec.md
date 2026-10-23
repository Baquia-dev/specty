---
kind: standard
---

# Una sesión de agente, una worktree

## Objetivo

Una sesión de agente no puede saltar a la worktree de otro cambio mientras el suyo sigue abierto. El trabajo en paralelo es una sesión por cambio, y el guard lo hace cumplir en Claude Code. La sesión queda atada a la primera worktree en la que entra, y entrar en otra (`EnterWorktree`) se bloquea hasta que su cambio se cierra o se cancela. Hoy nada lo impide: una misma sesión puede ir y venir entre cambios abiertos, y mezclar su contexto.

## Fuera de alcance

- Otros agentes: Cursor no cambia de carpeta en una sesión, y Codex y OpenCode aún no tienen guard.
- Impedir que la sesión lea archivos de otras worktrees: solo se bloquea entrar en ellas, y escribir ya estaba bloqueado.

## Supuestos

- A1: Cuando su cambio se cierra o se cancela, o su carpeta ya no existe, la sesión queda libre y puede entrar en la worktree de otro cambio, que pasa a ser la suya. Así una sesión puede encadenar cambios, de uno en uno, pero nunca saltar entre cambios abiertos.
  - impacto: alto
- A2: La sesión se identifica por el `session_id` del evento de Claude Code. La atadura se guarda en la carpeta común de git (`common/specty/sessions/<id>.json`), para que se vea desde todas las worktrees. Sin `session_id`, el guard no ata ni bloquea.
- A3: El guard ve `EnterWorktree` porque `specty init` lo añade al matcher de `PreToolUse`. Hay que volver a ejecutar `init` una vez, y ahora hace él mismo el commit.

## Criterios de aceptación

- AC1: CUANDO una sesión entra por primera vez en una worktree ENTONCES el guard lo permite y la sesión queda atada a ella; volver a entrar en la misma también se permite.
- AC2: CUANDO la sesión intenta entrar en la worktree de otro cambio mientras el suyo sigue abierto ENTONCES el guard lo bloquea, con un motivo que nombra su worktree y su cambio, y un SIGUIENTE que pide terminarlo o abrir otra sesión en la otra carpeta.
- AC3: CUANDO el cambio de la sesión está cerrado o cancelado, o su carpeta ya no existe ENTONCES la sesión puede entrar en otra worktree y queda atada a ella.
- AC4: CUANDO el evento no trae `session_id` ENTONCES el guard no bloquea.
- AC5: CUANDO se ejecuta `specty init` para Claude Code ENTONCES el matcher de `PreToolUse` incluye `EnterWorktree`.

## Diseño

- `guard/session.ts` (core, nuevo): `sessionDenial(bound, target, lang, command)` devuelve el motivo y el SIGUIENTE cuando la sesión está atada a otra worktree con un cambio abierto.
- `guard/decide.ts` (core): una acción nueva, `enter`, con la worktree de destino y la atadura de la sesión (carpeta y cambio abierto, si lo hay), y la regla `session`.
- `store/local.ts`: leer y guardar la atadura de una sesión en `common/specty/sessions/<id>.json`.
- `enforce/guard.ts`: `EnterWorktree` (`path`, o `name` dentro de `.claude/worktrees/`) pasa a ser la acción `enter`. Con la atadura, mira si el cambio de esa carpeta sigue abierto (lo lee en ella) y, si la entrada se permite, ata la sesión al destino.
- `install/agents.ts`: el matcher de `PreToolUse` incluye `EnterWorktree`.

## Archivos

- crear packages/core/src/guard/session.ts — por qué una sesión no puede entrar en otra worktree
- modificar packages/core/src/guard/decide.ts — acción `enter` y regla `session`
- modificar packages/core/src/index.ts — exportaciones
- modificar packages/core/test/guard/decide.test.ts — la decisión al entrar en una worktree
- modificar packages/cli/src/store/local.ts — atadura de cada sesión
- modificar packages/cli/src/enforce/guard.ts — `EnterWorktree`, la atadura y su cambio
- modificar packages/cli/src/install/agents.ts — `EnterWorktree` en el matcher
- crear packages/cli/test/sessions.test.ts — pruebas de punta a punta con el hook de Claude Code
- modificar docs/ARCHITECTURE.md — §10: una sesión, una worktree

## Tareas

- [x] T1: La decisión de entrar en una worktree
  - files: packages/core/src/guard/session.ts, packages/core/src/guard/decide.ts, packages/core/src/index.ts, packages/core/test/guard/decide.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/guard
- [x] T2: El guard ata cada sesión a su worktree
  - files: packages/cli/src/store/local.ts, packages/cli/src/enforce/guard.ts, packages/cli/src/install/agents.ts, packages/cli/test/sessions.test.ts
  - ac: AC1, AC2, AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/sessions.test.ts test/setup.test.ts test/enforce.test.ts
- [ ] T3: Documentar una sesión, una worktree
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm check
  - type: docs

## Riesgos

- R1: Una sesión queda atada a un cambio que se abandonó sin cancelarlo — se libera al cancelarlo, y la salida del bloqueo lo dice.
- R2: Cada `EnterWorktree` abre una sesión de Specty en la carpeta atada para mirar su cambio — solo lee el estado.
