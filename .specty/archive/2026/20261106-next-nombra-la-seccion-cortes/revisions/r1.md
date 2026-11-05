---
kind: quick
---

# La tarjeta de next nombra la sección Cortes de un comentario

## Objetivo

La tarjeta de `specty next` nombra «Cortes» («Slices» en inglés) la sección de un comentario sobre texto citado en los cortes de una épica, como ya nombra las demás secciones, en vez de su clave `slices` (P188): la UI ancla citas a esa sección desde 20261106-la-pestana-spec-muestra-los-cortes-de-una-epica.

## Archivos

- modificar packages/core/src/cards/next.ts — `SECTIONS` nombra la sección `slices`: «Cortes»/«Slices»
- modificar packages/core/test/cards.test.ts — un comentario citado en `slices` se lee «Cortes «…»» en español y «Slices "…"» en inglés

## Tareas

- [ ] T1: La tarjeta de next nombra la sección Cortes de un comentario citado
  - files: packages/core/src/cards/next.ts, packages/core/test/cards.test.ts
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards.test.ts && pnpm typecheck && pnpm lint
  - type: fix
