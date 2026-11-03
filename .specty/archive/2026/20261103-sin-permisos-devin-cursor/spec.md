---
kind: standard
---

# Devin y Cursor, sin permisos para la carpeta de las worktrees

## Objetivo

Último de los tres cambios que quitan los permisos que `init` daba a cada herramienta solo para alcanzar la carpeta de las worktrees de fuera (ADR 0018). Devin deja de recibir `Write(...)` y `Read(...)` de esa carpeta en `.devin/config.local.json`, y el sandbox de Cursor deja de recibirla en `.cursor/sandbox.json`: los dos se quedan solo con la carpeta común de git, que necesitan los commits de Specty desde su sandbox. Con esto, `sharedFolders` da solo esa carpeta. Lo que dio un `init` anterior desaparece con el siguiente y con `uninstall`.

## Fuera de alcance

- Mover las worktrees dentro del proyecto, y las exclusiones de las herramientas de JavaScript.
- La regla `Exec(specty)` de Devin en `.devin/config.json`.

## Supuestos

- A1: La carpeta de las worktrees de antes es `<carpeta principal>.worktrees` (`formerWorktreesHome`); solo se quitan sus entradas exactas (`Write(<carpeta>/**)`, `Read(<carpeta>/**)` en Devin, la ruta en Cursor), así que lo de la persona se queda.
  - impacto: alto
- A2: `doctor` sigue comprobando que esos ajustes tengan la carpeta común de git; ya no pide la de las worktrees.
- A3: Los textos de `init` y `doctor` del sandbox de Devin y de Cursor hablan solo de la carpeta de git.

## Criterios de aceptación

- AC1: CUANDO `init` instala Devin o Cursor ENTONCES sus ajustes locales solo dan la carpeta común de git (`Write(<git>/**)` en Devin, la ruta en `additionalReadwritePaths` de Cursor), sin la carpeta de las worktrees, y sus textos de `init` y `doctor` solo nombran la carpeta de git.
- AC2: CUANDO los ajustes de Devin o de Cursor tienen lo que les daba un `init` anterior sobre la carpeta de las worktrees ENTONCES `init` y `uninstall` lo quitan y dejan lo de la persona.

## Diseño

- `flow/worktree.ts`: `sharedFolders` da solo la carpeta común de git.
- Devin: los scopes de Specty son `Write(<git>/**)`; `init` y `uninstall` quitan `Write(<antes>/**)` y `Read(<antes>/**)`.
- Cursor: `init` y `uninstall` quitan la carpeta de antes de `additionalReadwritePaths`.
- Core: `cursorSandboxLine`, `devinSandboxLine` y las líneas `cursor-sandbox` y `no-cursor-sandbox` de `doctor` hablan solo de la carpeta de git.

## Archivos

- modificar packages/cli/src/flow/worktree.ts — `sharedFolders` solo con la carpeta común de git
- modificar packages/cli/src/agents/windsurf.ts — scopes solo de la carpeta de git, y quita los de antes
- modificar packages/cli/src/agents/cursor.ts — sandbox solo con la carpeta de git, y quita la de antes
- modificar packages/core/src/cards/install.ts — los textos del sandbox de Devin y de Cursor
- modificar packages/core/src/cards/doctor-agents.ts — las líneas del sandbox de Cursor
- modificar packages/cli/test/windsurf.test.ts — scopes solo de la carpeta de git, y los de antes se quitan
- modificar packages/cli/test/cursor.test.ts — sandbox solo con la carpeta de git, y la de antes se quita
- modificar packages/cli/test/doctor-enter.test.ts — Devin sin la carpeta de las worktrees
- modificar docs/ARCHITECTURE.md — Devin y Cursor en «Permisos de la herramienta» e «Instalaciones de antes de `specty enter`»

## Tareas

- [x] T1: Devin, solo con la carpeta común de git
  - files: packages/cli/src/flow/worktree.ts, packages/cli/src/agents/windsurf.ts, packages/core/src/cards/install.ts, packages/cli/test/windsurf.test.ts, packages/cli/test/doctor-enter.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/windsurf.test.ts test/doctor-enter.test.ts && pnpm typecheck && pnpm lint
- [x] T2: Cursor, solo con la carpeta común de git, y la documentación
  - files: packages/cli/src/agents/cursor.ts, packages/core/src/cards/install.ts, packages/core/src/cards/doctor-agents.ts, packages/cli/test/cursor.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/cursor.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: Quitar una entrada que la persona puso a mano con la misma ruta — solo se quita la ruta exacta de la carpeta de antes.

## Cierre

### Resumen

Último de los cambios que quitan los permisos que `init` daba sobre la carpeta de las worktrees de fuera (ADR 0018). `sharedFolders` da ya solo la carpeta común de git, así que Devin recibe solo `Write(<git>/**)` en `.devin/config.local.json` y el sandbox de Cursor solo esa carpeta en `.cursor/sandbox.json`. `init` y `uninstall` quitan lo que daba un `init` anterior, `Write(...)` y `Read(...)` de la carpeta de antes en Devin y su ruta en Cursor, y dejan lo de la persona. Los textos de `init` y de `doctor` de los dos sandbox hablan solo de la carpeta de git, y ARCHITECTURE lo cuenta. Con este cambio, ninguna herramienta recibe ya permisos sobre la carpeta de las worktrees.

### Desviaciones

- Ninguna respecto al plan.

### Decisiones

- `doctor` sigue pidiendo a Devin y a Cursor la carpeta común de git, que necesitan los commits de Specty desde su sandbox.

### Pendientes

- Mover las worktrees dentro del proyecto (`.worktrees/<id>`) y las exclusiones de las herramientas de JavaScript, en sus cambios.
