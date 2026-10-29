---
kind: quick
---

# El test de la extensión sin enlace de specty ui deja de fallar a veces

## Objetivo

El test «AC3: fails when `specty ui` ends without a link, or gives none in time» de la extensión de VS Code falla a veces con la máquina cargada. En el caso sin enlace, `startUi` espera 300 ms y para el proceso de prueba con SIGTERM; si Node aún no ha arrancado el script, la señal llega antes de que este escuche y el proceso muere sin dejar la marca `stopped` que el test espera. El script de prueba pasa a escuchar SIGTERM antes que nada, y el caso sin enlace espera 2 s, de sobra para que arranque. La extensión no cambia.

## Archivos

- modificar packages/vscode/test/specty.test.ts — el script de prueba escucha SIGTERM primero, y el caso sin enlace espera 2 s

## Tareas

- [ ] T1: El script de prueba escucha la parada primero y el caso sin enlace espera 2 s
  - files: packages/vscode/test/specty.test.ts
  - verify: for i in 1 2 3 4 5; do pnpm exec vitest run --root packages/vscode test/specty.test.ts || exit 1; done && pnpm lint
  - type: test
