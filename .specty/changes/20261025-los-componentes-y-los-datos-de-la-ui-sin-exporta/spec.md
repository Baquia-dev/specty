---
kind: standard
epic: 20261025-knip-vigila-las-exportaciones-y-los-tipos-que-so
slice: C3
---

# los componentes y los datos de la UI sin exportaciones ni tipos que sobran

## Objetivo

Con todas sus reglas encendidas, knip marca en los componentes, los datos y el resaltado de `packages/ui/src` nueve exportaciones y cuatro tipos que ningún otro archivo importa: `PHASE_ICONS`, `ripple`, `DIALOG_TITLE_ID`, `LONG_FILE`, `PREVIEW_LINES`, `Toast`, `activeTask`, `changesRequestedOf`, `highImpactPending`, `TextRange`, `HistoryType`, `ScopeRequestView` y `LanguageId`. Todos se usan solo en su archivo, y se les quita el `export`. Es el tercer corte de la épica; las pantallas van en C4 y las reglas se encienden en C5.

## Fuera de alcance

- Cambiar lo que muestra o hace la UI: solo cambian las exportaciones.
- Las pantallas de la UI (acceptance, app, keyboard, progress y review), que limpia C4.

## Supuestos

- A1: La UI no publica nada de `src` como librería: es una aplicación que se construye entera, así que ninguna exportación es API para nadie fuera del repositorio.

## Criterios de aceptación

- AC1: CUANDO se ejecuta knip con todas las reglas encendidas ENTONCES no marca ninguna exportación ni tipo de `packages/ui/src/components`, `packages/ui/src/data` ni `packages/ui/src/highlight`.
- AC2: CUANDO se ejecutan los tests, la comprobación de tipos de Angular y la construcción de la UI ENTONCES pasan sin cambiar ninguna aserción.

## Archivos

- modificar packages/ui/src/components/badge.ts — PHASE_ICONS sin export
- modificar packages/ui/src/components/button.ts — ripple sin export
- modificar packages/ui/src/components/dialog.ts — DIALOG_TITLE_ID sin export
- modificar packages/ui/src/components/diff-file.ts — LONG_FILE y PREVIEW_LINES sin export
- modificar packages/ui/src/components/toast.ts — Toast sin export
- modificar packages/ui/src/data/sample-run.ts — activeTask sin export
- modificar packages/ui/src/data/views.ts — changesRequestedOf y highImpactPending sin export
- modificar packages/ui/src/data/records.ts — ScopeRequestView sin export
- modificar packages/ui/src/data/diff.ts — TextRange sin export
- modificar packages/ui/src/data/history.ts — HistoryType sin export
- modificar packages/ui/src/highlight/languages.ts — LanguageId sin export

## Tareas

- [x] T1: Los componentes exportan solo lo que se importa
  - files: packages/ui/src/components/badge.ts, packages/ui/src/components/button.ts, packages/ui/src/components/dialog.ts, packages/ui/src/components/diff-file.ts, packages/ui/src/components/toast.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui typecheck
  - type: refactor
- [x] T2: Las vistas y los registros exportan solo lo que se importa
  - files: packages/ui/src/data/sample-run.ts, packages/ui/src/data/views.ts, packages/ui/src/data/records.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui typecheck
  - type: refactor
- [ ] T3: El diff, el historial y el resaltado exportan solo lo que se importa
  - files: packages/ui/src/data/diff.ts, packages/ui/src/data/history.ts, packages/ui/src/highlight/languages.ts
  - ac: AC1, AC2
  - verify: pnpm check && pnpm --filter @baquia-dev/specty-ui exec ng build
  - type: refactor
