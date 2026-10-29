---
kind: quick
---

# La salida de los test que fallan tiene resaltado con colores

## Objetivo

La visualización de la salida de las verificaciones de tests que fallan en la interfaz web (UI) reconoce y resalta con colores las marcas y diffs habituales de ejecutores modernos de pruebas (Vitest, Jest, Node test runner, Dart, pytest). Se añaden los símbolos de fallo (`✕`, `✖`) y acierto (`✔`), tipos de error (`AssertionError`, etc.), líneas de aserción (`- Expected`, `+ Received`) y tramos de diff, permitiendo comprender de un vistazo por qué falló un test.

## Archivos

- modificar packages/ui/src/data/progress.ts — reconocimiento de marcas, diffs y errores en `outputSegments`
- modificar packages/ui/src/data/progress.test.ts — pruebas del resaltado con marcas de Vitest, Jest y diffs
- modificar docs/ui.md — documentar los símbolos y formatos reconocidos en la salida

## Tareas

- [ ] T1: Resaltado con colores de la salida de tests que fallan
  - files: packages/ui/src/data/progress.ts, packages/ui/src/data/progress.test.ts, docs/ui.md
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/progress.test.ts --include src/progress/progress-tab.test.ts && pnpm typecheck && pnpm lint
