---
kind: quick
---

# Las salidas de git no se recortan

## Objetivo

`execute` guarda solo los últimos 512 KB de cada salida, para que el registro de una verificación no crezca sin límite. Pero git usa el mismo camino, y su salida es un dato, no un registro: un diff de más de 512 KB pierde sus primeros archivos, así que los riesgos, las aserciones quitadas o `specty check` no los ven, y un archivo leído con `git show` llega cortado. Ahora las órdenes de git guardan su salida entera; las verificaciones siguen guardando los últimos 512 KB, y el servidor sigue sirviendo a la UI diffs de 512 KB como máximo.

## Archivos

- modificar packages/cli/src/io/exec.ts — la opción `whole`: toda la salida
- modificar packages/cli/src/io/git.ts — git la usa
- crear packages/cli/test/exec.test.ts — git entero, una verificación con sus últimos 512 KB
- modificar docs/ARCHITECTURE.md — §15: los 512 KB son lo que se sirve a la UI

## Tareas

- [x] T1: Las órdenes de git guardan su salida entera
  - files: packages/cli/src/io/exec.ts, packages/cli/src/io/git.ts, packages/cli/test/exec.test.ts, docs/ARCHITECTURE.md
  - verify: pnpm check
  - type: fix
