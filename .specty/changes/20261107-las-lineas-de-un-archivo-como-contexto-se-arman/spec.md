---
kind: quick
---

# Las líneas de un archivo como contexto se arman en un solo sitio

## Objetivo

Dos vistas arman a mano el mismo `DiffFile` de una sola sección de líneas de contexto para que el resaltado les dé los colores del visor de diffs: `diffOf` en la trazabilidad del Historial y `asFile` en las líneas de código de «Ver código» y de la evidencia de un desbloqueo. Pasa a una sola función exportada de `packages/ui/src/data/diff.ts`, que recibe la ruta, las líneas y el número de la primera (1 si no se da), y la usan las dos. Es un refactor: nada visible cambia. La trazabilidad sigue numerando desde 1 con las líneas que da el servidor, tal cual; «Ver código» sigue numerando desde `start`, y sigue partiendo su texto sin la línea vacía que deja el salto final ni ninguna línea si el texto está vacío. Ninguna de las dos tiene tamaño máximo, y la función tampoco lo pone.

## Archivos

- modificar packages/ui/src/data/diff.ts — la función que arma el archivo de líneas de contexto numeradas desde la primera
- modificar packages/ui/src/history/trace-view.ts — usar esa función en vez de `diffOf`
- modificar packages/ui/src/progress/code-lines.ts — usar esa función en vez de `asFile`, partiendo antes el texto en líneas

## Tareas

- [x] T1: Unir en data/diff.ts el archivo de líneas de contexto de la trazabilidad y de las líneas de código
  - files: packages/ui/src/data/diff.ts, packages/ui/src/history/trace-view.ts, packages/ui/src/progress/code-lines.ts
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/diff.test.ts --include src/history/trace-view.test.ts --include src/progress/locked-tests.test.ts --include src/progress/tests-sent.test.ts --include src/progress/scope-request.test.ts && pnpm --filter @baquia-dev/specty-ui typecheck && pnpm lint && pnpm knip
  - type: refactor
