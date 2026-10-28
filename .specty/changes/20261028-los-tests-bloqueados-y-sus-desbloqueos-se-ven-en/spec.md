---
kind: standard
follows:
  - 20261028-los-tests-enviados-se-ven-y-se-aprueban-desde-la
---

# Los tests bloqueados y sus desbloqueos se ven en la UI

## Objetivo

Con `policy.tests: contract`, los tests aprobados quedan bloqueados y solo la persona puede desbloquear uno para una tarea, pero la UI no lo muestra: una solicitud de desbloqueo parece una ampliación más y no hay forma de ver qué tests están bloqueados. Este cambio es la segunda parte del corte C6 de la épica «Tests como contrato». Progreso y Aceptación listan los tests bloqueados con sus desbloqueos, una solicitud de desbloqueo dice lo que es y qué implica, y el historial nombra los eventos de los tests.

## Fuera de alcance

- La matriz criterio → tests con los criterios manuales y el cambio de ejemplo en `testing` del prototipo: el corte C6, el cambio siguiente.
- Desbloquear un test desde la lista: se pide con `specty scope add` y se decide en la solicitud, como hoy.
- Mostrar el historial en la página del cambio: la pestaña Historial sigue sin llegar; aquí solo sus textos.

## Supuestos

- A1: Un test bloqueado es una ruta de `lockedTests` en `state.json`. Está desbloqueado mientras esa ruta está en el `scopeExtra` de la tarea en curso, como lo leen el guard y `tests-locked`. Los desbloqueos que ya hubo salen de `scope.decided` con `unlock` en la auditoría, con su solicitud y su tarea.
- A2: Una solicitud es de desbloqueo cuando alguna de sus rutas es un test bloqueado que aún no está en el `scopeExtra` de su tarea, la misma regla con la que `specty scope add` la crea.
- A3: La lista es un solo componente. En Progreso va tras los tests enviados y antes de «Te espera»; en Aceptación, tras los hallazgos, porque es lo que la persona revisa antes de aceptar.
- A4: Los iconos son `lock` y `lock-open` de Lucide.

## Criterios de aceptación

- AC1: CUANDO un cambio tiene tests bloqueados ENTONCES Progreso y Aceptación muestran la sección «Tests bloqueados» con cada test por su ruta. El que una solicitud desbloqueó para la tarea en curso dice «Desbloqueado para T2: vuelve a bloquearse al terminarla», y cada desbloqueo que ya hubo se lee con su solicitud y su tarea.
- AC2: CUANDO el agente pide desbloquear un test aprobado ENTONCES su solicitud en «Te espera» se titula «Desbloquear un test aprobado», marca cada ruta bloqueada y explica que la tarea podrá cambiarlo, que vuelve a bloquearse al terminarla y que solo lo decide la persona.
- AC3: CUANDO se lee el historial de un cambio con contract ENTONCES el envío de los tests, su aprobación, el bloqueo del rojo de un bug y cada desbloqueo, de una solicitud o de un ajuste, tienen su texto en los dos idiomas.
- AC4: CUANDO se lee docs/ui.md ENTONCES describe la lista de tests bloqueados y la solicitud de desbloqueo.
  - test: manual

## Diseño

- `data/locks.ts` (nuevo): `LockedTestView` (`path`, `unlockedFor?`, `unlocks` con `request` y `task`) y `lockedOf(state, audit)`, en el orden de las rutas. También `unlocksOf(state, request)`, las rutas bloqueadas de una solicitud (A2), que usa `progress.ts` para dar `unlocks` a cada `TaskScopeRequest`.
- `ChangeView` gana `lockedTests?`, solo cuando hay alguno.
- `progress/locked-tests.ts` (nuevo, `sp-locked-tests`): divisor «Tests bloqueados» con el número, una fila de documento por test con el candado (abierto si está desbloqueado), la ruta en monoespaciada y, debajo, atenuado, su estado y sus desbloqueos. Lo usan `progress-tab.ts` y `acceptance-tab.ts`.
- `progress/scope-request.ts`: con `unlocks`, el título, una marca «test aprobado» junto a cada ruta bloqueada y el texto de lo que implica. Las acciones no cambian: la UI es la persona.
- Historial: `data/history-tests.ts` (nuevo) con los textos de `tests.proposed`, `tests.approved` y `tests.locked`, porque `history.ts` ya tiene 285 líneas. `history.ts` los suma a su tabla y añade el desbloqueo a `scope.decided` (`unlock`) y a `spec.approved` (`unlocked`).

## Archivos

- crear packages/ui/src/data/locks.ts — los tests bloqueados, sus desbloqueos y los de una solicitud
- crear packages/ui/src/data/locks.test.ts — bloqueados, desbloqueados y solicitudes de desbloqueo
- modificar packages/ui/src/data/records.ts — `lockedTests` en la vista y `unlocks` en la solicitud
- modificar packages/ui/src/data/views.ts — los tests bloqueados de la vista
- modificar packages/ui/src/data/progress.ts — las rutas bloqueadas de cada solicitud
- crear packages/ui/src/progress/locked-tests.ts — la sección «Tests bloqueados»
- crear packages/ui/src/progress/locked-tests.test.ts — la sección con un test desbloqueado y otro no
- modificar packages/ui/src/progress/progress-tab.ts — la sección en Progreso
- modificar packages/ui/src/acceptance/acceptance-tab.ts — la sección en Aceptación
- modificar packages/ui/src/components/icons.ts — los iconos `lock` y `lock-open`
- modificar packages/ui/src/progress/scope-request.ts — la solicitud de desbloqueo
- crear packages/ui/src/data/history-tests.ts — los textos de los eventos de tests
- modificar packages/ui/src/data/history.ts — los textos de tests y los desbloqueos
- modificar docs/ui.md — los tests bloqueados y la solicitud de desbloqueo

## Tareas

- [x] T1: Los tests bloqueados y las solicitudes de desbloqueo en los datos de la UI
  - files: packages/ui/src/data/locks.ts, packages/ui/src/data/locks.test.ts, packages/ui/src/data/records.ts, packages/ui/src/data/views.ts, packages/ui/src/data/progress.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data
- [x] T2: La sección de tests bloqueados en Progreso y en Aceptación
  - files: packages/ui/src/progress/locked-tests.ts, packages/ui/src/progress/locked-tests.test.ts, packages/ui/src/progress/progress-tab.ts, packages/ui/src/acceptance/acceptance-tab.ts, packages/ui/src/components/icons.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/progress --include src/acceptance --include src/components
- [x] T3: La solicitud de desbloqueo dice lo que es
  - files: packages/ui/src/progress/scope-request.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/progress
- [x] T4: Los eventos de tests y los desbloqueos en el historial
  - files: packages/ui/src/data/history-tests.ts, packages/ui/src/data/history.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data
- [ ] T5: Los tests bloqueados en docs/ui.md
  - files: docs/ui.md
  - ac: AC4
  - type: docs
