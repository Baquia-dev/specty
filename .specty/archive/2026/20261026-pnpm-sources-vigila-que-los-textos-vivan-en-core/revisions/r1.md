---
kind: quick
follows:
  - 20261025-los-textos-del-servidor-y-de-los-hooks-viven-en
---

# pnpm sources vigila que los textos vivan en core

## Objetivo

Con la serie de cambios anterior, los textos que ven el agente y la persona viven en `packages/core/src/cards/`. La CLI se los pide a core, salvo los de `specty check` (`packages/cli/src/check/` y `commands/check.ts`), que cambia ahora otra sesión. Para que no vuelvan a aparecer textos propios en la CLI, `pnpm sources` falla si un archivo de `packages/cli/src` usa el traductor, salvo en esos dos sitios, y nombra el archivo. ARCHITECTURE y AGENTS.md lo cuentan.

## Archivos

- modificar scripts/check-sources.mjs — fallar si un archivo de packages/cli/src usa el traductor, salvo check
- modificar packages/cli/test/sources.test.ts — el test de esa regla
- modificar docs/ARCHITECTURE.md — la CLI pide sus textos a core, y pnpm sources lo comprueba
- modificar AGENTS.md — la misma convención, para el agente

## Tareas

- [ ] T1: pnpm sources falla si la CLI escribe sus propios textos
  - files: scripts/check-sources.mjs, packages/cli/test/sources.test.ts, docs/ARCHITECTURE.md, AGENTS.md
  - verify: pnpm check
  - type: feat
