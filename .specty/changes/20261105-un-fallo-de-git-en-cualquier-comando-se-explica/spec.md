---
kind: standard
---

# Un fallo de git en cualquier comando se explica

## Objetivo

Cuando git falla dentro de un comando de Specty que no es `init` (`approve`, `task done`, `close`, `integrate`…), el `GitError` sale como traza de Node. Con este cambio, el comando termina con una tarjeta de error en el idioma de la sesión que dice qué orden de git falló y por qué, sin la traza, y un SIGUIENTE que pide corregirlo y volver a ejecutar el comando.

## Fuera de alcance

- Deshacer lo que el comando ya hizo antes del fallo: cada comando ya escribe su estado después de sus commits, y `init` sigue deshaciendo lo suyo como hoy.
- Los errores que no son de git: siguen saliendo como hoy.
- Los hooks de los agentes (`specty guard`, `specty hook`), que tienen su propio manejo.

## Supuestos

- A1: Basta con capturar el `GitError` en `sessionRunner` de `program.ts`, por donde pasan todos los comandos que abren una sesión; el texto de la falla es el de `init`: la orden de git y su error en una línea, sin las líneas `hint:`.
  - impacto: alto
- A2: La tarjeta sale con estado de error (código 1) y en el idioma de la sesión, o en el del sistema si la sesión no llegó a abrirse.

## Criterios de aceptación

- AC1: CUANDO git falla dentro de un comando de Specty, como el commit de `specty approve` ENTONCES el comando termina con código 1 y una tarjeta que dice qué orden de git falló y su error, sin traza ni `hint:`, y un SIGUIENTE que pide corregirlo y volver a ejecutar el comando.
- AC2: CUANDO la sesión es en inglés ENTONCES la tarjeta del fallo de git está en inglés.

## Diseño

- `io/git.ts`: `gitFailure(error)`, la orden y su error en una línea sin `hint:`, que hoy es `failure` en `install/commit.ts`; los dos la usan.
- Core: `gitFailedCard(detail, ctx)` en `cards/git-failed.ts`, exportada en `cards/index.ts` (que `index.ts` reexporta).
- `program.ts`: `sessionRunner` captura un `GitError` del comando y emite `gitFailedCard(gitFailure(error), cards)`; cualquier otro error sigue subiendo.

## Archivos

- modificar packages/cli/src/io/git.ts — `gitFailure`, la falla de git en una línea
- modificar packages/cli/src/install/commit.ts — usa `gitFailure`
- modificar packages/cli/src/program.ts — `sessionRunner` explica un `GitError`
- crear packages/core/src/cards/git-failed.ts — la tarjeta del fallo de git
- modificar packages/core/src/cards/index.ts — exporta la tarjeta
- crear packages/core/test/cards/git-failed.test.ts — la tarjeta en español y en inglés
- crear packages/cli/test/git-failed.test.ts — `approve` con un commit que falla
- modificar docs/ARCHITECTURE.md — cómo sale un fallo de git

## Tareas

- [x] T1: La tarjeta del fallo de git
  - files: packages/core/src/cards/git-failed.ts, packages/core/src/cards/index.ts, packages/core/test/cards/git-failed.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/git-failed.test.ts && pnpm typecheck && pnpm lint && pnpm sources
  - type: fix
- [x] T2: Los comandos explican un fallo de git
  - files: packages/cli/src/io/git.ts, packages/cli/src/install/commit.ts, packages/cli/src/program.ts, packages/cli/test/git-failed.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/git-failed.test.ts test/init-commit.test.ts test/check-install.test.ts && pnpm typecheck && pnpm lint && pnpm exec knip
  - type: fix
- [ ] T3: La documentación
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm lint
  - type: docs
