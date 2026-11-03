---
kind: standard
follows:
  - 20261103-memoria-duplicados-c4
---

# propose avisa de un posible duplicado por los archivos que comparte

## Objetivo

`specty new` ya frena un cambio cuyo título o petición se parece al de otro abierto, pero dos trabajos iguales pueden llamarse distinto. Hoy `propose` lista los archivos que la spec comparte con otros cambios abiertos, sin más. Con este cambio, si comparte al menos la mitad de sus archivos gobernados con otro cambio abierto, `propose` avisa de un posible duplicado, con cuál y cuántos archivos. En modo delegado, su SIGUIENTE le pide al agente preguntarle al usuario antes de aprobar. Es el AC9 de la épica y resuelve la entrada P13 de la memoria.

## Fuera de alcance

- Bloquear la aprobación: el aviso informa, y la persona decide.
- El aviso al aprobar desde la terminal de la persona o desde `specty ui`: ya ven los archivos compartidos.
- Comparar con cambios archivados.

## Supuestos

- A1: Un cambio abierto es un posible duplicado si la spec propuesta comparte con él al menos la mitad de sus archivos gobernados, contados como hoy los cuenta «archivos compartidos» (sin documentación ni rutas no gobernadas, con globs en los dos sentidos).
  - impacto: alto
- A2: Solo al proponer la spec, no el cierre. Un cambio que `change.created` anotó en `distinctFrom` no cuenta: el usuario ya dijo que es otro trabajo.
- A3: Sin modo delegado, el SIGUIENTE no cambia: aprueba la persona, que ve el aviso. En modo delegado, el SIGUIENTE pide preguntar al usuario si el cambio duplica esos cambios: si es otro trabajo, aprobar; si no, cancelarlo.

## Criterios de aceptación

- AC1: CUANDO la spec que se propone comparte al menos la mitad de sus archivos gobernados con otro cambio abierto ENTONCES `propose` avisa de un posible duplicado: cuántos archivos comparte de cuántos, con qué cambio, su fase, su carpeta y quién lo lleva.
- AC2: CUANDO además está activo el modo delegado ENTONCES el SIGUIENTE de `propose` pide preguntar al usuario antes de aprobar, en lugar de aprobar.
- AC3: CUANDO comparte menos de la mitad de sus archivos gobernados, o el otro cambio está en `distinctFrom` ENTONCES `propose` no avisa de un duplicado, y su SIGUIENTE es el de siempre.

## Diseño

- Core, `cards/duplicates.ts`: `duplicateFilesBlock(found, ctx)`, la sección «POSIBLE DUPLICADO» con cada cambio, y `duplicateApproveNext(ids, ctx)`, el SIGUIENTE en modo delegado.
- CLI:
  - `flow/shared.ts`: `duplicatedBy(session, paths, shared, skipped)` cuenta los archivos gobernados de la spec que comparte cada cambio, se queda con los que llegan a la mitad y los une con su `StatusEntry` de `openChanges`.
  - `propose`: al proponer la spec, añade la sección y, en modo delegado, cambia el SIGUIENTE; lee `distinctFrom` del audit del cambio.

## Archivos

- modificar packages/core/src/cards/duplicates.ts — la sección del posible duplicado y el SIGUIENTE en modo delegado
- modificar packages/core/src/cards/index.ts — exporta lo nuevo
- modificar packages/cli/src/flow/shared.ts — los cambios con los que comparte al menos la mitad de sus archivos
- modificar packages/cli/src/commands/propose.ts — el aviso y el SIGUIENTE al proponer la spec
- crear packages/core/test/cards/duplicate-files.test.ts — la sección y el SIGUIENTE, en español y en inglés
- crear packages/cli/test/duplicate-files.test.ts — `propose` con dos cambios que comparten archivos, con y sin modo delegado
- modificar docs/ARCHITECTURE.md — el aviso de posible duplicado de `propose`

## Tareas

- [x] T1: La sección del posible duplicado y el SIGUIENTE en modo delegado
  - files: packages/core/src/cards/duplicates.ts, packages/core/src/cards/index.ts, packages/core/test/cards/duplicate-files.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/duplicate-files.test.ts test/flow/duplicates.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint
- [x] T2: `propose` avisa del posible duplicado, y la documentación
  - files: packages/cli/src/flow/shared.ts, packages/cli/src/commands/propose.ts, packages/cli/test/duplicate-files.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/duplicate-files.test.ts test/shared.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: Un cambio pequeño que toca un archivo muy compartido salta como duplicado — solo avisa; en modo delegado cuesta una pregunta al usuario.
- R2: `propose` tarda más — solo lee los cambios abiertos (`openChanges`) cuando hay un posible duplicado.

## Cierre

### Resumen

Si la spec que se propone comparte al menos la mitad de sus archivos gobernados con otro cambio abierto, `propose` añade la sección «POSIBLE DUPLICADO»: cuántos archivos comparte de cuántos, con qué cambio, su fase, su carpeta (relativa a donde se ejecuta, como en `status`) y quién lo lleva. Los cambios que `new --distinct-from` dejó anotados en `change.created` no cuentan. En modo delegado, su SIGUIENTE pide preguntar al usuario antes de aprobar: si es otro trabajo, aprobar; si no, cancelar. Con esto se completa el AC9 y el corte C4 de la épica.

### Desviaciones

- El primer intento, `20261103-memoria-duplicado-propose`, se canceló con los tests ya aprobados: un test esperaba la carpeta del otro cambio relativa a la carpeta principal, y otro creaba en el mismo repositorio un cambio abierto que chocaba con la comprobación de `distinctFrom`. Desbloquear tests es solo de la persona, así que este cambio lo rehízo con los tests corregidos y la misma implementación.

### Decisiones

- El aviso no bloquea: sin modo delegado aprueba la persona, que lo ve.
- Los cambios abiertos se leen (`openChanges`) solo cuando hay un posible duplicado.

### Pendientes

- Ninguno.
