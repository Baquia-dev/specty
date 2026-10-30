---
kind: quick
---

# Los tests de exporters y vscode dejan LCOV

## Objetivo

Los tests de core, la CLI y la UI ya dejan su informe LCOV, y la verificación completa mide con él la cobertura de lo que añade cada cambio. Faltan exporters y vscode: con `lcovonly` junto a `text-summary` en sus `vitest.config.ts`, dejan `coverage/lcov.info` en su paquete, sin informe HTML, y un cambio que los toque también muestra su cobertura al aceptarse.

## Archivos

- modificar packages/exporters/vitest.config.ts — el informe `lcovonly`
- modificar packages/vscode/vitest.config.ts — el informe `lcovonly`

## Tareas

- [ ] T1: Los tests de exporters y vscode dejan LCOV
  - files: packages/exporters/vitest.config.ts, packages/vscode/vitest.config.ts
  - verify: pnpm --filter @baquia-dev/specty-exporters test && pnpm --filter specty-vscode test && test -f packages/exporters/coverage/lcov.info && test -f packages/vscode/coverage/lcov.info && test ! -d packages/exporters/coverage/lcov-report && test ! -d packages/vscode/coverage/lcov-report
  - type: chore
