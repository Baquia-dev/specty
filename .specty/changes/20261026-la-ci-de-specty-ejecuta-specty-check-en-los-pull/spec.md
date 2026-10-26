---
kind: standard
---

# La CI de Specty ejecuta specty check en los pull requests

## Objetivo

En cada pull request, la CI de Specty ejecuta su propio `specty check --changed` contra `main`, construido desde el código del PR. Así Specty se verifica a sí mismo con sus reglas. Solo falla lo que el PR añade o hace crecer, y las funciones que ya eran largas antes no lo bloquean.

## Fuera de alcance

- `specty check --all` en la CI, que exige saldar antes la deuda de funciones.
- Los pushes a `main`: ya ejecutan `pnpm check`, y su diff contra `main` está vacío.

## Supuestos

- A1: En un pull request, `actions/checkout` deja HEAD separado en el merge del PR y no crea la rama `main` local, que `--changed` necesita para su merge-base. Sin ella, `--changed` compararía con HEAD y pasaría sin mirar nada. El job descarga toda la historia (`fetch-depth: 0`) y crea `main` desde `origin/main`.
  - impacto: alto
- A2: Es un job aparte, solo en Ubuntu y solo en los pull requests. Vuelve a ejecutar los comandos del proyecto (lint, tipos y tests), además del job `check`, porque `specty check` no tiene una opción para saltarlos; corre en paralelo, así que no alarga la espera.

## Criterios de aceptación

- AC1: CUANDO llega un pull request ENTONCES un job de la CI construye el CLI del PR y ejecuta `specty check --changed` con la rama `main` local creada desde `origin/main`; los pushes no lo ejecutan.
- AC2: CUANDO `specty check --changed` corre en un HEAD separado con una rama `main` local ENTONCES mira lo que el PR añade respecto al merge-base con `main`, y no lo que ya estaba.

## Archivos

- modificar .github/workflows/ci.yml — el job `specty-check` en los pull requests
- modificar packages/cli/test/workflows.test.ts — el job nuevo
- crear packages/cli/test/check-pull-request.test.ts — `--changed` en un HEAD separado compara con `main`

## Tareas

- [x] T1: `--changed` en el checkout de un pull request
  - files: packages/cli/test/check-pull-request.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-pull-request.test.ts
  - type: test
- [x] T2: El job de la CI
  - files: .github/workflows/ci.yml, packages/cli/test/workflows.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/workflows.test.ts
  - type: ci
