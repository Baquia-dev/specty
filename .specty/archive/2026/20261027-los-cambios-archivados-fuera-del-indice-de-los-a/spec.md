---
kind: quick
---

# Los cambios archivados, fuera del índice de los agentes

## Objetivo

Cada cambio cerrado deja su spec, sus revisiones y su auditoría en `.specty/archive/`, que describe el código como era y llena de resultados viejos la búsqueda de los agentes: en este repositorio ya son 1.239 archivos en una semana, y con `git grep` `isNewProject` sale en 17 archivos de `.specty/` y en 2 de código. `specty check --install` saca ahora `.specty/archive/**` del índice de Cursor (`.cursorindexingignore`) y del de Antigravity (`.antigravityignore`), con su propio comentario y aunque `checks.exclude` y `scope.generated` estén vacíos; no lo pone en las exclusiones que además impiden leerlo (`.cursorignore`, `.geminiignore`, el archivo de Devin, `permissions.deny` de Claude Code y `permission.read` de OpenCode), porque el agente aún puede necesitar abrir un cambio archivado. Además, «Convenciones» de AGENTS.md dice que la API pública de core son dos listas explícitas, para que la tarea que añade exports las ponga en sus archivos: 5 de las 38 ampliaciones de alcance de los cambios archivados fueron eso.

## Archivos

- modificar packages/cli/src/check/install-ignores.ts — una lista aparte, solo del índice, con `.specty/archive/**` para Cursor y Antigravity
- modificar packages/cli/test/check-ignores.test.ts — el archivo fuera del índice, nunca en las exclusiones que impiden leer, también sin ruido que excluir
- modificar docs/formats.md — §6: el paso de exclusiones de `check --install` nombra los cambios archivados
- modificar docs/ARCHITECTURE.md — §10: la exclusión de ruido y su tabla, con `.cursorindexingignore`
- modificar AGENTS.md — «Convenciones»: las dos listas explícitas de la API pública de core

## Tareas

- [x] T1: Los cambios archivados, fuera del índice de Cursor y Antigravity
  - files: packages/cli/src/check/install-ignores.ts, packages/cli/test/check-ignores.test.ts, docs/formats.md, docs/ARCHITECTURE.md, AGENTS.md
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-ignores.test.ts && pnpm --filter @baquia-dev/specty typecheck

## Cierre

### Resumen

check --install pone .specty/archive/** solo en .cursorindexingignore y .antigravityignore, con su comentario y aunque no haya ruido que excluir; nunca en las exclusiones que impiden leer. Documentado en formats §6, ARCHITECTURE §10 y Convenciones.
