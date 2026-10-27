---
kind: standard
epic: 20261027-tests-como-contrato-y-vocabulario-del-dominio
slice: C1
---

# Cada criterio se comprueba con un test que lleva su id

## Objetivo

Hoy un criterio de aceptación se enlaza con sus tareas y sus commits, pero no con sus tests: nada dice qué test lo comprueba, ni avisa si no lo comprueba ninguno. Con este corte, el test lleva en su nombre el id del criterio (`AC2: …`).

- `specty check --spec` avisa cuando un criterio de una tarea `feat` o `fix` no tiene un test así.
- La aceptación muestra cada criterio con sus tests y el commit que los añadió.
- Un criterio que ningún test puede comprobar se marca con `test: manual`, y la aceptación pide que lo compruebe la persona.

Es el primer corte de la épica «Tests como contrato y vocabulario del dominio», y trae su ADR.

## Fuera de alcance

- El fallo de `criteria-tested` con `policy.tests: contract`: llega con C2, que introduce ese valor; en este corte la verificación solo avisa.
- La matriz en la UI, que es del corte C6.
- `test: manual` en los exportadores (OpenSpec, Spec Kit y Kiro).
- Exigir tests a los criterios que solo cubren tareas `refactor`, `perf`, `test`, `docs` o `chore`.
- Contar los ids de los tests que el cambio no tocó (A6 de la épica).

## Supuestos

- A1: El id cuenta en cualquier parte de una línea de test (el nombre, la descripción o un comentario), escrito como en la forma canónica de la spec (`AC2`), y `AC2` no cuenta para `AC20`.
- A2: Solo exigen test los criterios de las tareas `feat` y `fix`, las mismas a las que la tarjeta pide el test primero; los de `refactor` y `perf` los comprueban los tests que ya existen.
- A3: El campo se llama `test` en los dos idiomas, porque «test» es la palabra que usan los textos de Specty en español, y su único valor es `manual`.
- A4: La aceptación sabe qué commit añadió cada línea con un id por `git blame`, en los archivos de test que tocaron los commits de las tareas, y solo cuenta las líneas de esos commits.

## Criterios de aceptación

- AC1: CUANDO un criterio lleva debajo el campo `test: manual` ENTONCES `specty propose` lo acepta y la forma canónica lo conserva, también en una spec en inglés.
- AC2: CUANDO el campo `test` de un criterio tiene otro valor ENTONCES `specty propose` falla con `field-invalid` en la línea del campo y da `manual` como valor válido.
- AC3: CUANDO una tarea `feat` o `fix` activa o hecha cubre un criterio sin `test: manual` y ninguna línea que el cambio añade a un archivo de test contiene su id ENTONCES `specty check --spec` da un aviso `criteria-tested` con ese criterio, salvo con `policy.tests: off`.
- AC4: CUANDO el agente recibe la tarjeta de una tarea `feat` o `fix` ENTONCES la regla de tests le pide poner el id del criterio en el nombre del test, y la tarjeta más grande del test de presupuesto sigue por debajo de 1.500 tokens.
- AC5: CUANDO el cambio llega a aceptación ENTONCES su tarjeta muestra cada criterio con los tests que llevan su id, cada uno con su archivo, su línea, su tarea y su commit, y no cuenta una línea que no añadió una tarea del cambio.
- AC6: CUANDO un criterio lleva `test: manual`, o lo cubre una tarea `feat` o `fix` y ningún test lleva su id ENTONCES los avisos de la tarjeta de aceptación y la nota de `specty accept` lo nombran: que la persona lo compruebe a mano, o que le falta su test.
- AC7: CUANDO se leen docs/formats.md, docs/checks.md, docs/checks.en.md y docs/ARCHITECTURE.md ENTONCES describen `test: manual`, `criteria-tested`, la regla del id en el nombre del test y la matriz de aceptación, y el ADR 0014 recoge las decisiones de la épica.

## Diseño

- Modelo: `Criterion.test?: "manual"`. `readCriteria` lee el campo con `readFields`, como `impacto` en los supuestos, y `serialize` lo escribe en el cuerpo y en la unidad del hash, para que el delta lo vea. Una spec sin el campo conserva su hash.
- `criterionMarks(text, ids)` en `checks/markers.ts`: las líneas de un texto con alguno de los ids, como las marcas de tests enfocados.
- `cli/src/flow/criteria-tests.ts` reúne las dos lecturas de la CLI sobre `criterionMarks`:
  - la verificación `criteria-tested`, que registra `check/plan.ts`: busca los criterios de las tareas `feat` y `fix` activas o hechas (con `--staged`, solo la activa, como `fix-tests`) en las líneas añadidas de los archivos de test de la ejecución, y sus hallazgos son avisos;
  - la matriz de aceptación, que pide `flow/views.ts`: los archivos de test de los commits de las tareas (`git show --name-only`), sus líneas con ids y el commit de cada una (`git blame`), que cuenta si es de una tarea del cambio (`taskCommits`).
