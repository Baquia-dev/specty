---
kind: standard
epic: 20261107-flujo-configurable-en-la-ui
slice: C22
---

# Las comprobaciones de task done pasan a ser ajustes

## Objetivo

Hoy `task done` ejecuta `specty check --changed --spec` con una lista fija de lo que deja fuera: `scope` y `max-lines`, que ya comprueba por tarea y, si la tarea tiene verificación, los comandos del proyecto. Con este cambio, la clave opcional `checks.taskDone.skip` de `.specty/config.yaml` nombra además las verificaciones opcionales de `specty check` que `task done` no ejecuta, como `vulnerabilities` o `code-rules`, que siguen corriendo en `specty check`, el pre-commit y la CI. Las del plan aprobado y la de los tests aprobados no se pueden quitar. Sin la clave, todo sigue como hoy. La página «Configuración» muestra el ajuste con la marca «Nuevo». Es el corte C22 de la épica `20261107-flujo-configurable-en-la-ui`: la parte de `task done` de su AC19, y AC25 y AC26 para esta clave.

## Fuera de alcance

- Las otras reglas de AC19 de la épica: cuántas tareas admite un cambio `quick` y cuándo se recomienda la revisión independiente, que van en C21.
- Quitar de `task done` lo que es garantía de Specty (A2 de la épica): las solicitudes de alcance pendientes, el alcance de la tarea, el parche de los tests desbloqueados, las aserciones que conserva un `refactor` o un `perf` con `contract`, la verificación de la tarea (`verify.quick` y su `verify`) y el guard.
- Cambiar lo que ejecutan `specty check`, el pre-commit, la CI y el hook de fin de turno, y `checks.levels`, que sigue rigiendo en todas las ejecuciones.
- La regla que deja fuera `format`, `lint`, `typecheck` y `tests` en una tarea con verificación, que sigue fija, y el límite de líneas de cada archivo, que tiene sus claves en `lines`.
- Comprobar que cada id de la lista es el de una verificación que existe.
- Los perfiles (C4) y cualquier cambio en el código de la UI: la página muestra el ajuste desde el catálogo.

## Supuestos

- A1: La clave es `checks.taskDone.skip`, una lista de ids de verificaciones de `specty check`, vacía por defecto. Va en el bloque `checks` porque usa los mismos ids que `checks.levels`. Su forma, su valor por defecto y su `resolve` van en un módulo propio, `schema/task-done.ts`, que `checks.ts` reúne en su schema. Así ni `schema/config.ts` ni `schema/flow.ts`, que C21 toca en paralelo, crecen. Una clave que no existe dentro de `checks.taskDone` es un error.
  - impacto: medio
- A2: `task done` ejecuta siempre las verificaciones del plan aprobado, las que añade `--spec` (`spec-approved`, `scope`, `dependencies`, `fix-tests`, `criteria-tested` y `tests-removed`), y `tests-locked`, la de los tests aprobados. Son garantías de Specty: el validador del core da un error si `checks.taskDone.skip` nombra alguna. La clave solo elige entre las demás, las de calidad del código: las de cada stack, los comandos del proyecto y las comunes, como `todo`, `secrets`, `code-rules`, `vulnerabilities`, `diff-coverage` o `test-time`.
  - impacto: alto
- A3: Un id que no es el de ninguna verificación se acepta y no hace nada, como en `checks.levels`. Los ids de las verificaciones viven en la CLI, y las de cada stack dependen del repositorio.
  - impacto: bajo
- A4: `checks.taskDone.skip` se suma a lo que `task done` ya deja fuera, y solo afecta a `task done`. `specty check`, el pre-commit, la CI y el hook de fin de turno siguen ejecutando esas verificaciones, y `checks.levels` sigue rigiendo en todas.
  - impacto: medio
- A5: En el catálogo, el ajuste va en «Verificaciones de calidad», justo después de `checks.levels`, como lista, con las marcas «Nuevo» y «Afecta permisos», como `checks.levels`: deja al agente completar una tarea que una verificación pararía. No es uno de los ajustes básicos. En la vista Flujo, forma parte de la pieza «specty check de lo cambiado», tras `checks.levels`.
  - impacto: medio
- A6: Los textos nuevos van en `cards/settings.ts`, que ronda las 300 líneas de código y crece solo en la entrada de este ajuste.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO `.specty/config.yaml` no tiene `checks.taskDone` ENTONCES el valor efectivo de `checks.taskDone.skip` es una lista vacía, y `task done` no completa una tarea que deja fallando una verificación de `specty check`, como hoy.
- AC2: CUANDO `checks.taskDone.skip` nombra una verificación de calidad del código, como `focused-tests` ENTONCES `task done` no la ejecuta y completa la tarea aunque esa verificación fallaría, y `specty check --changed --spec` la sigue ejecutando y falla.
- AC3: CUANDO `checks.taskDone.skip` nombra `spec-approved`, `scope`, `dependencies`, `fix-tests`, `criteria-tested`, `tests-removed` o `tests-locked`, tiene un texto vacío o no es una lista, o `checks.taskDone` tiene otra clave ENTONCES el validador del core da un error con su clave, y con una verificación garantizada el mensaje dice que `task done` la ejecuta siempre.
- AC4: CUANDO la persona abre «Configuración» ENTONCES ve en «Verificaciones de calidad», tras «Nivel de cada verificación», el ajuste `checks.taskDone.skip` como lista, con las marcas «Nuevo» y «Afecta permisos» y su nombre y su descripción en español y en inglés. En la vista Flujo, forma parte de la pieza «specty check de lo cambiado».
- AC5: CUANDO se lee la documentación ENTONCES `docs/formats.md` §6 documenta `checks.taskDone.skip`, con su valor por defecto, las verificaciones que `task done` ejecuta siempre y que `specty check` sigue ejecutando las que deja fuera, y `docs/checks.md` lo nombra donde cuenta qué deja fuera `task done`.
  - test: manual

