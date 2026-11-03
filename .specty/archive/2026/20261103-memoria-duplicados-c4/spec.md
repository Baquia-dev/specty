---
kind: standard
epic: 20261030-memoria-de-specty
slice: C4
---

# Specty frena un cambio nuevo que parece duplicar otro abierto

## Objetivo

El 2026-10-30 dos sesiones empezaron el mismo cambio con minutos de diferencia, y Specty solo lo notó al proponer, como «archivos compartidos». Con este corte, `specty new` no crea un cambio cuyo título o petición se parece al de otro abierto, o que sigue al mismo cambio que otro abierto: dice cuál es, en qué fase está, dónde y quién lo lleva, y pide preguntarle al usuario. Si el usuario confirma que es otro trabajo, `new --distinct-from <id>` lo crea y lo deja anotado. Es el AC8 de la épica.

## Fuera de alcance

- El aviso de `propose` cuando la spec comparte al menos la mitad de sus archivos gobernados con otro cambio abierto (AC9 de la épica): va en el cambio que sigue a este.
- Que un modelo decida si dos trabajos son el mismo: Specty solo compara palabras, y lo dudoso lo decide la persona.
- Comparar con los cambios archivados.

## Supuestos

- A1: Dos textos se parecen si comparten al menos la mitad de las palabras significativas del más corto, y al menos dos, para que un título de una sola palabra no frene cualquier cambio. Las palabras significativas son las de tres letras o más, sin tildes ni mayúsculas, sin las palabras vacías del español y del inglés, comparando sus cinco primeras letras como raíz simple.
  - impacto: alto
- A2: Se compara el título nuevo con el de cada cambio abierto, y la petición nueva con la suya, si los dos la tienen. Seguir al mismo cambio (`follows`) cuenta antes que el parecido, porque es un caso claro (A3 de la épica).
  - impacto: alto
- A3: No cuentan como duplicado la épica del corte que se crea ni los cambios que el nuevo sigue con `--follows`: se parecen a propósito.
- A4: `--distinct-from <id>…` deja crear el cambio aunque se parezca a esos cambios, y `change.created` los anota en `distinctFrom`; el parecido con cualquier otro sigue frenando.
- A5: El freno se comprueba antes de crear nada, después de las demás comprobaciones de `new`.

## Criterios de aceptación

- AC1: CUANDO el agente crea un cambio cuyo título o petición se parece al de un cambio abierto en otra carpeta ENTONCES `new` no lo crea: dice cuál es, en qué fase está, dónde y quién lo lleva, y pide preguntar al usuario.
- AC2: CUANDO el cambio nuevo sigue con `--follows` al mismo cambio que otro abierto ENTONCES `new` tampoco lo crea, y dice a cuál siguen los dos.
- AC3: CUANDO el agente repite `new` con `--distinct-from <id>` ENTONCES lo crea aunque se parezca a ese cambio, y `change.created` lo anota en el audit.
- AC4: CUANDO el título y la petición no se parecen a los de ningún cambio abierto, o el parecido es con el cambio que sigue ENTONCES `new` lo crea como antes.

## Diseño

- Core:
  - `flow/duplicates.ts`, nuevo: `similarTexts(a, b)` (A1) y `duplicateReason(candidate, other)`, que da `follows` (con el cambio que siguen los dos), `title`, `request` o nada.
  - `cards/duplicates.ts`, nuevo: `duplicateCard(found, ctx)`, con cada cambio parecido como lo ve `status` y su motivo.
- CLI:
  - `flow/duplicates.ts`, nuevo: `duplicatesOf(session, options)` lee los cambios abiertos de todas las worktrees (título, petición de `change.created`, `follows` y `epic`), salta los de A3 y los de `--distinct-from`, y une cada uno con su `StatusEntry` de `openChanges`.
  - `new`: la comprobación de `--resolves` y la de duplicados van juntas en una función, antes de crear; `--distinct-from <ids...>` y `distinctFrom` en `change.created`.

## Archivos

