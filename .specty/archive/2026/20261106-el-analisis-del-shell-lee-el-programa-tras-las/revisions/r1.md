---
kind: quick
---

# El análisis del shell lee el programa tras las palabras de control en todas sus reglas

## Objetivo

Resuelve P219. Hoy `analyzeShell` (`packages/core/src/guard/shell.ts`) solo salta las palabras que abren un comando compuesto o una de sus ramas (`if`, `then`, `elif`, `else`, `while`, `until`, `do`, `!`, `{`) en la regla de `sleep`; las demás toman esa palabra por el programa, así que `if true; then specty approve; fi` no cuenta como un comando de la persona para el guard, `{ git commit -m x; }` no cuenta como un commit y `then touch .git/hooks/pre-commit` no escribe nada. Con este cambio, cada comando simple busca su programa tras esas palabras, sus asignaciones y sus envoltorios en un solo sitio, que usan todas las reglas: los comandos de Specty (los de la persona, `enter`, `front`, `new`…), `npx specty`, `git` (commits, ramas, `--no-verify`, `HUSKY=0`, quitar worktrees), los archivos que escriben o borran `touch`, `rm`, `cp`, `mv`, `tee` o `sed -i`, y `sleep`. También los `cd` que siguen a esas palabras (`{ cd sub && git commit -m x; }`) mueven el directorio, como un `cd` suelto. Una de esas palabras como argumento (`echo then specty approve`, `git commit -m do`) no cambia nada, porque solo se saltan al principio del comando simple.

## Archivos

- modificar packages/core/src/guard/shell.ts — `analyzeSegment`, `isCd` y `changeDirectory` buscan el programa tras las palabras de control; `sleeps` pasa a leer ese mismo programa
- crear packages/core/test/guard/control-words.test.ts — los comandos de la persona, los commits, las escrituras en `.git`, `npx specty`, `specty new` y los `cd` tras las palabras de control, y los falsos positivos con esas palabras como argumento
- modificar docs/ARCHITECTURE.md — el análisis del shell lee el programa tras las palabras de control en todas sus reglas

## Tareas

- [ ] T1: El análisis del shell lee el programa tras las palabras de control en todas sus reglas
  - files: packages/core/src/guard/shell.ts, packages/core/test/guard/control-words.test.ts, docs/ARCHITECTURE.md
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/guard/control-words.test.ts test/guard/shell.test.ts test/guard/wait.test.ts test/guard/decide.test.ts && pnpm typecheck && pnpm lint
  - type: fix