- `ChangeView.criteriaTests` (`CriterionTestsView`), y `cards/criteria.ts` con la sección «CRITERIOS Y TESTS» y sus avisos, para `acceptanceCard` y para `acceptanceSummary`.
- La regla de la tarjeta de tarea: «Primero el test: escribe el que comprueba cada criterio, con su id en el nombre (`AC1: …`), y míralo fallar; después, el código».
- La pista de los criterios en la plantilla nombra `test: manual`.
- El ADR 0014 «Los tests como contrato» recoge la épica: las decisiones de la persona, la fase de tests, el bloqueo, la ceremonia por tipo de trabajo y el vocabulario.

## Archivos

- modificar packages/core/src/spec/model.ts — `Criterion.test`
- modificar packages/core/src/spec/vocabulary.ts — la clave `test` y el valor `manual`
- modificar packages/core/src/spec/read-items.ts — leer el campo de los criterios
- modificar packages/core/src/spec/serialize.ts — escribirlo en el cuerpo y en el hash
- modificar packages/core/src/templates.ts — la pista de los criterios
- modificar packages/core/src/checks/markers.ts — `criterionMarks`
- modificar packages/core/src/index.ts — exportar `criterionMarks`
- modificar packages/core/src/cards/view.ts — `CriterionTestsView` y `ChangeView.criteriaTests`
- crear packages/core/src/cards/criteria.ts — la sección de criterios y tests, y sus avisos
- modificar packages/core/src/cards/work.ts — la regla del id y la sección en la tarjeta de aceptación
- modificar packages/core/src/cards/accept.ts — los avisos en la nota de la persona
- modificar packages/cli/src/check/plan.ts — registrar `criteria-tested`
- crear packages/cli/src/flow/criteria-tests.ts — la verificación y la matriz
- modificar packages/cli/src/flow/views.ts — la matriz en aceptación
- crear packages/cli/test/criteria-tests.test.ts — la verificación y la matriz de punta a punta
- crear docs/decisions/0014-los-tests-como-contrato.md — el ADR de la épica
- modificar docs/formats.md — §2: el campo `test` de los criterios
- modificar docs/checks.md — `criteria-tested`
- modificar docs/checks.en.md — `criteria-tested`
- modificar docs/ARCHITECTURE.md — §6, §7 y §13

## Tareas

- [x] T1: Un criterio puede llevar test: manual
  - files: packages/core/src/spec/model.ts, packages/core/src/spec/vocabulary.ts, packages/core/src/spec/read-items.ts, packages/core/src/spec/serialize.ts, packages/core/src/templates.ts
  - ac: AC1, AC2, AC7
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/spec test/templates.test.ts
  - notes: documenta el campo en docs/formats.md §2 y escribe el ADR 0014.
- [ ] T2: criteria-tested avisa del criterio que ningún test nombra
  - files: packages/core/src/checks/markers.ts, packages/core/src/index.ts, packages/cli/src/check/plan.ts, packages/cli/src/flow/criteria-tests.ts, packages/cli/test/criteria-tests.test.ts
  - ac: AC3, AC7
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/checks/markers.test.ts && pnpm --filter @baquia-dev/specty exec vitest run test/criteria-tests.test.ts test/check-plan.test.ts test/check-docs.test.ts
  - notes: documenta la verificación en docs/checks.md, docs/checks.en.md y ARCHITECTURE §6.
- [ ] T3: Las tarjetas piden el id en el test y nombran los criterios sin test
  - files: packages/core/src/cards/view.ts, packages/core/src/cards/criteria.ts, packages/core/src/cards/work.ts, packages/core/src/cards/accept.ts
  - ac: AC4, AC6, AC7
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards
  - notes: documenta la regla de la tarjeta en ARCHITECTURE §7. Sus tests van en packages/core/test/cards/, que entran como tests implícitos de esta carpeta; listarlos haría el cambio XL.
- [ ] T4: La aceptación encuentra el test y el commit de cada criterio
  - files: packages/cli/src/flow/views.ts, packages/cli/src/flow/criteria-tests.ts, packages/cli/test/criteria-tests.test.ts
  - ac: AC5, AC6, AC7
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/criteria-tests.test.ts test/flow.test.ts
  - notes: documenta la matriz de aceptación en ARCHITECTURE §13.

## Riesgos

- R1: `git blame` en aceptación tarda con archivos de test grandes. Mitigación: solo los archivos que tocaron las tareas y que tienen algún id, una vez por archivo.
- R2: Un texto que contiene `AC2` sin ser un test de ese criterio, como un fixture o un comentario ajeno, cuenta como test. Mitigación: es un aviso, y la matriz enseña la línea para que el agente y la persona la vean.
- R3: Cambiar la regla de la tarjeta de tarea cambia lo que hace el modelo. Mitigación: la frase solo añade el id, y el test de presupuesto y los de las tarjetas la fijan.
