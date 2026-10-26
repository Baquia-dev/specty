---
kind: standard
follows:
  - 20261025-los-textos-de-accept-close-y-cancel-viven-en-cor
---

# Los textos de init y sus plantillas viven en core

## Objetivo

Sexto cambio de la serie que lleva a core los textos de la CLI, el primero de la instalación. `init` arma en la CLI sus rechazos, lo que dice de cada archivo, su tarjeta final, su simulación (`--dry-run`) y lo que sigue en un proyecto nuevo. Además, la CLI escribe con textos propios el `.specty/config.yaml` inicial, con sus comentarios, y el `PRODUCT.md` de un proyecto nuevo, con sus preguntas. Las plantillas pasan a `core/src/templates.ts`, junto a la de la spec, y lo demás a `cards/init.ts`. La salida y los archivos que escribe `init` no cambian ni una letra.

## Fuera de alcance

- Los textos de los hooks (`install/hooks.ts`) y del commit de `init` (`install/commit.ts`), que llegan en el siguiente cambio de la serie.
- Los textos de `doctor`, `uninstall` y los demás comandos.
- Cambiar cualquier texto: se mueven tal cual.

## Supuestos

- A1: `renderConfig` y `newProjectNext` solo los usa `init.ts`, así que pueden salir de la CLI sin dejar envoltorios.

## Criterios de aceptación

- AC1: CUANDO `specty init` se rechaza (fuera de un repositorio git o con un `config.yaml` no válido), termina o simula ENTONCES su salida es la misma que antes y sale de `cards/init.ts` de core.
- AC2: CUANDO `specty init` crea `.specty/config.yaml` o, en un proyecto nuevo, `PRODUCT.md` ENTONCES su contenido es el mismo que antes y sale de las plantillas de core.
- AC3: CUANDO se ejecutan los tests de core ENTONCES cubren cada caso de `cards/init.ts` y las dos plantillas, en español y en inglés.

## Archivos

- modificar packages/core/src/templates.ts — las plantillas de config.yaml y de PRODUCT.md, junto a la de la spec
- modificar packages/core/src/index.ts — exportarlas
- crear packages/core/test/templates.test.ts — tests de las dos plantillas
- crear packages/core/src/cards/init.ts — los rechazos, las líneas, la tarjeta y la simulación de init, y lo que sigue en un proyecto nuevo
- modificar packages/core/src/cards/index.ts — exportarlos
- crear packages/core/test/cards/init.test.ts — tests de cards/init.ts
- modificar packages/cli/src/commands/init.ts — pedir sus textos a core
- modificar packages/cli/src/install/project-files.ts — sin renderConfig, que pasa a core
- modificar packages/cli/src/install/product.ts — las preguntas y PRODUCT.md desde core, sin newProjectNext

## Tareas

- [x] T1: Core tiene las plantillas de config.yaml y de PRODUCT.md
  - files: packages/core/src/templates.ts, packages/core/src/index.ts, packages/core/test/templates.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-core typecheck && pnpm --filter @baquia-dev/specty-core test
  - type: refactor
- [x] T2: Core tiene los textos de init
  - files: packages/core/src/cards/init.ts, packages/core/src/cards/index.ts, packages/core/test/cards/init.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-core typecheck && pnpm --filter @baquia-dev/specty-core test
  - type: refactor
- [ ] T3: init pide sus textos y sus plantillas a core
  - files: packages/cli/src/commands/init.ts, packages/cli/src/install/project-files.ts, packages/cli/src/install/product.ts
  - ac: AC1, AC2
  - verify: pnpm check
  - type: refactor
