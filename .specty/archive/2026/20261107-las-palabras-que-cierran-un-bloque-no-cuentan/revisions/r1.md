---
kind: quick
---

# Las palabras que cierran un bloque no cuentan como programa en el guard

## Objetivo

En el análisis del shell del guard, un comando simple formado solo por las palabras que cierran un bloque (`}`, `fi`, `done`, `esac`), con o sin redirecciones, no cuenta como un comando que corre en su directorio (`runsIn` de `analyzeShell`): así `{ cd /fuera; }`, `if true; then cd /fuera; fi` o `for x in a; do cd /fuera; done` ya no se niegan por correr fuera de la carpeta del cambio, como no se niega un `cd /fuera` suelto (P229). Un comando real después del cierre (`fi; pnpm test`, `} && ls`) sigue contando donde corre, y las redirecciones del cierre (`} > .git/x`) siguen contando como escrituras. El freno de esperas (`waits`, `guard/waits.ts`) no cambia.

## Archivos

- modificar packages/core/src/guard/shell.ts — un comando simple de solo palabras que cierran un bloque no entra en `runsIn`
- modificar packages/core/test/guard/control-words.test.ts — `{ cd /fuera; }`, `if …; then …; fi`, `for …; do …; done` y `case … esac` no corren en ningún sitio; un comando tras el cierre sigue contando, y la redirección del cierre sigue escribiendo
- modificar docs/ARCHITECTURE.md — el análisis del shell no cuenta las palabras que cierran un bloque como un comando que corre

## Tareas

- [ ] T1: Las palabras que cierran un bloque no cuentan como un comando que corre
  - files: packages/core/src/guard/shell.ts, packages/core/test/guard/control-words.test.ts, docs/ARCHITECTURE.md
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/guard/control-words.test.ts && pnpm typecheck && pnpm lint
  - type: fix
