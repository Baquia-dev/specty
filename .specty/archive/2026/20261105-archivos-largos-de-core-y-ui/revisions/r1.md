---
kind: standard
follows:
  - 20261105-funciones-largas-de-exporters-vscode-y-ui
---

# Los archivos largos de core y la UI, divididos por responsabilidad

## Objetivo

Resuelve P62 y P66. `specty check --all` avisa en `max-lines` de cinco archivos: `packages/core/src/cards/next.ts` (312 líneas de código, aviso a partir de 300), y en la UI `components/item-tooltip.ts` (499), `data/fixtures.ts` (314), `components/item-tooltip.test.ts` (415, aviso a partir de 400 en los tests) y `data/mcp-app.test.ts` (430). Este cambio saca de cada uno una responsabilidad propia a su archivo, sin cambiar lo que hacen.

## Fuera de alcance

- Cambiar lo que hacen estos archivos o lo que comprueban sus tests: los tests que ya existen se mueven tal cual, sin cambiar sus aserciones.
- `cards/index.ts` y `index.ts` de core: `lines.exclude` ya los deja fuera.

## Supuestos

- A1: Un test que solo pasa de archivo, con sus aserciones intactas, sigue siendo el mismo contrato; el aviso de aserciones quitadas de su archivo de origen se explica en el cierre.
- A2: El andamiaje del MCP App que comparten sus tests (el host simulado y cómo se crea la fuente) puede vivir en `packages/ui/src/data/testing/mcp-host.ts`, la convención de Angular para lo que solo usan los tests; no usa globales de Vitest, así que compila también con la app.
  - impacto: alto

## Criterios de aceptación

- AC1: CUANDO se ejecuta `specty check --all` con el CLI construido sobre este cambio ENTONCES `max-lines` no avisa de ninguno de los cinco archivos ni de los nuevos.
  - test: manual
- AC2: CUANDO se ejecuta `pnpm check` ENTONCES pasa, con los mismos tests que antes (movidos, no cambiados).
  - test: manual

## Diseño

- `cards/next.ts`: la tarjeta sin cambio activo (`noChangeCard`, con `withoutSpecCard`, `skeletonCard`, `idleCard` y los textos de `specty new`: `untypedNewNext`, `typedNewNext` y `quickHint`) pasa a `cards/idle.ts`, como propone P66; `next.ts` la importa.
- `components/item-tooltip.ts` queda con la directiva `ItemTooltips` y el componente `ItemText`. Lo que sabe de las siglas (sus expresiones, sus nombres, `formatItemTooltip`, `splitItemRefs`, `itemsOfReview`, `itemsOfChange` y cómo se halla la sigla bajo el puntero) pasa a `components/item-refs.ts`; la burbuja en el DOM (`renderBubble`, su cabecera y su botón de cerrar, la paleta de las fijadas, el arrastre y las posiciones) pasa a `components/item-bubble.ts`.
- `components/item-tooltip.test.ts`: el test de las funciones puras de las siglas (AC1, «formats item and request siglas…») pasa a `components/item-refs.test.ts`.
- `data/fixtures.ts`: lo que cada decisión de la revisión hace a un registro (decidir un supuesto, comentar, editar y borrar un comentario, aprobar) pasa a funciones `…In(record, …)` en un `data/sample-review.ts` nuevo, como `decideScopeIn` y `decideResultIn`; confirmar el cierre pasa a `confirmClosingIn` en `data/sample-acceptance.ts`, y `decided` de la memoria a `decidedIn` en `data/sample-memory.ts`.
- `data/mcp-app.test.ts`: el andamiaje compartido pasa a `data/testing/mcp-host.ts` (A2), y el bloque «the data source of the MCP App, live» a `data/mcp-app-live.test.ts`.

## Archivos

- modificar packages/core/src/cards/next.ts — sin la tarjeta sin cambio activo
- crear packages/core/src/cards/idle.ts — la tarjeta sin cambio activo
- modificar packages/ui/src/components/item-tooltip.ts — solo la directiva y el componente
- crear packages/ui/src/components/item-refs.ts — las siglas y dónde están
- crear packages/ui/src/components/item-bubble.ts — la burbuja en el DOM
- modificar packages/ui/src/components/item-tooltip.test.ts — sin el test de las funciones puras
- crear packages/ui/src/components/item-refs.test.ts — el test de las funciones puras
- modificar packages/ui/src/data/fixtures.ts — sin lo que las decisiones hacen a un registro
- crear packages/ui/src/data/sample-review.ts — las decisiones de la revisión sobre la muestra
- modificar packages/ui/src/data/sample-acceptance.ts — confirmClosingIn
- modificar packages/ui/src/data/sample-memory.ts — decidedIn
- modificar packages/ui/src/data/mcp-app.test.ts — sin el andamiaje ni el bloque live
- crear packages/ui/src/data/mcp-app-live.test.ts — el bloque live
- crear packages/ui/src/data/testing/mcp-host.ts — el andamiaje compartido de los tests del MCP App

## Tareas

- [ ] T1: La tarjeta sin cambio activo, en su archivo
  - files: packages/core/src/cards/next.ts, packages/core/src/cards/idle.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint && pnpm knip
  - type: refactor
- [ ] T2: Las siglas y su burbuja, fuera de la directiva
  - files: packages/ui/src/components/item-tooltip.ts, packages/ui/src/components/item-refs.ts, packages/ui/src/components/item-bubble.ts, packages/ui/src/components/item-tooltip.test.ts, packages/ui/src/components/item-refs.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/components/item-tooltip.test.ts --include src/components/item-refs.test.ts --include src/history/history-tab.test.ts && pnpm --filter @baquia-dev/specty-ui typecheck && pnpm lint && pnpm knip
  - type: refactor
- [ ] T3: Las decisiones sobre la muestra, fuera de la fuente del prototipo
  - files: packages/ui/src/data/fixtures.ts, packages/ui/src/data/sample-review.ts, packages/ui/src/data/sample-acceptance.ts, packages/ui/src/data/sample-memory.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/fixtures.test.ts --include src/data/decisions.test.ts --include src/review/review-actions.test.ts --include src/acceptance/closing-actions.test.ts --include src/memory/memory-actions.test.ts && pnpm --filter @baquia-dev/specty-ui typecheck && pnpm lint && pnpm knip
  - type: refactor
- [ ] T4: Los tests del MCP App, con su andamiaje aparte
  - files: packages/ui/src/data/mcp-app.test.ts, packages/ui/src/data/mcp-app-live.test.ts, packages/ui/src/data/testing/mcp-host.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/mcp-app.test.ts --include src/data/mcp-app-live.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: refactor
