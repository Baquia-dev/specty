---
kind: standard
---

# specty why: de dónde viene una línea

## Objetivo

PRODUCT.md promete para la versión 1 la trazabilidad línea a línea, y ARCHITECTURE §13 describe `specty why <ruta>[:<línea>]`, pero el comando no existe. Los datos ya están en git: cada commit de una tarea lleva los trailers `Specty-Change`, `Specty-Task` y `Specty-Spec`. Ahora `specty why` recorre blame, commit, trailers, cambio, tarea y criterios, y dice de dónde viene una línea o qué cambios tocaron un archivo.

## Fuera de alcance

- El informe de auditoría (`specty audit`) y la exportación: van en otro cambio.
- Seguir una línea a través de renombres de archivo más allá de lo que hace `git blame`.

## Supuestos

- A1: Para una línea manda `git blame`: el último commit que la cambió. Para un archivo sin línea, los cambios de su historia (`git log`), del más reciente al más antiguo, uno por cambio y como mucho 10.
- A2: El cambio se busca abierto en cualquier worktree o archivado aquí y en la carpeta principal; si no aparece, se dice su id con lo que dicen los trailers.
- A3: `why` solo lee: no es una decisión de la persona, así que también lo ejecuta el agente.

## Criterios de aceptación

- AC1: CUANDO se ejecuta `specty why <ruta>:<línea>` sobre una línea que escribió una tarea ENTONCES dice el commit (hash, fecha, autor y asunto), el cambio con su título, la tarea con su título, los criterios que cubre con su texto y la revisión de la spec.
- AC2: CUANDO se ejecuta `specty why <ruta>` ENTONCES lista los cambios que tocaron el archivo, del más reciente al más antiguo, cada uno con su último commit.
- AC3: CUANDO el commit no es de ningún cambio de Specty, o la línea aún no está en ningún commit ENTONCES lo dice.
- AC4: CUANDO la ruta no tiene historia en git o la línea no existe ENTONCES lo rechaza diciendo por qué.
- AC5: CUANDO alguien lee ARCHITECTURE ENTONCES `why` aparece como implementado, con lo que muestra.

## Diseño

- Core, `cards/why.ts`: `WhyView` (el objetivo y sus commits, cada uno con su cambio, tarea y criterios) y `whyCard`, la salida.
- CLI, `commands/why.ts`: lee blame o el log, los trailers de cada commit y la spec de su cambio; `program.ts` registra el comando.

## Archivos

- crear packages/core/src/cards/why.ts — la vista y la tarjeta
- modificar packages/core/src/index.ts — exportarlas
- crear packages/core/test/cards/why.test.ts — la tarjeta
- crear packages/cli/src/commands/why.ts — el comando
- modificar packages/cli/src/program.ts — registrarlo
- crear packages/cli/test/why.test.ts — de punta a punta
- modificar docs/ARCHITECTURE.md — §6 y §13

## Tareas

- [x] T1: La tarjeta de why
  - files: packages/core/src/cards/why.ts, packages/core/src/index.ts, packages/core/test/cards/why.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/why.test.ts
- [ ] T2: El comando why
  - files: packages/cli/src/commands/why.ts, packages/cli/src/program.ts, packages/cli/test/why.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3, AC4, AC5
  - verify: pnpm check
