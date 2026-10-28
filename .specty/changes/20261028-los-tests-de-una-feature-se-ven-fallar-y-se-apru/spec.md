---
kind: standard
epic: 20261027-tests-como-contrato-y-vocabulario-del-dominio
slice: C2
follows:
  - 20261028-los-tests-de-una-feature-se-envian-y-la-persona
---

# Los tests de una feature se ven fallar y se aprueban antes del código

## Objetivo

Con `policy.tests: contract`, los tests de una feature ya se escriben, se envían y los aprueba la persona antes del código, pero el envío no comprueba que los tests fallen ni que cubran los criterios. Este corte cierra C2:
- `specty propose` ejecuta la verificación de las tareas y solo envía los tests si falla y su salida nombra cada test nuevo;
- cada criterio que pide un test tiene uno nuevo con su id;
- con `contract`, `criteria-tested` pasa de aviso a error;
- la tarjeta de la fase ya no pide test para un criterio `test: manual`;
- el test de fricción recorre una feature con `contract` y fija sus cifras.

## Fuera de alcance

- Exigir el rojo test a test leyendo informes JUnit XML (fuera de la épica): basta con que el comando falle y su salida nombre cada test nuevo (A5 de la épica).
- Los ciclos de bugs, refactors y ajustes (C4), y el recorrido de fricción de un bug (C4).
- El bloqueo de los tests aprobados (C3) y la UI (C6).

## Supuestos

- A1: La verificación que tiene que fallar es la de las tareas que piden el test primero (`feat` y `fix`): su `verify`, o `verify.default`, sin `verify.quick`, que comprueba el formato y no los tests. Cada comando distinto se ejecuta una vez.
  - impacto: alto
- A2: La salida nombra un test nuevo si contiene su ruta, su nombre de archivo o ese nombre sin la última extensión (`CartTest` de `CartTest.java`, como lo nombra JUnit); basta con que lo nombre uno de los comandos que fallan.
- A3: Un criterio pide un test si lo cubre una tarea `feat` o `fix` y no lleva `test: manual`, como en `criteria-tested`, y su id cuenta en una línea que añade el cambio.
- A4: El envío anota en `tests.proposed` los comandos rojos con su código de salida, para que la persona vea en la auditoría que los tests fallaban.

## Criterios de aceptación

- AC1: CUANDO el agente envía los tests y la verificación de las tareas pasa ENTONCES Specty no los envía y dice que no están en rojo.
- AC2: CUANDO la verificación falla pero su salida no nombra alguno de los tests nuevos ENTONCES Specty no los envía y dice cuáles.
- AC3: CUANDO un criterio que pide un test no tiene un test nuevo con su id ENTONCES Specty no envía los tests y nombra el criterio.
- AC4: CUANDO la verificación falla nombrando cada test nuevo y cada criterio tiene su test ENTONCES los tests se envían como hasta ahora, y `tests.proposed` guarda cada comando rojo con su código de salida.
- AC5: CUANDO `policy.tests` es `contract` ENTONCES `criteria-tested` es un error en `specty check --spec`; con `recommended` o `required` sigue siendo un aviso.
- AC6: CUANDO la tarjeta de la fase de tests lista los criterios ENTONCES deja fuera los que llevan `test: manual`.
- AC7: CUANDO el test de fricción recorre una feature con `contract` siguiendo cada SIGUIENTE ENTONCES llega al final, cada bloqueo se resuelve por su SIGUIENTE y las cifras de comandos quedan fijadas.
- AC8: CUANDO se leen docs/ARCHITECTURE.md, docs/formats.md, docs/checks.md y docs/checks.en.md ENTONCES dicen cómo se comprueba el rojo y que `criteria-tested` es un error con `contract`.
  - test: manual

## Diseño

- `commands/tests.ts` comprueba antes del commit, por este orden: el código que no es test, que haya tests nuevos, los criterios sin test y el rojo. El rojo se ejecuta con `runLive`, como la verificación de una tarea, para que la UI lo vea en vivo.
- `flow/criteria-tests.ts` gana los criterios que piden test en la fase de tests, con la misma búsqueda de ids que `criteria-tested`, sobre las líneas que añade el cambio (`checkContext` en modo `changed`).
- `TestsRefusal` gana `untested`, `green` y `unnamed`. `CriterionView` gana `manual`.
- En `check/plan.ts`, la gravedad de `criteria-tested` depende de `policy.tests`.

## Archivos

- modificar packages/cli/src/commands/tests.ts — los criterios y el rojo antes de enviar
- modificar packages/cli/src/flow/criteria-tests.ts — los criterios sin test en la fase de tests
- modificar packages/cli/src/check/plan.ts — `criteria-tested` es un error con `contract`
- modificar packages/cli/src/flow/views.ts — `manual` en los criterios de la vista
- modificar packages/core/src/cards/testing.ts — los rechazos nuevos y la lista de criterios sin los manuales
- modificar packages/core/src/cards/view.ts — `CriterionView.manual`
- modificar packages/cli/test/testing-phase.test.ts — el rojo, los criterios y la gravedad de `criteria-tested`
- modificar packages/cli/test/friction.test.ts — el recorrido de una feature con `contract`
- modificar docs/ARCHITECTURE.md — §4: el rojo al enviar los tests
- modificar docs/formats.md — §4 y §6: los comandos rojos de `tests.proposed` y la gravedad de `criteria-tested`
- modificar docs/checks.md — `criteria-tested` con `contract`
- modificar docs/checks.en.md — `criteria-tested` con `contract`

## Tareas

- [x] T1: Las tarjetas de los rechazos y los criterios manuales
  - files: packages/core/src/cards/testing.ts, packages/core/src/cards/view.ts, packages/cli/src/flow/views.ts
  - ac: AC6
  - verify: pnpm typecheck && pnpm --filter @baquia-dev/specty-core exec vitest run test/cards
- [ ] T2: El envío exige los criterios y el rojo
  - files: packages/cli/src/commands/tests.ts, packages/cli/src/flow/criteria-tests.ts, packages/cli/test/testing-phase.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm typecheck && pnpm --filter @baquia-dev/specty exec vitest run test/testing-phase.test.ts test/criteria-tests.test.ts
- [ ] T3: criteria-tested con contract, la fricción y la documentación
  - files: packages/cli/src/check/plan.ts, packages/cli/test/testing-phase.test.ts, packages/cli/test/friction.test.ts, docs/ARCHITECTURE.md, docs/formats.md, docs/checks.md, docs/checks.en.md
  - ac: AC5, AC7, AC8
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/testing-phase.test.ts test/friction.test.ts test/check-docs.test.ts

## Riesgos

- R1: Una salida que nombra un test que pasa, porque el runner lista también los que pasan, deja pasar ese test como rojo. Mitigación: el comando tiene que fallar, la persona ve los tests en el gate 2, y leer el rojo test a test queda como seguimiento.
- R2: La verificación de las tareas puede ser lenta, y el envío la ejecuta entera. Mitigación: cada comando distinto se ejecuta una sola vez, y es la misma verificación que correrá cada tarea.
