---
kind: standard
---

# Solo lectura en aceptación, alcance y modo delegado

## Objetivo

Segunda parte de «Solo lectura en la revisión». Cuando la UI no deja decidir, porque el servidor lo arrancó el agente o la pestaña no tiene sesión, la aceptación, el cierre, las solicitudes de alcance y el modo delegado ya no ofrecen decisiones que van a fallar. Sus botones aparecen desactivados con el motivo, y el atajo «No se cumple…» de cada criterio no se muestra.

## Fuera de alcance

- Un aviso general de solo lectura en la cabecera de la app.
- Cambiar qué se puede decidir en cada fase: solo cambia si se ofrece cuando la fuente no deja decidir.

## Supuestos

- A1: Las solicitudes de alcance desactivan sus botones con el motivo en vez de ocultarlos. En la pestaña de progreso no hay cabecera que explique el solo lectura, y la solicitud sigue esperando a la persona.

## Criterios de aceptación

- AC1: CUANDO la UI es de solo lectura y el cambio está en aceptación ENTONCES «Pedir ajustes…» y «Aceptar resultado» aparecen desactivados, con el motivo en el tooltip y visible bajo los botones, y los criterios no ofrecen «No se cumple…».
- AC2: CUANDO la UI es de solo lectura ENTONCES «Ejecutar» de la verificación completa y «Confirmar y archivar» del cierre aparecen desactivados, con el motivo en el tooltip.
- AC3: CUANDO hay una solicitud de alcance pendiente en una UI de solo lectura ENTONCES «Aprobar» y «Rechazar…» aparecen desactivados, con el motivo en el tooltip.
- AC4: CUANDO la persona abre el modo delegado en una UI de solo lectura, desde el menú, el chip o la paleta, ENTONCES ve su estado, pero «Activar…», «Desactivar…» y la confirmación de los diálogos aparecen desactivados, con el motivo.
- AC5: CUANDO alguien lee el documento de la UI ENTONCES encuentra cómo se ven en solo lectura la aceptación, el cierre, el alcance y el modo delegado.

## Diseño

- Cada componente toma el motivo de `Decisions.blocked()`, de «Solo lectura en la revisión», y lo suma al `disabledReason` de sus botones. `AcceptanceActions` lo muestra además bajo los botones, en lugar de la línea de la verificación completa, como `ReviewActions`.
- `AcceptanceTab` solo da `canAdjust` a los criterios si la persona puede decidir.
- `acceptance-actions.ts` tiene 298 líneas: sus diálogos (ajustar y aceptar) y `ResultDialogs` pasan a `result-dialogs.ts` antes de tocarlo.

## Archivos

- crear packages/ui/src/acceptance/result-dialogs.ts — los diálogos de ajustar y aceptar, y `ResultDialogs`
- modificar packages/ui/src/acceptance/acceptance-actions.ts — solo la decisión de la cabecera, desactivada con el motivo
- modificar packages/ui/src/acceptance/acceptance-actions.test.ts — tests de la cabecera y los diálogos
- modificar packages/ui/src/acceptance/criterion-row.ts — importa los diálogos de su archivo
- modificar packages/ui/src/acceptance/acceptance-tab.ts — «No se cumple…» solo si se puede decidir
- modificar packages/ui/src/acceptance/acceptance-tab.test.ts — tests de los criterios en solo lectura
- modificar packages/ui/src/acceptance/full-verification.ts — «Ejecutar» desactivado con el motivo
- modificar packages/ui/src/acceptance/full-verification.test.ts — tests de «Ejecutar»
- modificar packages/ui/src/acceptance/closing-actions.ts — «Confirmar y archivar» desactivado con el motivo
- modificar packages/ui/src/acceptance/closing-actions.test.ts — tests del cierre
- modificar packages/ui/src/progress/scope-request.ts — «Aprobar» y «Rechazar…» desactivados con el motivo
- modificar packages/ui/src/progress/progress-tab.test.ts — tests del alcance
- modificar packages/ui/src/app/delegation.ts — activar y desactivar, desactivados con el motivo
- modificar packages/ui/src/app/delegation.test.ts — tests del modo delegado
- modificar docs/ui.md — aceptación, cierre, alcance y modo delegado en solo lectura

## Tareas

- [x] T1: Los diálogos del resultado en su propio archivo
  - files: packages/ui/src/acceptance/result-dialogs.ts, packages/ui/src/acceptance/acceptance-actions.ts, packages/ui/src/acceptance/criterion-row.ts, packages/ui/src/acceptance/acceptance-actions.test.ts
  - ac: —
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/acceptance && pnpm sources
  - type: refactor
- [x] T2: La aceptación en solo lectura
  - files: packages/ui/src/acceptance/acceptance-actions.ts, packages/ui/src/acceptance/acceptance-actions.test.ts, packages/ui/src/acceptance/acceptance-tab.ts, packages/ui/src/acceptance/acceptance-tab.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/acceptance && pnpm sources
- [x] T3: La verificación y el cierre en solo lectura
  - files: packages/ui/src/acceptance/full-verification.ts, packages/ui/src/acceptance/full-verification.test.ts, packages/ui/src/acceptance/closing-actions.ts, packages/ui/src/acceptance/closing-actions.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/acceptance && pnpm sources
- [x] T4: El alcance y el modo delegado en solo lectura
  - files: packages/ui/src/progress/scope-request.ts, packages/ui/src/progress/progress-tab.test.ts, packages/ui/src/app/delegation.ts, packages/ui/src/app/delegation.test.ts
  - ac: AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/progress --include src/app && pnpm sources
- [x] T5: Documentar la aceptación, el alcance y el modo delegado en solo lectura
  - files: docs/ui.md
  - ac: AC5
  - verify: pnpm check
  - type: docs
