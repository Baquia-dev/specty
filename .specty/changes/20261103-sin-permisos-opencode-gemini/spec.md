---
kind: standard
---

# OpenCode y Gemini CLI, sin permisos para la carpeta de las worktrees

## Objetivo

Segundo de los tres cambios que quitan los permisos que `init` daba a cada herramienta solo para alcanzar la carpeta de las worktrees de fuera (ADR 0018). OpenCode deja de recibir la regla de `permission.external_directory` de esa carpeta, y Gemini CLI deja de recibirla en `context.includeDirectories` y en `tools.sandboxAllowedPaths`, donde se queda solo la carpeta común de git, que necesitan los commits de Specty desde su sandbox. Lo que dio un `init` anterior desaparece con el siguiente y con `uninstall`.

## Fuera de alcance

- Devin y Cursor: van en el cambio siguiente, que deja `sharedFolders` solo con la carpeta común de git.
- Mover las worktrees dentro del proyecto.

## Supuestos

- A1: La carpeta de las worktrees de antes es `<carpeta principal>.worktrees` (`formerWorktreesHome`). Solo se quita esa ruta exacta (con `/**` en la regla de OpenCode), así que lo que la persona puso en esos ajustes se queda.
  - impacto: alto
- A2: `doctor` deja de dar por anticuados los ajustes de OpenCode y Gemini CLI porque les falte esa carpeta; sigue avisando del plugin de OpenCode sin `redirects` y del matcher de Gemini CLI sin las lecturas.
- A3: `init` ya no crea la carpeta de las worktrees para Gemini CLI: solo la necesitaba porque estaba en su espacio de trabajo.

## Criterios de aceptación

- AC1: CUANDO `init` instala OpenCode o Gemini CLI ENTONCES no les da permiso sobre la carpeta de las worktrees: OpenCode queda sin la regla de `external_directory`, y Gemini CLI sin `context.includeDirectories` y con solo la carpeta común de git en `tools.sandboxAllowedPaths`; sus textos de `init` dejan de nombrar la carpeta de las worktrees y `init` no la crea.
- AC2: CUANDO los ajustes de OpenCode o de Gemini CLI tienen lo que les daba un `init` anterior sobre la carpeta de las worktrees ENTONCES `init` y `uninstall` lo quitan y dejan lo de la persona.
- AC3: CUANDO `doctor` revisa una instalación de OpenCode o de Gemini CLI sin esa carpeta ENTONCES no la da por anticuada.

## Diseño

- `flow/worktree.ts`: `formerWorktreesHome` da la carpeta de las worktrees de antes.
- OpenCode: `openWorktrees` sale de `install/opencode.ts`; `closeWorktrees` quita la regla de la carpeta de antes, al instalar y al desinstalar. `doctor` solo mira `redirects`.
- Gemini CLI: `withSpecty` pone la carpeta común de git en `sandboxAllowedPaths` y quita la carpeta de antes de esa lista y de `includeDirectories`; `doctor` solo mira el matcher.
- Core: fuera `opencodeWorktreesLine`, `opencodeWorktreesVersionedWarning`, `geminiWorkspaceLine` y `geminiWorkspaceVersionedWarning`; `geminiSandboxLine` habla solo de la carpeta de git.

## Archivos

- modificar packages/cli/src/flow/worktree.ts — la carpeta de las worktrees de antes
- modificar packages/cli/src/install/opencode.ts — sin abrir la carpeta, y quita la regla de antes
- modificar packages/cli/src/agents/opencode.ts — `init` y `doctor` sin la carpeta de las worktrees
- modificar packages/cli/src/agents/gemini-cli.ts — sin `includeDirectories`, el sandbox solo con la carpeta de git
- modificar packages/core/src/cards/install.ts — textos sin la carpeta de las worktrees
- modificar packages/core/src/cards/index.ts — fuera los textos que ya no se usan
- modificar packages/cli/test/opencode-install.test.ts — sin `external_directory`, y la regla de antes se quita
- modificar packages/cli/test/gemini-cli.test.ts — sin `includeDirectories`, y la carpeta de antes se quita
- modificar packages/cli/test/doctor-enter.test.ts — OpenCode y Gemini CLI sin el aviso por esa carpeta
- modificar docs/ARCHITECTURE.md — OpenCode y Gemini CLI en «Permisos de la herramienta» e «Instalaciones de antes de `specty enter`»

## Tareas

- [x] T1: OpenCode sin `external_directory`
  - files: packages/cli/src/flow/worktree.ts, packages/cli/src/install/opencode.ts, packages/cli/src/agents/opencode.ts, packages/core/src/cards/install.ts, packages/core/src/cards/index.ts, packages/cli/test/opencode-install.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/opencode-install.test.ts && pnpm typecheck && pnpm lint
- [ ] T2: Gemini CLI sin `includeDirectories`, y la documentación
  - files: packages/cli/src/agents/gemini-cli.ts, packages/core/src/cards/install.ts, packages/core/src/cards/index.ts, packages/cli/test/gemini-cli.test.ts, packages/cli/test/doctor-enter.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/gemini-cli.test.ts test/doctor-enter.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: Quitar una entrada que la persona puso a mano con la misma ruta — solo se quita la ruta exacta de la carpeta de antes, que no tiene otro uso.
