---
kind: quick
---

# Los comandos del CI se marcan y no cuentan los que esconden su salida

## Objetivo

La detección rellena con los comandos del CI los que la pila no da, pero no dice de dónde salió cada uno. Además toma un comando como `make test || true`, que pasa siempre, o `make test | tee test.log`, que devuelve la salida de `tee` y no la de los tests. Desde este cambio, cada comando que viene del CI lleva «(CI)» en su etiqueta, en lo que `init` dice que detectó y en los hechos de AGENTS.md («Tests (CI): `make test`»). Y un comando del CI con una tubería (`|`, también `||`) no cuenta.

## Archivos

- modificar packages/cli/src/detect/ci.ts — un comando con `|` no cuenta
- modificar packages/cli/src/detect/project.ts — `Detection.fromCi` y la etiqueta «(CI)» en `projectFacts`
- crear packages/cli/test/detect-ci-marks.test.ts — la marca y las tuberías
- modificar docs/ARCHITECTURE.md — §7: la marca y las tuberías

## Tareas

- [ ] T1: Los comandos del CI se marcan y no cuentan los que esconden su salida
  - files: packages/cli/src/detect/ci.ts, packages/cli/src/detect/project.ts, packages/cli/test/detect-ci-marks.test.ts, docs/ARCHITECTURE.md
  - verify: pnpm typecheck && pnpm lint && pnpm knip && pnpm --filter @baquia-dev/specty exec vitest run test/detect-ci-marks.test.ts test/detect-ci.test.ts test/detect-quality.test.ts
  - type: feat
