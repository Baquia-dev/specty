---
kind: standard
follows:
  - 20261028-los-bugs-los-refactors-y-los-ajustes-siguen-su-p
---

# Los tests enviados se ven y se aprueban desde la UI

## Objetivo

Con `policy.tests: contract`, el agente envía los tests de una feature antes del código y la persona los aprueba (gate 2), pero hoy solo puede hacerlo en la terminal: la UI no dice que el cambio la espera ni qué tests llegaron. Este cambio es la primera parte del corte C6 de la épica «Tests como contrato»: la Bandeja y la cabecera dicen que hay tests por aprobar, Progreso muestra cada test nuevo con su rojo y la persona los aprueba desde la cabecera o la barra compacta.

## Fuera de alcance

- Los tests bloqueados, las solicitudes de desbloqueo y la matriz criterio → tests con los criterios manuales: el corte C6, el cambio siguiente.
- Los textos del historial para los eventos de tests (`tests.proposed`, `tests.approved`, `tests.locked`) y para el desbloqueo: el corte C6, con los bloqueos.
- Rechazar los tests o pedir cambios sobre ellos desde la UI.
- La salida completa del rojo: la auditoría solo guarda el comando y su código de salida.
- Un cambio en `testing` en el proyecto de ejemplo del prototipo: el corte C6, que trae también ejemplos de tests bloqueados y de desbloqueos.

## Supuestos

- A1: Aprobar los tests desde la UI usa la acción que ya existe, `approve(change, revision)` con la revisión vigente, porque el servidor ya la lleva a la aprobación de los tests cuando el cambio está en `testing`. No hay «Pedir cambios» de los tests: si no son lo que la persona espera, se lo dice al agente, que puede enviarlos de nuevo con `specty propose`.
  - impacto: alto
- A2: Los tests enviados y su rojo salen del último `tests.proposed` de la auditoría: `files` con las rutas, y `red` con cada comando que falló y su código de salida. Solo cuentan mientras `testsSubmittedAt` está puesto, así que un envío de un ciclo anterior no aparece.
- A3: La sección de los tests va en Progreso, la pestaña con la que se abre un cambio en `testing`, encima de las tareas. La acción va en la cabecera amplia y en la barra compacta, como «Confirmar y archivar», y confirma en un diálogo, porque los tests aprobados quedan bloqueados.

## Criterios de aceptación

- AC1: CUANDO el agente envió los tests de un cambio en `testing` ENTONCES la Bandeja lo pone entre lo que espera a la persona como «Tests por aprobar» y la cabecera del cambio dice «Espera que apruebes los tests»; mientras el agente aún los escribe, el cambio no espera a la persona.
- AC2: CUANDO la persona abre en Progreso un cambio en `testing` con los tests enviados ENTONCES ve una sección «Tests por aprobar» con cada test nuevo por su ruta, cada comando de verificación que falla con su código de salida y qué implica aprobarlos; mientras el agente aún los escribe, la sección dice que los está escribiendo.
- AC3: CUANDO la persona pulsa «Aprobar los tests» en la cabecera o en la barra compacta y lo confirma en el diálogo ENTONCES la fuente aprueba la revisión vigente y un aviso lo dice; si la fuente no puede, un aviso explica por qué y el diálogo sigue abierto, y si no deja decidir, el botón aparece desactivado con el motivo.
- AC4: CUANDO el servidor local recibe la aprobación de un cambio en `testing` con los tests enviados ENTONCES los aprueba como `specty approve` desde la UI (`tests.approved` con el canal `ui`) y el cambio pasa a `implementing`.
- AC5: CUANDO un cambio entra en `implementing` al aprobar sus tests o al bloquearse el rojo de un bug ENTONCES el servidor lo fecha por ese evento (`tests.approved` o `tests.locked`).
- AC6: CUANDO se lee docs/ui.md ENTONCES describe la decisión de los tests en la Bandeja y en la cabecera, la sección de Progreso y la acción con su diálogo.
  - test: manual

## Diseño

