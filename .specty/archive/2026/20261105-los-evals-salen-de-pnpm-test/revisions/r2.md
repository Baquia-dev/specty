---
kind: standard
---

# Los tests de los evals salen de pnpm test y pnpm check

## Objetivo

`pnpm test` recorre todos los paquetes del workspace, también `evals`, cuyos tests juzgan escenarios simulados y transcripciones grabadas y casi nunca cambian. Cada verificación de tarea (`verify.default`) y cada verificación completa (`pnpm check`) los ejecuta: unos 80 s de máquina por ejecución, en un equipo donde la verificación completa ya es el 81 % del tiempo de verificación y varias sesiones se turnan para correrla. Con este cambio, `pnpm test` y `pnpm check` no ejecutan los tests de `evals`; `pnpm test:evals` los ejecuta aparte, y el CI los sigue ejecutando en cada push y pull request, así que ningún fallo suyo llega a main sin verse.

## Fuera de alcance

- `pnpm evals`, que ejecuta los agentes reales: no cambia.
- El tipado (`pnpm typecheck`) y knip de `evals`, que son rápidos y siguen en `pnpm check`.
- Ejecutar los tests de `evals` solo cuando un cambio toca su código o el que importan (puntos 3 y 6 del plan).

## Supuestos

- A1: Los tests de `evals` fallan casi solo cuando se toca `evals/` o los textos y escenarios del CLI que juzgan; el CI, que los ejecuta en cada push y pull request, basta para verlos fallar antes de publicar.
  - impacto: medio
- A2: El filtro `--filter '!@baquia-dev/specty-evals'` de pnpm deja fuera solo ese paquete y mantiene el orden y `--workspace-concurrency=1` de los demás.

## Criterios de aceptación

- AC1: CUANDO se ejecuta `pnpm test` en la raíz ENTONCES corren los tests de todos los paquetes salvo `evals`.
  - test: manual
- AC2: CUANDO se ejecuta `pnpm test:evals` en la raíz ENTONCES corren los tests de `evals`.
  - test: manual
- AC3: CUANDO el CI ejecuta `pnpm check` en un push o un pull request ENTONCES ejecuta también `pnpm test:evals`.

## Diseño

- `package.json` (raíz): `test` añade `--filter '!@baquia-dev/specty-evals'`; nuevo `test:evals` = `pnpm --filter @baquia-dev/specty-evals test`.
- `.github/workflows/ci.yml`: tras `pnpm check`, un paso `pnpm test:evals` en el mismo trabajo.
- `packages/cli/test/workflows.test.ts`: el trabajo `check` ejecuta `pnpm test:evals` tras `pnpm check` (AC3).
- `AGENTS.md` (Comandos) y `docs/ARCHITECTURE.md` (§16 «Cuándo corre» y el párrafo del CI): dónde corren ahora esos tests.

## Archivos

- modificar package.json — `test` sin los evals y `test:evals`
- modificar .github/workflows/ci.yml — el CI ejecuta los tests de los evals
- modificar packages/cli/test/workflows.test.ts — AC3
- modificar AGENTS.md — los comandos de tests
- modificar docs/ARCHITECTURE.md — dónde corren los tests de los evals

## Tareas

- [ ] T1: pnpm test y pnpm check dejan fuera los tests de los evals, que corren con pnpm test:evals y en el CI
  - files: package.json, .github/workflows/ci.yml, packages/cli/test/workflows.test.ts, AGENTS.md, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/workflows.test.ts && pnpm test:evals && pnpm lint && pnpm typecheck
  - type: perf
