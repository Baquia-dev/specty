---
kind: standard
---

# El hilo principal de la UI importa core por una entrada ligera

## Objetivo

El hilo principal de la UI solo usa de core los idiomas (`LANGS`, `fold`), el traductor y la lista de fases, pero los importa por el índice de core. Mientras ningún chunk perezoso usaba el parser no pesaba, pero desde la exportación del Historial esbuild lleva el parser, zod y yaml a un chunk compartido que carga la página: el bundle inicial pasó de 521 a 740 kB. Core gana una entrada ligera, `@baquia-dev/specty-core/light`, y el hilo principal importa de ella; el parser vuelve a cargarse solo en el worker y con la página del cambio.

## Fuera de alcance

- Derivar las vistas en el hilo principal cuando no hay workers (MCP Apps): lo hará la épica de MCP Apps, a la que esto deja el camino libre.
- Una entrada mínima para el guard y los hooks de la CLI.
- El peso de `@lucide/angular` en el bundle inicial.

## Supuestos

- A1: Basta con que ningún módulo del hilo principal importe el índice de core en tiempo de ejecución: los `import type` se borran al compilar, y lo que solo usan el worker (`data/views.ts` y lo que importa) o la página del cambio (`data/export.ts`) puede seguir usando el índice.
  - impacto: alto

## Criterios de aceptación

- AC1: CUANDO el hilo principal de la UI usa los idiomas, el traductor o las fases de core ENTONCES los importa de `@baquia-dev/specty-core/light`, cuyos módulos no importan zod, yaml, picomatch ni `@noble/hashes`, y que da los mismos valores que el índice.
- AC2: CUANDO se construye la UI ENTONCES el bundle inicial ya no lleva el parser de core y vuelve a unos 521 kB, con la exportación en el chunk perezoso de la página del cambio.
  - test: manual

## Diseño

- `core/src/light.ts` reexporta `LANGS`, `fold` y `Lang` de `i18n.ts`, `translator` de `cards/text.ts` y `PHASES` y `Phase` de `flow/phases.ts`; `package.json` de core la publica como `./light`.
- Un test recorre las importaciones de `light.ts` y comprueba que ninguna llega a zod, yaml, picomatch ni `@noble/hashes`, y que sus valores son los del índice.
- Los archivos del hilo principal que hoy importan esos valores del índice pasan a `/light`; los tipos pueden seguir viniendo del índice con `import type`.
- AGENTS.md cuenta la entrada ligera como tercera lista de la API pública de core.

## Archivos

- crear packages/core/src/light.ts — la entrada ligera
- modificar packages/core/package.json — publica `./light`
- crear packages/core/test/light.test.ts — sus módulos y sus valores
- modificar packages/ui/src/theme/preferences.ts — `LANGS` y `translator` de la entrada ligera
- modificar packages/ui/src/theme/tokens.ts — `PHASES` de la entrada ligera
- modificar packages/ui/src/app/preferences-menu.ts — `LANGS` de la entrada ligera
- modificar packages/ui/src/components/command-palette.ts — `fold` de la entrada ligera
- modificar packages/ui/src/inbox/inbox-toolbar.ts — `PHASES` de la entrada ligera
- modificar packages/ui/src/inbox/inbox-view.ts — `PHASES` de la entrada ligera
- modificar packages/ui/src/catalog/colors.ts — `PHASES` de la entrada ligera
- modificar packages/ui/src/catalog/components.ts — `PHASES` de la entrada ligera
- modificar AGENTS.md — la entrada ligera en la API pública de core

## Tareas

- [x] T1: La entrada ligera de core
  - files: packages/core/src/light.ts, packages/core/package.json, packages/core/test/light.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/light.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint
  - type: refactor
- [ ] T2: El hilo principal de la UI importa de la entrada ligera
  - files: packages/ui/src/theme/preferences.ts, packages/ui/src/theme/tokens.ts, packages/ui/src/app/preferences-menu.ts, packages/ui/src/components/command-palette.ts, packages/ui/src/inbox/inbox-toolbar.ts, packages/ui/src/inbox/inbox-view.ts, packages/ui/src/catalog/colors.ts, packages/ui/src/catalog/components.ts, AGENTS.md
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui typecheck && pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/theme --include src/inbox --include src/components/command-palette.test.ts && pnpm lint && pnpm knip
  - type: refactor
