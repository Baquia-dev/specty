---
kind: quick
follows:
  - 20261024-regla-agnostica-del-tamano-de-los-archivos-en-ta
---

# pnpm sources solo comprueba la cabecera SPDX

## Objetivo

El tamaño de los archivos lo vigila ahora Specty en `task done`, en cualquier lenguaje, así que `pnpm sources` deja de medirlo: solo comprueba la cabecera SPDX (ADR 0008), y ya no tiene reglas propias de TypeScript para el tamaño. AGENTS.md describe la regla de Specty como criterio, no como un número del script.

## Archivos

- modificar scripts/check-sources.mjs — solo la cabecera SPDX
- modificar packages/cli/test/sources.test.ts — solo la cabecera
- modificar AGENTS.md — la regla del tamaño es la de Specty en `task done`

## Tareas

- [ ] T1: pnpm sources solo comprueba la cabecera SPDX
  - files: scripts/check-sources.mjs, packages/cli/test/sources.test.ts, AGENTS.md
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/sources.test.ts && pnpm sources
  - type: build
