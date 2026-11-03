---
kind: standard
---

# Frentes en la memoria

## Objetivo

Primer cambio de P33 (repartir el trabajo entre sesiones): la memoria de Specty guarda frentes de trabajo, cada uno con un nombre, lo que abarca, las rutas del código que le tocan y una lista ordenada de pendientes y mejoras. Cuando se le pide repartir el trabajo, el agente crea los frentes (`specty front add`) y reparte en ellos las entradas (`specty front assign`); la persona los ajusta con los mismos comandos. Hoy ese reparto solo existe en la conversación con cada sesión y se pierde tras un `/clear`. Se llaman «frentes» porque «carril» ya es el tipo de cambio.

## Fuera de alcance

- El dueño de un frente (`specty front take` y `specty front free`) y mostrarlo en `specty status`: es el cambio siguiente.
- Que la tarjeta de inicio muestre solo lo del frente de la sesión, y los frenos de `new --resolves` y `propose`: es el último cambio, que resuelve P33.
- Borrar o renombrar un frente, y sacar una entrada de un frente sin meterla en otro.
- Mostrar el frente de cada entrada en `specty memory` y en la UI.
- Repartir las entradas solas por sus rutas.

## Supuestos

- A1: Cada frente es un archivo `fronts/<nombre>.md` de la rama de la memoria, junto a `entries/`, con su nombre, cuándo y quién lo creó, sus rutas (globs, opcionales) y sus entradas en orden en el frontmatter, y lo que abarca en el cuerpo. Specty lo escribe con la misma fontanería de git que las entradas, en un commit propio con el trailer `Specty-Front: <nombre>`.
  - impacto: alto
- A2: El nombre de un frente son letras sin tilde, números, `-` o `_`, empezando por letra o número, hasta 40 caracteres. Dos frentes no pueden llamarse igual sin distinguir mayúsculas, y los comandos encuentran un frente sin distinguirlas.
- A3: Un frente solo lleva pendientes y mejoras que no están hechas ni descartadas, como las que toma `new --resolves`; una entrada está como mucho en un frente. `front assign <frente> <id>…` pone esas entradas al final del frente, en el orden dado, y las saca del frente en que estuvieran, también del mismo, así que reordenar es volver a asignarlas.
  - impacto: alto
- A4: `specty front` lista cada frente con lo que abarca, sus rutas y sus entradas abiertas en orden, con su tipo y el cambio que las tomó; las hechas o descartadas no salen.
- A5: Crear frentes y asignar entradas lo hacen el agente y la persona, desde cualquier carpeta del clon, como `memory add`.

## Criterios de aceptación

- AC1: CUANDO se ejecuta `specty front add <nombre> "<texto>"`, con o sin `--path` ENTONCES el frente queda en la rama de la memoria con su texto, sus rutas y quién lo creó, y `specty front` lo lista.
- AC2: CUANDO se ejecuta `specty front assign <frente> <id>…` ENTONCES esas entradas quedan al final del frente en el orden dado, salen del frente en que estuvieran, y `specty front` muestra cada frente con sus entradas abiertas en ese orden.
- AC3: CUANDO el nombre no vale o ya existe, el texto está vacío, el frente no existe, o una entrada no existe, no es un pendiente ni una mejora, o está hecha o descartada ENTONCES el comando no escribe nada y explica por qué.

## Diseño

- Core, `memory/fronts.ts` (nuevo): `Front` (`name`, `created`, `origin`, `paths?`, `items`, `text`); `parseFront` y `serializeFront`; `isFrontName`; `findFront(fronts, name)`, sin distinguir mayúsculas; `assignable(ids, entries)`, las entradas o el primer problema (`unknown`, `not-work`, `closed`); `assignToFront(fronts, name, ids)`, los frentes que cambian y qué entradas salen de cuál.
- Core, `cards/fronts.ts` (nuevo): `frontListCard`, `frontAddedCard`, `frontAssignedCard`, `frontRefusalCard` y `frontCommitSubject`, en español y en inglés.
- CLI, `store/memory.ts`: `Memory.fronts`; `MemoryWrite` es una entrada con su operación o unos frentes con el asunto de su commit; el commit conserva `entries/` y `fronts/`.
- CLI, `commands/front.ts` (nuevo): `specty front`, `front add <nombre> <texto> [--path <ruta>…]` y `front assign <frente> <id>…`, registrados en `program.ts`.

## Archivos

- crear packages/core/src/memory/fronts.ts — el modelo de un frente, su archivo y el reparto de entradas
- modificar packages/core/src/index.ts — exporta el modelo de los frentes
- crear packages/core/test/memory/fronts.test.ts — el archivo de un frente, sus nombres y el reparto
- crear packages/core/src/cards/fronts.ts — lo que dicen `front`, `front add` y `front assign`, sus rechazos y el asunto de sus commits
- modificar packages/core/src/cards/index.ts — exporta las tarjetas de los frentes
- crear packages/core/test/cards/fronts.test.ts — las tarjetas y los rechazos, en español y en inglés
- modificar packages/cli/src/store/memory.ts — lee y escribe los frentes en la rama de la memoria
- crear packages/cli/src/commands/front.ts — los comandos `front`, `front add` y `front assign`
- modificar packages/cli/src/program.ts — registra `specty front`
- crear packages/cli/test/fronts.test.ts — crear frentes y repartir entradas, de punta a punta
- modificar docs/formats.md — el archivo de un frente, los comandos y el trailer `Specty-Front`
- modificar docs/ARCHITECTURE.md — los comandos `front`
- modificar docs/dominio.md — el término «Frente»

## Tareas

- [x] T1: El modelo de un frente y el reparto de entradas
  - files: packages/core/src/memory/fronts.ts, packages/core/src/index.ts, packages/core/test/memory/fronts.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/memory/fronts.test.ts && pnpm lint
- [ ] T2: Las tarjetas de los frentes
  - files: packages/core/src/cards/fronts.ts, packages/core/src/cards/index.ts, packages/core/test/cards/fronts.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/fronts.test.ts && pnpm typecheck && pnpm lint
- [ ] T3: Los comandos `front`, `front add` y `front assign` sobre la rama de la memoria
  - files: packages/cli/src/store/memory.ts, packages/cli/src/commands/front.ts, packages/cli/src/program.ts, packages/cli/test/fronts.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/fronts.test.ts test/memory.test.ts test/memory-settle.test.ts test/memory-on-close.test.ts && pnpm typecheck && pnpm lint && pnpm exec knip
- [ ] T4: La documentación de los frentes
  - files: docs/formats.md, docs/ARCHITECTURE.md, docs/dominio.md
  - ac: AC1, AC2
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: Una entrada asignada a un frente que luego se hace o se descarta sigue en su lista — `specty front` solo muestra las abiertas, y el siguiente cambio de P33 tampoco las ofrecerá.
