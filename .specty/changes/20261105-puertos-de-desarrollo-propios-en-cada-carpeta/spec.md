---
kind: standard
---

# Puertos de desarrollo propios en cada carpeta

## Objetivo

Con varios cambios abiertos, cada uno en su worktree, dos sesiones que arrancan su servidor de desarrollo (`ng serve`, Vite…) chocan por el mismo puerto, o una ve el servidor de la otra (la otra mitad de «recursos de desarrollo por carpeta» de la épica «Memoria de Specty»). Con este cambio, `dev.ports` en `config.yaml` nombra los puertos de desarrollo del proyecto; Specty da a cada carpeta de cambio una posición propia y le dice al agente, al crearla y en `specty next`, qué puertos usar allí: los de `dev.ports` más esa posición. La carpeta principal sigue con los de siempre.

## Fuera de alcance

- Arrancar o parar servidores, o cambiar la configuración de las herramientas: Specty solo dice los puertos (D2 de la memoria: Specty detecta y el agente corrige).
- Detectar los puertos del proyecto: los nombra la persona en `dev.ports`.

## Supuestos

- A1: La posición de cada carpeta se guarda en `.git/common/specty/ports.json` (`{ "<carpeta>": <posición> }`), común a todas las worktrees; una carpeta nueva toma la posición libre más baja desde 1, y la de una carpeta que ya no existe vuelve a quedar libre.
  - impacto: alto
- A2: Los puertos de una carpeta son los de `dev.ports` sumándoles su posición (4200 y 5173 con la posición 2 dan 4202 y 5175); sin `dev.ports` no se guarda ni se dice nada.

## Criterios de aceptación

- AC1: CUANDO `dev.ports` tiene puertos y `specty new` crea un cambio en su worktree ENTONCES su tarjeta dice los puertos de esa carpeta, y otro cambio abierto a la vez recibe otros.
- AC2: CUANDO el agente ejecuta `specty next` en la carpeta de un cambio ENTONCES la tarjeta dice los puertos de esa carpeta; en la carpeta principal no dice nada de puertos.
- AC3: CUANDO la carpeta de un cambio ya no existe ENTONCES su posición queda libre para la siguiente carpeta nueva.
- AC4: CUANDO `dev.ports` no está ENTONCES ni `new` ni `next` dicen nada de puertos; y CUANDO tiene algo que no es una lista de puertos ENTONCES la configuración no es válida.

## Diseño

- Core: `dev` en `config.yaml` (`schema/dev.ts`, `DevConfig` con `ports`, y su sitio en `schema/config.ts`); `withDevPorts(card, ports, lang)` en `cards/ports.ts`, exportada en `cards/index.ts`: añade a una tarjeta la línea con los puertos de la carpeta, o la deja igual sin puertos.
- CLI: `store/ports.ts` con `portsOf(session, folder)`: lee `ports.json`, libera las posiciones de carpetas que no existen, da a la carpeta la suya o la libre más baja, la guarda y devuelve los puertos; vacío sin `dev.ports` o en la carpeta principal. `commands/new.ts` pasa la tarjeta de la worktree creada por `withDevPorts`; `commands/next.ts`, la de la carpeta de un cambio.

## Archivos

- crear packages/core/src/schema/dev.ts — `dev.ports`
- modificar packages/core/src/schema/config.ts — la sección `dev`
- crear packages/core/src/cards/ports.ts — la línea de los puertos de una carpeta
- modificar packages/core/src/cards/index.ts — exporta la línea
- crear packages/core/test/cards/dev-ports.test.ts — la línea y la configuración
- crear packages/cli/src/store/ports.ts — la posición de cada carpeta y sus puertos
- modificar packages/cli/src/commands/new.ts — los puertos en la tarjeta de la carpeta creada
- modificar packages/cli/src/commands/next.ts — los puertos en la tarjeta de la carpeta de un cambio
- crear packages/cli/test/dev-ports.test.ts — `new` y `next` con y sin `dev.ports`, y una posición que se libera
- modificar docs/formats.md — `dev.ports` y `ports.json`
- modificar docs/ARCHITECTURE.md — los puertos por carpeta

## Tareas

- [x] T1: `dev.ports` y la línea de los puertos
  - files: packages/core/src/schema/dev.ts, packages/core/src/schema/config.ts, packages/core/src/cards/ports.ts, packages/core/src/cards/index.ts, packages/core/test/cards/dev-ports.test.ts
  - ac: AC1, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/dev-ports.test.ts test/schema && pnpm typecheck && pnpm lint && pnpm sources
- [x] T2: Cada carpeta de cambio con sus puertos en `new` y `next`
  - files: packages/cli/src/store/ports.ts, packages/cli/src/commands/new.ts, packages/cli/src/commands/next.ts, packages/cli/test/dev-ports.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/dev-ports.test.ts test/commands.test.ts && pnpm typecheck && pnpm lint && pnpm exec knip
- [x] T3: La documentación
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm lint
  - type: docs
