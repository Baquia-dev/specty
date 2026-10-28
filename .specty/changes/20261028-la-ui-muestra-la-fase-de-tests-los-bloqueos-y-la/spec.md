---
kind: standard
epic: 20261027-tests-como-contrato-y-vocabulario-del-dominio
slice: C6
follows:
  - 20261028-los-tests-bloqueados-y-sus-desbloqueos-se-ven-en
---

# La UI muestra la fase de tests, los bloqueos y la matriz de criterios

## Objetivo

El corte C6 de la épica «Tests como contrato» lleva a la UI lo que la terminal ya muestra. Los dos cambios anteriores trajeron la fase de tests (los tests enviados con su rojo y su aprobación) y los bloqueos (los tests bloqueados y las solicitudes de desbloqueo). Este cambio cierra el corte con la matriz criterio → tests de la aceptación: cada criterio muestra los tests que llevan su id, los criterios manuales se distinguen y los que debían un test sin tenerlo se avisan. Además, el prototipo gana un cambio en `testing` para verlo todo sin el servidor.

## Fuera de alcance

- Cambiar cómo la CLI encuentra los tests de cada criterio (`flow/criteria-tests.ts`): el servidor usa la misma función.
- La matriz de tareas (vista «Matriz»): los tests van en la vista de criterios, la que se abre por defecto.
- La pestaña Historial de la página del cambio.

## Supuestos

- A1: El servidor calcula los tests de cada criterio solo para los cambios abiertos en aceptación que no son épicas. Usa la función de la tarjeta de aceptación (`criteriaTests`) en la carpeta del cambio, con los commits de sus tareas, así que lee con `git show` y `git blame` solo los archivos de test que tocaron sus tareas.
  - impacto: alto
- A2: «A comprobar a mano» sale de la spec (`test: manual`), así que se ve también sin el servidor. «Sin test con su id» sale del `owed` del servidor, así que solo se avisa cuando el servidor lo sabe.
- A3: Como en la tarjeta, cada criterio muestra como mucho 3 tests, por archivo y línea, con su tarea y su commit, y dice cuántos más hay.
- A4: El cambio de ejemplo en `testing` es «Justificantes de faltas», del proyecto «Mi colegio», con dos tests enviados en rojo. La Bandeja y el catálogo cuentan un cambio más, y los tests que los cuentan pasan a la cifra nueva sin quitar aserciones.

## Criterios de aceptación

- AC1: CUANDO la persona abre en Aceptación un cambio con los tests de sus criterios ENTONCES cada criterio muestra, bajo sus tareas, sus tests por archivo y línea, con su tarea y su commit. Un criterio que debía un test y no lo tiene dice «Sin test con su id» en el tono de atención, y uno con `test: manual` dice «A comprobar a mano».
- AC2: CUANDO el servidor local sirve un cambio en aceptación ENTONCES su registro lleva los tests de cada criterio (`criteriaTests`), los mismos que ve la tarjeta de aceptación de la CLI.
- AC3: CUANDO se abre el prototipo ENTONCES el proyecto de ejemplo trae un cambio en `testing` con sus tests enviados en rojo. Aprobarlos lo pasa a `implementing` con esos tests bloqueados y `tests.approved` en su auditoría, y el cambio en aceptación muestra los tests de sus criterios.
- AC4: CUANDO se leen docs/ui.md y docs/ARCHITECTURE.md ENTONCES describen los tests de cada criterio en Aceptación y lo que sirve el servidor: `criteriaTests` y desde cuándo un cambio está en `implementing` con contract.
  - test: manual

## Diseño

- Servidor: `changeRecords` guarda la sesión de cada cambio abierto. Una vez que tiene los commits de las tareas, añade `criteriaTests` a los que están en aceptación y no son épicas (A1).
- UI, datos: `ChangeRecord` y `ChangeView` ganan `criteriaTests?`, que la vista pasa tal cual. `CriterionView` gana `manual?`, que sale de la spec en `review.ts`. `evidenceOf(criteria, tasks, criteriaTests?)` da a cada criterio `tests`, `more`, `manual?` y `untested?`. `untested` es el `owed` del servidor cuando el criterio no tiene ningún test y no es manual.
- `acceptance/criterion-row.ts`: bajo la evidencia de las tareas, una lista «Tests» con cada uno en monoespaciada (`ruta:línea · T1 · commit`) y «y N más». O, en su lugar, la línea «A comprobar a mano» o el aviso «Sin test con su id». `acceptance-tab.ts` le pasa `criteriaTests` a `evidenceOf`.
- Prototipo: `data/sample-tests.ts` (nuevo) trae el cambio de ejemplo y `approveTestsIn(record, now)`, que hace lo que el servidor (A4). `fixtures.ts` lo usa en `approve` con el cambio en `testing`. `sample-acceptance.ts` da `criteriaTests` al cambio en aceptación.

## Archivos

- modificar packages/cli/src/server/records.ts — los tests de cada criterio de un cambio en aceptación
- modificar packages/cli/test/server/records.test.ts — el registro de un cambio en aceptación con su test
- modificar packages/ui/src/data/records.ts — `criteriaTests` en el registro y en la vista, `manual` en el criterio
- modificar packages/ui/src/data/review.ts — los criterios manuales
- modificar packages/ui/src/data/views.ts — `criteriaTests` en la vista
- modificar packages/ui/src/data/acceptance.ts — los tests de cada criterio en su evidencia
- modificar packages/ui/src/acceptance/criterion-row.ts — los tests de cada criterio, manual o sin test
- crear packages/ui/src/acceptance/criterion-row.test.ts — un criterio con tests, uno manual y uno sin test
- modificar packages/ui/src/acceptance/acceptance-tab.ts — los tests de cada criterio en la evidencia
- crear packages/ui/src/data/sample-tests.ts — el cambio de ejemplo en `testing` y aprobar sus tests
- modificar packages/ui/src/data/sample-records.ts — el cambio de ejemplo en el proyecto
- modificar packages/ui/src/data/fixtures.ts — aprobar los tests en el prototipo
- modificar packages/ui/src/data/sample-acceptance.ts — los tests de los criterios del cambio en aceptación
- modificar docs/ui.md — los tests de cada criterio y el cambio de ejemplo en `testing`
- modificar docs/ARCHITECTURE.md — §15: `criteriaTests` y `phaseSince` con contract

## Tareas

- [x] T1: El servidor da los tests de cada criterio en aceptación
  - files: packages/cli/src/server/records.ts, packages/cli/test/server/records.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server
- [x] T2: Los tests de cada criterio en los datos de la UI
  - files: packages/ui/src/data/records.ts, packages/ui/src/data/review.ts, packages/ui/src/data/views.ts, packages/ui/src/data/acceptance.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data
- [x] T3: Cada criterio muestra sus tests en Aceptación
  - files: packages/ui/src/acceptance/criterion-row.ts, packages/ui/src/acceptance/criterion-row.test.ts, packages/ui/src/acceptance/acceptance-tab.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/acceptance
- [x] T4: El prototipo trae un cambio en testing y los tests de los criterios
  - files: packages/ui/src/data/sample-tests.ts, packages/ui/src/data/sample-records.ts, packages/ui/src/data/fixtures.ts, packages/ui/src/data/sample-acceptance.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch
- [x] T5: Los tests de cada criterio en docs/ui.md y docs/ARCHITECTURE.md
  - files: docs/ui.md, docs/ARCHITECTURE.md
  - ac: AC4
  - type: docs
