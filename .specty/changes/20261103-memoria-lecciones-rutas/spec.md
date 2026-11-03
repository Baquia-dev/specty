---
kind: standard
---

# La memoria guarda lecciones y decisiones ligadas a rutas del código

## Objetivo

Lo que un agente aprende de una parte del código («este módulo no se puede importar desde el hilo principal», «los tests de aquí necesitan TZ local») se pierde con la conversación, y las decisiones de la persona no dicen a qué archivos afectan. Con este cambio, la memoria de Specty guarda lecciones, un tipo de entrada nuevo, y lecciones y decisiones pueden llevar las rutas a las que se refieren (`specty memory add … --path <ruta>…`). `specty memory` y la página «Memoria» las enseñan con sus rutas. Es la primera parte de la entrada P28: el cambio siguiente las llevará a la tarjeta de la tarea y a la del borrador.

## Fuera de alcance

- Mostrar las lecciones y las decisiones en la tarjeta de la tarea o en la del borrador según sus archivos: va en el cambio que sigue a este, que resuelve P28.
- Lecciones sacadas solas de los cierres o de los hallazgos de las tareas.

## Supuestos

- A1: Una lección (`lesson`) es un tipo de entrada más, con id `P` como los pendientes, y siempre lleva rutas: sin `--path`, `memory add` no la anota. No se toma con `--resolves`, no se marca hecha y no sale en la tarjeta de inicio; la persona la descarta como cualquier entrada.
  - impacto: alto
- A2: `--path <ruta>…` vale para cualquier tipo de entrada y acepta globs (`src/api/**`); la entrada las guarda en `paths`, en el orden dado y sin repetir.
  - impacto: alto
- A3: `specty memory` lista las rutas de cada entrada que las tiene, y la página «Memoria» gana la sección «Lecciones», después de las decisiones, y el tipo «Lecciones» en su filtro.

## Criterios de aceptación

- AC1: CUANDO un agente ejecuta `specty memory add "<texto>" --kind lesson --path <ruta>…` ENTONCES la lección queda en la memoria con sus rutas; y sin `--path` no se anota y Specty dice cómo hacerlo.
- AC2: CUANDO se anota una decisión u otra entrada con `--path` ENTONCES guarda sus rutas, y `specty memory` muestra las rutas de cada entrada que las tiene.
- AC3: CUANDO la persona abre la página «Memoria» con lecciones en la memoria ENTONCES las ve en la sección «Lecciones», con sus rutas, y puede filtrar por ese tipo.

## Diseño

- Core:
  - `memory/entries.ts`: `MEMORY_KINDS` gana `lesson`; `MemoryEntry.paths` (opcional, al menos una); el esquema exige rutas en una lección.
  - `cards/memory.ts`: el nombre del tipo, su sección en el índice de la rama, las rutas en la lista y la negativa `no-path`.
  - `cards/memory-claims.ts`: la negativa de `--resolves` nombra bien una lección.
- CLI: `memory add` gana `--path <globs...>` y la negativa de una lección sin rutas.
- UI: `memory-view.ts` gana la sección `lessons`, y `memory-page.ts` el tipo, su color, su filtro y las rutas de cada entrada.

## Archivos

- modificar packages/core/src/memory/entries.ts — el tipo `lesson` y las rutas de una entrada
- modificar packages/core/src/cards/memory.ts — el tipo, las rutas en la lista y la negativa sin rutas
- modificar packages/core/src/cards/memory-claims.ts — la negativa de `--resolves` para una lección
- modificar packages/cli/src/commands/memory.ts — `memory add --path`
- modificar packages/ui/src/memory/memory-view.ts — la sección «Lecciones»
- modificar packages/ui/src/memory/memory-page.ts — el tipo, su filtro y las rutas
- crear packages/core/test/memory/lessons.test.ts — la lección y las rutas en el modelo y en las tarjetas
- crear packages/cli/test/memory-lessons.test.ts — anotar lecciones y decisiones con rutas, con la memoria real
- crear packages/ui/src/memory/memory-lessons.test.ts — las lecciones en la página
- modificar docs/formats.md — `lesson`, `paths` y `--path`

## Tareas

- [x] T1: La lección y las rutas en el modelo y en las tarjetas
  - files: packages/core/src/memory/entries.ts, packages/core/src/cards/memory.ts, packages/core/src/cards/memory-claims.ts, packages/core/test/memory/lessons.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/memory && pnpm lint
- [x] T2: `memory add --path`, y la documentación
  - files: packages/cli/src/commands/memory.ts, packages/cli/test/memory-lessons.test.ts, docs/formats.md
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/memory-lessons.test.ts test/memory.test.ts && pnpm lint
- [x] T3: Las lecciones en la página «Memoria»
  - files: packages/ui/src/memory/memory-view.ts, packages/ui/src/memory/memory-page.ts, packages/ui/src/memory/memory-lessons.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/memory/memory-lessons.test.ts --include src/memory/memory-page.test.ts --include src/memory/memory-filter.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: Un agente anota lecciones sin valor que luego llenan las tarjetas — solo saldrán en las tarjetas de las tareas que tocan sus rutas, y la persona las descarta.
