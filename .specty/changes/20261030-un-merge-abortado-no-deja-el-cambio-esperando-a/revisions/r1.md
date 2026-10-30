---
kind: quick
---

# Un merge abortado no deja el cambio esperando a integrate

## Objetivo

Si `accept` deja a medias el merge de la rama principal y el agente pide un ajuste, `adjust` pasa el cambio a ajuste con la incorporación aún anotada; si luego alguien aborta el merge, `specty next` sigue pidiendo `specty integrate`, que solo sugiere repetir `accept`, imposible en ajuste, y el cambio queda atascado. Con el arreglo, `specty next` descarta la incorporación cuyo merge ya no está en curso, como ya hacen `accept` y `close`, y `adjust` se niega mientras el merge sigue en curso: pide terminarlo con `specty integrate` y volver a pedir el ajuste. Si el merge ya se abortó, `adjust` descarta la incorporación y anota el ajuste.

## Archivos

- modificar packages/core/src/cards/adjust.ts — la negativa por un merge en curso, con su texto en español e inglés
- modificar packages/cli/src/commands/adjust.ts — se niega con el merge en curso y descarta la incorporación de un merge abortado antes de anotar el ajuste
- modificar packages/cli/src/commands/next.ts — descarta la incorporación cuyo merge ya no está en curso
- modificar packages/core/test/cards/adjust.test.ts — el texto de la negativa en los dos idiomas
- crear packages/cli/test/integrate-aborted.test.ts — `next` y `adjust` tras un `accept` que deja el merge en curso, con él en curso y abortado
- modificar docs/ARCHITECTURE.md — §9, Incorporación: qué hacen `next` y `adjust` con la incorporación pendiente

## Tareas

- [ ] T1: next descarta un merge abortado y adjust espera al merge en curso
  - files: packages/core/src/cards/adjust.ts, packages/cli/src/commands/adjust.ts, packages/cli/src/commands/next.ts, packages/core/test/cards/adjust.test.ts, packages/cli/test/integrate-aborted.test.ts, docs/ARCHITECTURE.md
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/adjust.test.ts && pnpm --filter @baquia-dev/specty exec vitest run test/integrate-aborted.test.ts test/integrate.test.ts && pnpm lint
  - type: fix
