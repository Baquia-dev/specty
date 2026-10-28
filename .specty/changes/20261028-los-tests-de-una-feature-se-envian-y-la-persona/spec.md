---
kind: standard
follows:
  - 20261028-con-contract-la-spec-aprobada-pasa-a-escribir-lo
---

# Los tests de una feature se envían y la persona los aprueba

## Objetivo

Con `policy.tests: contract`, un cambio con una feature ya entra en `testing` y el agente solo puede escribir sus tests, pero todavía no puede salir de ahí. Este cambio cierra el ciclo:
- el agente envía los tests con `specty propose`, y Specty hace un commit con solo los tests;
- el cambio espera a la persona, que los aprueba con `specty approve` (el gate 2) o la sustituye el agente en modo delegado;
- el cambio pasa a `implementing`, y la auditoría registra quién los aprobó y por dónde.

Comprobar que los tests fallan antes de aceptarlos llega con el corte C2.

## Fuera de alcance

- Exigir el rojo al enviar, y que cada criterio tenga su test como error con `contract`: el corte C2, que sigue a este.
- Aprobar los tests desde la UI y mostrarlos allí (C6).
- Bloquear los tests aprobados (C3).

## Supuestos

- A1: Tras enviar los tests, el agente aún puede corregirlos si la persona se lo pide, y vuelve a enviarlos con `specty propose`, que hace otro commit; la persona aprueba lo último que se envió.
  - impacto: alto
- A2: Se envían los tests que cambiaron desde el último commit y que son tests de los archivos del cambio, como los que deja escribir el guard en `testing`; si cambió otro código gobernado, el envío se rechaza.
- A3: Aprobar los tests hace un commit con el estado y la auditoría, como aprobar la spec, con el tipo `test(spec)`.

## Criterios de aceptación

- AC1: CUANDO el agente ejecuta `specty propose` con el cambio en `testing` y tests nuevos de sus archivos ENTONCES Specty hace un commit solo con esos tests, anota el envío (`testsSubmittedAt` y `tests.proposed`), el cambio sigue en `testing` y la tarjeta pide que la persona los apruebe con `specty approve` (en modo delegado, que los apruebe el agente).
- AC2: CUANDO el agente ejecuta `specty propose` en `testing` sin tests nuevos, o con otro código gobernado cambiado ENTONCES Specty no envía nada y dice qué falta o qué archivos sobran.
- AC3: CUANDO la persona ejecuta `specty approve` con los tests enviados y lo confirma ENTONCES el cambio pasa a `implementing`, `tests.approved` anota quién y por qué canal, y lo siguiente es la primera tarea.
- AC4: CUANDO el agente aprueba los tests en modo delegado ENTONCES pasa lo mismo, con el canal `delegated`; y CUANDO se ejecuta `specty approve` en `testing` sin tests enviados ENTONCES no cambia nada.
- AC5: CUANDO un cambio tiene los tests enviados ENTONCES `specty status` dice que espera a la persona con `specty approve`, y `specty approve` lo encuentra desde cualquier carpeta.
- AC6: CUANDO `specty audit` muestra `tests.proposed` y `tests.approved` ENTONCES los dice con palabras, en español y en inglés.
- AC7: CUANDO se leen docs/formats.md y docs/ARCHITECTURE.md ENTONCES dicen cómo se envían y se aprueban los tests, `testsSubmittedAt` y los dos eventos nuevos.
  - test: manual

## Diseño

- `state.json` gana `testsSubmittedAt`, que se borra al aprobar. La máquina deja `propose` en `testing` (sigue en `testing`) y añade `approveTests`, solo de la persona, que con los tests enviados pasa a `implementing`. Con los tests enviados, `testing` espera a la persona.
- `commands/tests.ts` tiene el envío y la aprobación; `propose.ts` y `approve.ts` le pasan el cambio cuando está en `testing`. El recibo del commit de los tests es de la clase `tests`.
- Los textos van en `cards/testing.ts` y `cards/audit.ts`; `humanAction` de `testing` es `approve`.

## Archivos

- modificar packages/core/src/schema/state.ts — `testsSubmittedAt`
- modificar packages/core/src/flow/machine.ts — `propose` en `testing` y el evento `approveTests`
- modificar packages/core/src/flow/phases.ts — con los tests enviados, `testing` espera a la persona
- modificar packages/core/src/cards/human.ts — la acción de la persona en `testing`
- modificar packages/core/src/cards/audit.ts — los dos eventos nuevos en palabras
- modificar packages/core/src/cards/testing.ts — las tarjetas del envío, de la espera y de la aprobación
- modificar packages/core/src/cards/view.ts — `testsSubmitted` en la vista del cambio
- modificar packages/core/src/cards/index.ts — exporta los textos nuevos
- crear packages/cli/src/commands/tests.ts — enviar y aprobar los tests
- modificar packages/cli/src/commands/propose.ts — en `testing`, envía los tests
- modificar packages/cli/src/commands/approve.ts — en `testing`, aprueba los tests
- modificar packages/cli/src/flow/views.ts — `testsSubmitted` desde el estado
- modificar packages/cli/src/flow/changes.ts — un cambio con los tests enviados espera `approve`
- modificar packages/cli/src/commands/status.ts — a quién espera un cambio con los tests enviados
- modificar packages/cli/src/store/local.ts — la clase de recibo `tests`
- modificar packages/cli/test/testing-phase.test.ts — enviar, aprobar, el modo delegado y el estado
- modificar docs/formats.md — `testsSubmittedAt` y los eventos `tests.proposed` y `tests.approved`
- modificar docs/ARCHITECTURE.md — §4: de `testing` a `implementing`

## Tareas

- [x] T1: El modelo del envío y de la aprobación de los tests
  - files: packages/core/src/schema/state.ts, packages/core/src/flow/machine.ts, packages/core/src/flow/phases.ts, packages/core/src/cards/human.ts, packages/core/src/cards/audit.ts
  - ac: AC5, AC6
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/schema test/flow test/cards
- [x] T2: Las tarjetas de los tests enviados y la vista del cambio
  - files: packages/core/src/cards/testing.ts, packages/core/src/cards/view.ts, packages/core/src/cards/index.ts, packages/cli/src/flow/views.ts, packages/cli/src/commands/status.ts
  - ac: AC1, AC5
  - verify: pnpm typecheck && pnpm --filter @baquia-dev/specty-core exec vitest run test/cards
- [x] T3: Enviar y aprobar los tests desde la CLI
  - files: packages/cli/src/commands/tests.ts, packages/cli/src/commands/propose.ts, packages/cli/src/commands/approve.ts, packages/cli/src/flow/changes.ts, packages/cli/src/store/local.ts, packages/cli/test/testing-phase.test.ts, docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3, AC4, AC5, AC7
  - verify: pnpm typecheck && pnpm --filter @baquia-dev/specty exec vitest run test/testing-phase.test.ts test/flow.test.ts

## Riesgos

- R1: Un envío sin comprobar el rojo deja pasar tests que ya pasan. Mitigación: `contract` es opcional y nadie lo usa todavía; el corte C2, que sigue a este, exige el rojo.
- R2: Un commit de tests a medias si el agente envía antes de terminar. Mitigación: puede volver a enviar (A1), y la persona aprueba lo último.
