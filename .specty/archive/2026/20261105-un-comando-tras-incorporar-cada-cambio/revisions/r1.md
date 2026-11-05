---
kind: standard
---

# Un comando tras incorporar cada cambio

## Objetivo

Cuando un cambio entra en la rama principal, la carpeta que la tiene queda con el código nuevo pero sin lo que se genera de él: en este repositorio, el dist del CLI que ejecuta el `specty` global, que cada sesión tiene que recompilar a mano tras cerrar (la mitad de «recursos de desarrollo por carpeta» de la épica «Memoria de Specty»). Con este cambio, `git.afterLanding` en `config.yaml` nombra un comando que Specty ejecuta en esa carpeta cada vez que incorpora un cambio, y el cierre dice si pasó.

## Fuera de alcance

- Los puertos de los servidores de desarrollo por carpeta: van en otro cambio.
- Deshacer la incorporación si el comando falla: el cambio ya está en la rama principal; el cierre solo lo dice.
- Ejecutarlo cuando la rama principal no está en ninguna carpeta: no hay dónde.

## Supuestos

- A1: El comando corre con la shell en la carpeta que tiene la rama destino, con el límite de `verify.timeoutSec`, después de que la rama avanzó y antes de quitar la worktree del cambio, como `git.setup` corre en una carpeta nueva.
  - impacto: alto
- A2: Corre en las tres maneras de incorporar: `close`, su reintento y el `accept` del carril rápido, que pasan todas por `landChange`.

## Criterios de aceptación

- AC1: CUANDO `git.afterLanding` tiene un comando y un cambio se incorpora a la rama principal ENTONCES Specty lo ejecuta en la carpeta que tiene esa rama y el cierre dice que pasó, con el comando y la carpeta.
- AC2: CUANDO el comando falla ENTONCES el cambio queda cerrado e incorporado igualmente, y el cierre dice que falló, con su última línea, para que el agente lo corrija.
- AC3: CUANDO `git.afterLanding` no está, o la rama principal no avanzó ENTONCES no se ejecuta nada ni se dice nada de él.
- AC4: CUANDO `git.afterLanding` no es un texto ENTONCES la configuración no es válida.

## Diseño

- Core: `GitConfig.afterLanding?: string` en `schema/git.ts`, con `GitSchema` y `resolveGit`; `afterLandingLine(command, folder, ok, last, lang)` en `cards/land.ts`, y `landingNote(command, lang)` para la salida de error mientras corre.
- CLI: `flow/land.ts`, tras `landedLine` y antes de quitar la worktree, ejecuta `git.afterLanding` con `execute` en `plan.holder` o, si el cambio vivía en la carpeta principal, en `plan.main`, y añade su línea.
- Este repositorio lo activa la persona en `.specty/config.yaml` (`git.afterLanding: "pnpm --filter @baquia-dev/specty build"`): el guard no deja al agente editar ese archivo.

## Archivos

- modificar packages/core/src/schema/git.ts — `afterLanding`
- modificar packages/core/src/cards/land.ts — la línea del comando tras incorporar y su aviso mientras corre
- modificar packages/core/src/cards/index.ts — exporta las dos
- modificar packages/core/src/index.ts — exporta las dos
- modificar packages/cli/src/flow/land.ts — ejecuta `git.afterLanding` tras incorporar
- crear packages/core/test/cards/after-landing.test.ts — la línea en español y en inglés, y la configuración
- crear packages/cli/test/after-landing.test.ts — el comando al cerrar, su fallo y sin él
- modificar docs/formats.md — `git.afterLanding`
- modificar docs/ARCHITECTURE.md — el comando tras incorporar

## Tareas

- [ ] T1: `git.afterLanding` y sus textos
  - files: packages/core/src/schema/git.ts, packages/core/src/cards/land.ts, packages/core/src/cards/index.ts, packages/core/src/index.ts, packages/core/test/cards/after-landing.test.ts
  - ac: AC1, AC2, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/after-landing.test.ts && pnpm typecheck && pnpm lint && pnpm sources
- [ ] T2: Specty ejecuta el comando tras incorporar
  - files: packages/cli/src/flow/land.ts, packages/cli/test/after-landing.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/after-landing.test.ts test/integrate.test.ts test/close-turn.test.ts && pnpm typecheck && pnpm lint && pnpm exec knip
- [ ] T3: La documentación
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm lint
  - type: docs