- crear packages/core/src/flow/duplicates.ts — cuándo dos textos se parecen y por qué dos cambios lo parecen
- crear packages/core/src/cards/duplicates.ts — la tarjeta de `new` que frena un duplicado
- modificar packages/core/src/index.ts — exporta `similarTexts` y `duplicateReason`
- modificar packages/core/src/cards/index.ts — exporta la tarjeta nueva
- crear packages/cli/src/flow/duplicates.ts — los cambios abiertos que el nuevo parece duplicar
- modificar packages/cli/src/commands/new.ts — el freno antes de crear, y `distinctFrom` en el audit
- modificar packages/cli/src/commands/agent-commands.ts — la opción `--distinct-from`
- crear packages/core/test/flow/duplicates.test.ts — el parecido de dos textos, el motivo y la tarjeta
- crear packages/cli/test/duplicates.test.ts — `new` ante un cambio abierto parecido, con worktrees reales
- modificar docs/ARCHITECTURE.md — el freno de `new` y `--distinct-from`
- modificar docs/formats.md — `distinctFrom` en `change.created`

## Tareas

- [x] T1: Cuándo un cambio nuevo parece duplicar otro, y su tarjeta
  - files: packages/core/src/flow/duplicates.ts, packages/core/src/cards/duplicates.ts, packages/core/src/index.ts, packages/core/src/cards/index.ts, packages/core/test/flow/duplicates.test.ts
  - ac: AC1, AC2, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/flow/duplicates.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint
- [x] T2: `new` frena el duplicado, salvo con `--distinct-from`, y la documentación
  - files: packages/cli/src/flow/duplicates.ts, packages/cli/src/commands/new.ts, packages/cli/src/commands/agent-commands.ts, packages/cli/test/duplicates.test.ts, docs/ARCHITECTURE.md, docs/formats.md
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/duplicates.test.ts test/memory-resolves.test.ts test/request.test.ts test/worktrees.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: Un falso parecido frena un `new` legítimo — cuesta una pregunta al usuario, y `--distinct-from` deja constancia (R4 de la épica).
- R2: Dos títulos del mismo trabajo con palabras distintas no se frenan — el aviso de archivos compartidos de `propose` lo recoge después.
- R3: `new` se vuelve más lento al leer todos los cambios abiertos — solo lee sus specs y el inicio de su audit, como `status`.

## Cierre

### Resumen

`specty new` ya no crea un cambio que parece duplicar otro abierto de cualquier worktree: uno que sigue al mismo cambio, o cuyo título o petición se parecen. Dos textos se parecen si comparten al menos la mitad de las palabras significativas del más corto, y al menos dos, comparando raíces de cinco letras sin tildes ni palabras vacías. La tarjeta dice cada cambio parecido, su fase, su carpeta, quién lo lleva y por qué, y pide preguntar al usuario. Si es otro trabajo, `new --distinct-from <id>…` lo crea y `change.created` lo anota en `distinctFrom`. No cuentan la épica del corte ni los cambios que sigue el nuevo. Es el AC8 de la épica.

### Desviaciones

- La tarea de la documentación se unió a T2: con la política `contract`, una tarea sin tests no se admite.
- `specty check` pidió bajar la complejidad de `newOptions` y de `createChange`; las opciones de origen y los datos de `change.created` pasaron a funciones propias.

### Decisiones

- Seguir al mismo cambio se comprueba antes que el parecido, porque es el caso claro.
- El freno va junto a la comprobación de `--resolves`, antes de crear nada.

### Pendientes

- Aviso de duplicado en `specty propose` (épica «Memoria de Specty», corte C4, AC9): cuando la spec que se propone comparte al menos la mitad de sus archivos gobernados con otro cambio abierto, `propose` avisa de un posible duplicado y, en modo delegado, su SIGUIENTE pide la decisión a la persona en vez de aprobar. Se apoya en `sharedFiles` de `packages/cli/src/flow/shared.ts`, que ya lista los archivos compartidos.