- `data/tests.ts` (nuevo): `TestsView` (`submittedAt?`, `files`, `red` con `cmd` y `exit`) y `testsOf(state, audit)`, solo en `testing`. Lee el último `tests.proposed` con cuidado, como el historial, porque la auditoría viene del disco (A2).
- `ChangeView` gana `tests?`, y `DecisionKind` gana `tests`. `decisionOf` da `tests` en `testing` con `testsSubmittedAt`. La Bandeja (`DECISIONS`) y la cabecera (`WAITING`) ganan su texto.
- `progress/tests-sent.ts` (nuevo, `sp-tests-sent`): el divisor «Tests por aprobar» con el número, o «Tests» mientras el agente los escribe; una fila de documento por ruta, en monoespaciada; una línea por comando en rojo, «`pnpm test` falla · salida 1»; y una nota con lo que implica aprobarlos. `progress-tab.ts` lo pone arriba, tras el resumen.
- `progress/tests-actions.ts` (nuevo, `sp-tests-actions`): «Aprobar los tests», desactivado con `decisions.blocked()`, abre un diálogo («Aprobar los tests de «…»», con «Cancelar» y «Aprobar los tests») que llama a `source.approve(id, revision)` y muestra un aviso. Sigue el patrón de `acceptance/closing-actions.ts`. `change-page.ts` y `change-bar.ts` lo muestran cuando la decisión es `tests`.
- Servidor: `ENTERS.implementing` añade `tests.approved` y `tests.locked`; manda el último de esos eventos.

## Archivos

- crear packages/ui/src/data/tests.ts — los tests enviados y su rojo, desde la auditoría
- crear packages/ui/src/data/tests.test.ts — los tests de un cambio en `testing`, enviados o no
- modificar packages/ui/src/data/records.ts — `tests` en `ChangeView` y la decisión `tests`
- modificar packages/ui/src/data/views.ts — `decisionOf` y los tests de la vista
- modificar packages/ui/src/inbox/inbox-row.ts — «Tests por aprobar» en la Bandeja
- crear packages/ui/src/progress/tests-sent.ts — la sección de los tests en Progreso
- crear packages/ui/src/progress/tests-sent.test.ts — la sección con los tests enviados y mientras se escriben
- modificar packages/ui/src/progress/progress-tab.ts — la sección, encima de las tareas
- crear packages/ui/src/progress/tests-actions.ts — «Aprobar los tests» y su diálogo
- crear packages/ui/src/progress/tests-actions.test.ts — aprobar, el fallo de la fuente y la solo lectura
- modificar packages/ui/src/change/change-page.ts — la acción en la cabecera y lo que espera
- modificar packages/ui/src/change/change-bar.ts — la acción en la barra compacta
- modificar packages/cli/src/server/records.ts — desde cuándo está en `implementing` tras los tests
- modificar packages/cli/test/server/actions.test.ts — aprobar los tests desde el servidor
- modificar docs/ui.md — la fase de tests en la Bandeja, la cabecera y Progreso

## Tareas

- [x] T1: La decisión de los tests en los datos de la UI
  - files: packages/ui/src/data/tests.ts, packages/ui/src/data/tests.test.ts, packages/ui/src/data/records.ts, packages/ui/src/data/views.ts, packages/ui/src/inbox/inbox-row.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data --include src/inbox
- [x] T2: La sección de los tests enviados en Progreso
  - files: packages/ui/src/progress/tests-sent.ts, packages/ui/src/progress/tests-sent.test.ts, packages/ui/src/progress/progress-tab.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/progress
- [x] T3: Aprobar los tests desde la cabecera y la barra compacta
  - files: packages/ui/src/progress/tests-actions.ts, packages/ui/src/progress/tests-actions.test.ts, packages/ui/src/change/change-page.ts, packages/ui/src/change/change-bar.ts
  - ac: AC1, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/progress --include src/change
- [x] T4: El servidor aprueba los tests y fecha la implementación por ellos
  - files: packages/cli/src/server/records.ts, packages/cli/test/server/actions.test.ts
  - ac: AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server
- [ ] T5: La fase de tests en docs/ui.md
  - files: docs/ui.md
  - ac: AC6
  - type: docs