## Diseño

- Core, `schema/task-done.ts` (nuevo): `TaskDoneChecks` (`skip: readonly string[]`), `DEFAULT_TASK_DONE` (`{ skip: [] }`), `TaskDoneSchema` (un `strictObject` con `skip: z.array(z.string().min(1)).optional()` y un `superRefine` que da un error por cada id garantizado, en su posición de la lista) y `resolveTaskDone(input)`. La lista de las garantizadas es una constante del módulo, sin exportar.
- Core, `schema/checks.ts`: `ChecksConfig.taskDone`, `DEFAULT_CHECKS.taskDone`, `taskDone: TaskDoneSchema.optional()` en `ChecksSchema` y `taskDone: resolveTaskDone(input?.taskDone)` en `resolveChecks`.
- Core, `settings/catalog.ts`: `{ key: "checks.taskDone.skip", section: "checks", kind: "list", permissions: true, new: true }` tras `checks.levels`. `settings/pieces.ts`: la clave en la pieza `checks`, tras `checks.levels`. `cards/settings.ts`: su nombre y su descripción en los dos idiomas.
- CLI, `commands/check.ts`: `taskChecks` suma `session.config.checks.taskDone.skip` a lo que deja fuera, con `TASK_DONE_CHECKS` y, con verificación, `COMMAND_CHECKS`.
- Tests: `core/test/schema/task-done.test.ts` (nuevo: AC1 y AC3), `core/test/settings/task-done.test.ts` (nuevo: AC4), `core/test/settings/catalog.test.ts` (las listas exactas de las marcas «Afecta permisos» y «Nuevo») y `cli/test/task-check.test.ts` (AC1 y AC2 de punta a punta, con `focused-tests` en la lista).

## Archivos

- crear packages/core/src/schema/task-done.ts — la clave `checks.taskDone.skip`, su valor por defecto y las verificaciones garantizadas
- modificar packages/core/src/schema/checks.ts — reúne `taskDone` en el schema, en `ChecksConfig` y en `DEFAULT_CHECKS`
- modificar packages/core/src/settings/catalog.ts — el ajuste `checks.taskDone.skip` en «Verificaciones de calidad», con las marcas `permissions` y `new`
- modificar packages/core/src/settings/pieces.ts — la clave en la pieza «specty check de lo cambiado»
- modificar packages/core/src/cards/settings.ts — el nombre y la descripción del ajuste en español y en inglés
- modificar packages/cli/src/commands/check.ts — `taskChecks` deja fuera lo que nombra la clave
- crear packages/core/test/schema/task-done.test.ts — el schema de la clave, su valor por defecto y las verificaciones garantizadas
- crear packages/core/test/settings/task-done.test.ts — el ajuste, sus marcas, su pieza y sus textos
- modificar packages/core/test/settings/catalog.test.ts — las listas exactas de las marcas con el ajuste nuevo
- modificar packages/cli/test/task-check.test.ts — `task done` con y sin la clave, y `specty check` que la sigue ejecutando
- modificar docs/formats.md — §6: `checks.taskDone.skip`
- modificar docs/checks.md — lo que deja fuera `task done`, con la clave

## Tareas

- [x] T1: La clave `checks.taskDone.skip` en el schema, con las verificaciones garantizadas
  - files: packages/core/src/schema/task-done.ts, packages/core/src/schema/checks.ts, packages/core/test/schema/task-done.test.ts
  - ac: AC1, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/schema/task-done.test.ts
- [x] T2: El ajuste en el catálogo y en la pieza, con sus textos
  - files: packages/core/src/settings/catalog.ts, packages/core/src/settings/pieces.ts, packages/core/src/cards/settings.ts, packages/core/test/settings/task-done.test.ts, packages/core/test/settings/catalog.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/settings/task-done.test.ts test/settings/catalog.test.ts
- [ ] T3: `task done` deja fuera lo que nombra la clave, y la documentación la explica
  - files: packages/cli/src/commands/check.ts, packages/cli/test/task-check.test.ts, docs/formats.md, docs/checks.md
  - ac: AC1, AC2, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/task-check.test.ts && pnpm typecheck

## Riesgos

- R1: Dejar fuera una verificación permite completar una tarea con un problema que esa verificación pararía, como un secreto o una vulnerabilidad. Mitigación: lo decide la persona en su `config.yaml`, con su commit, y el ajuste lleva «Afecta permisos», que pide una confirmación aparte al guardar desde la UI. `specty check`, el pre-commit y la CI la siguen ejecutando, y las verificaciones del plan aprobado y la de los tests aprobados no se pueden quitar.
- R2: C20 y C21 tocan en paralelo el catálogo, sus textos, sus tests, `settings/pieces.ts` y `docs/formats.md` §6. Mitigación: la clave va en su módulo y en sus líneas, y al incorporar main `specty integrate` conserva lo de los dos.
