---
kind: quick
---

# La caché del E2E de OpenCode sobrevive a cada ejecución de tests

## Objetivo

Desde la épica de los temporales, `tmpdir()` dentro de los tests es la carpeta de cada ejecución, que se borra al terminar, y con ella la caché del E2E de OpenCode (`specty-e2e-opencode-cache`): con OpenCode instalado, su proveedor se descarga en cada pasada (P182). Con este cambio, el `globalSetup` de los tests deja en `SPECTY_TESTS_CACHE` una carpeta compartida en la carpeta temporal del sistema (`specty-tests-cache`), que no crea ni borra, y respeta la que ya venga puesta; el E2E de OpenCode guarda allí su caché.

## Archivos

- modificar packages/core/vitest-temp-dir.ts — deja `SPECTY_TESTS_CACHE` con la carpeta compartida, y la restaura al terminar
- modificar packages/core/test/vitest-temp-dir.test.ts — la variable apunta fuera de la carpeta de la ejecución, lo que hay en ella queda, y una ya puesta se respeta
- modificar packages/cli/test/opencode-e2e.test.ts — la caché de OpenCode va en `SPECTY_TESTS_CACHE`
- modificar docs/ARCHITECTURE.md — los temporales de los tests cuentan la carpeta compartida de las cachés

## Tareas

- [ ] T1: Una carpeta compartida para las cachés de los tests
  - files: packages/core/vitest-temp-dir.ts, packages/core/test/vitest-temp-dir.test.ts, packages/cli/test/opencode-e2e.test.ts, docs/ARCHITECTURE.md
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/vitest-temp-dir.test.ts && pnpm --filter @baquia-dev/specty exec vitest run test/opencode-e2e.test.ts && pnpm typecheck && pnpm lint && pnpm knip
