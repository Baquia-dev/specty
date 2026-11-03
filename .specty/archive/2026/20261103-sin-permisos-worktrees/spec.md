---
kind: standard
---

# Antigravity y Codex, sin permisos para la carpeta de las worktrees

## Objetivo

Las worktrees de los cambios pasan a vivir dentro del proyecto (ADR 0018, en un cambio siguiente), donde cualquier agente las alcanza sin configurar nada. Los permisos que `init` daba a cada herramienta solo para alcanzar la carpeta de las worktrees de fuera sobran, y se quitan en tres cambios seguidos. Este es el primero: el guard y Antigravity (sus `permissionOverrides` de esa carpeta) y Codex (`.codex/config.toml`). Los de la carpeta común de git se quedan: los necesitan los commits de Specty desde un sandbox.

## Fuera de alcance

- Mover las worktrees dentro del proyecto: es un cambio siguiente, y hasta entonces una herramienta con sandbox no escribe en la carpeta de un cambio desde una sesión de la carpeta principal.
- Los permisos de la carpeta común de git, la regla de Codex para los comandos de Specty y la de `cd`.
- OpenCode, Gemini CLI, Devin y Cursor: van en los dos cambios siguientes.

## Supuestos

- A1: La carpeta de las worktrees de antes es `<carpeta principal>.worktrees`, junto a la principal (`formerWorktreesHome`); la usarán los cambios siguientes para quitar de los ajustes de cada herramienta lo que Specty les dio sobre ella, y nada más de la persona.
  - impacto: alto
- A2: `.codex/config.toml` solo lo escribía Specty para la carpeta de las worktrees: `init` lo borra si es el de Specty (empieza por su comentario) y no está en el repositorio, como ya hacía `uninstall`; uno de la persona no se toca.
- A3: `doctor` deja de dar por anticuada la instalación de Codex porque le falte `.codex/config.toml`; sigue avisando de su regla sin `cd`.
- A4: Los textos de `init` que solo trataban de `.codex/config.toml` desaparecen.

## Criterios de aceptación

- AC1: CUANDO `init` instala Codex ENTONCES no escribe `.codex/config.toml` ni crea la carpeta de las worktrees, y un `.codex/config.toml` que escribió antes Specty (no el de la persona) desaparece.
- AC2: CUANDO el guard deja pasar una acción de Antigravity, también de una conversación que entró en un cambio, ENTONCES su respuesta solo abre la carpeta común de git (`write_file`), sin `write_file` ni `read_file` de la carpeta de las worktrees.
- AC3: CUANDO `doctor` revisa una instalación de Codex sin `.codex/config.toml` ENTONCES no la da por anticuada.

## Diseño

- `flow/worktree.ts`: `sharedFolders` devuelve solo la carpeta común de git; `formerWorktreesHome` da la carpeta de las worktrees de antes.
- Guard: sin `Verdict.readable`; Antigravity solo convierte `folders` en `write_file(...)`.
- Codex: `init` ya no escribe `.codex/config.toml` y borra el de Specty; `doctor` solo mira la regla de `cd`.
- Core: fuera `codexSandboxLine` y `codexSandboxKeptWarning`.

## Archivos

- modificar packages/cli/src/flow/worktree.ts — solo la carpeta común de git, y la carpeta de las worktrees de antes
- modificar packages/cli/src/enforce/guard.ts — sin la carpeta de las worktrees para leer
- modificar packages/cli/src/agents/adapter.ts — fuera `Verdict.readable`
- modificar packages/cli/src/agents/antigravity.ts — solo `write_file` de la carpeta común de git
- modificar packages/cli/src/agents/codex.ts — sin `.codex/config.toml`
- modificar packages/core/src/cards/install.ts — fuera los textos de `.codex/config.toml`
- modificar packages/core/src/cards/index.ts — fuera sus exportaciones
- modificar packages/cli/test/antigravity.test.ts — las respuestas sin la carpeta de las worktrees
- modificar packages/cli/test/antigravity-turn.test.ts — los comandos, solo con la carpeta común de git
- modificar packages/cli/test/codex.test.ts — sin `config.toml`, y el de Specty se borra
- modificar packages/cli/test/doctor-enter.test.ts — Codex sin el aviso por `config.toml`
- modificar docs/ARCHITECTURE.md — «Permisos de la herramienta» de Codex y Antigravity

## Tareas

- [x] T1: Antigravity y el guard, solo con la carpeta común de git
  - files: packages/cli/src/flow/worktree.ts, packages/cli/src/enforce/guard.ts, packages/cli/src/agents/adapter.ts, packages/cli/src/agents/antigravity.ts, packages/cli/test/antigravity.test.ts, packages/cli/test/antigravity-turn.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/antigravity.test.ts test/antigravity-turn.test.ts && pnpm typecheck && pnpm lint
- [x] T2: Codex sin `.codex/config.toml`, y la documentación
  - files: packages/cli/src/agents/codex.ts, packages/core/src/cards/install.ts, packages/core/src/cards/index.ts, packages/cli/test/codex.test.ts, packages/cli/test/doctor-enter.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/codex.test.ts test/doctor-enter.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: Hasta que las worktrees vivan dentro del proyecto, una herramienta con sandbox no escribe en la carpeta de un cambio desde una sesión de la carpeta principal — los cambios van seguidos; mientras, la sesión abierta en la carpeta del cambio funciona.

## Cierre

### Resumen

Primer paso para quitar los permisos que `init` daba a cada herramienta sobre la carpeta de las worktrees de fuera (ADR 0018). El guard ya solo abre a Antigravity la carpeta común de git (`write_file`), con cada comando que deja pasar y con cada acción de una conversación que entró en un cambio; fuera `Verdict.readable` y el `read_file` de la carpeta de las worktrees. Codex ya no recibe `.codex/config.toml` ni se crea la carpeta de las worktrees: `init` y `uninstall` borran el que escribió Specty antes (por su primer comentario, si no está en git), el de la persona no se toca, y `doctor` ya no da por anticuada una instalación sin él. Fuera de core `codexSandboxLine` y `codexSandboxKeptWarning`. ARCHITECTURE lo cuenta en «Permisos de la herramienta».

### Desviaciones

- `sharedFolders` sigue dando la carpeta de las worktrees: la usan Devin, Cursor y Gemini CLI, que van en los cambios siguientes. El guard toma solo `gitCommonFolder`, una función nueva de `flow/worktree.ts`. Lo destapó la verificación completa al aceptar.
- `formerWorktreesHome` no se añadió aquí: Codex reconoce su archivo por el comentario y no necesita la ruta. Llega con el primer cambio que la usa.

### Decisiones

- `removeFormerConfig` borra el `.codex/config.toml` de Specty también al instalar, para que no quede una ruta de esta máquina que ya no hace falta.

### Pendientes

- OpenCode y Gemini CLI, y después Devin y Cursor, en los dos cambios siguientes; con el último, `sharedFolders` queda solo con la carpeta común de git.
- Mover las worktrees dentro del proyecto y las exclusiones de las herramientas de JavaScript, en cambios propios.
