---
kind: standard
epic: 20261025-knip-vigila-las-exportaciones-y-los-tipos-que-so
slice: C4
---

# las pantallas de la UI sin exportaciones que sobran

## Objetivo

Con todas sus reglas encendidas, knip marca en las pantallas de `packages/ui/src` diez clases exportadas que ningún otro archivo importa: los diálogos `ConfirmClosing`, `AdjustResult`, `AcceptResult`, `TurnOnDelegation`, `TurnOffDelegation`, `ShortcutsHelp`, `RejectScope` y `RejectAssumption`, el servicio `DelegationState` y el componente `ChangeMark`. Cada una la abre, la inyecta o la importa solo su propio archivo, así que se les quita el `export`. Es el cuarto corte de la épica; las reglas se encienden en C5.

## Fuera de alcance

- Cambiar lo que muestra o hace la UI: solo cambian las exportaciones.
- Los componentes y los datos de la UI, que ya limpió C3.

## Supuestos

- A1: Angular solo usa en otro archivo un componente, un diálogo o un servicio si ese archivo lo importa, así que una clase que solo usa su archivo no necesita `export`, también con la compilación AOT.

## Criterios de aceptación

- AC1: CUANDO se ejecuta knip con todas las reglas encendidas ENTONCES no marca ninguna exportación ni tipo de `packages/ui`.
- AC2: CUANDO se ejecutan los tests, la comprobación de tipos de Angular y la construcción de la UI ENTONCES pasan sin cambiar ninguna aserción.

## Archivos

- modificar packages/ui/src/acceptance/closing-actions.ts — ConfirmClosing sin export
- modificar packages/ui/src/acceptance/result-dialogs.ts — AdjustResult y AcceptResult sin export
- modificar packages/ui/src/app/delegation.ts — DelegationState, TurnOnDelegation y TurnOffDelegation sin export
- modificar packages/ui/src/keyboard/shortcuts.ts — ShortcutsHelp sin export
- modificar packages/ui/src/progress/scope-request.ts — RejectScope sin export
- modificar packages/ui/src/review/assumption-row.ts — RejectAssumption sin export
- modificar packages/ui/src/review/delta-review.ts — ChangeMark sin export

## Tareas

- [x] T1: La aceptación, la delegación y los atajos exportan solo lo que se importa
  - files: packages/ui/src/acceptance/closing-actions.ts, packages/ui/src/acceptance/result-dialogs.ts, packages/ui/src/app/delegation.ts, packages/ui/src/keyboard/shortcuts.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui typecheck
  - type: refactor
- [ ] T2: El progreso y la revisión exportan solo lo que se importa
  - files: packages/ui/src/progress/scope-request.ts, packages/ui/src/review/assumption-row.ts, packages/ui/src/review/delta-review.ts
  - ac: AC1, AC2
  - verify: pnpm check && pnpm --filter @baquia-dev/specty-ui exec ng build
  - type: refactor
