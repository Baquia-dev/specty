---
kind: standard
epic: 20261026-las-funciones-de-specty-dentro-de-sus-limites
slice: C3
---

# La lógica de core: la máquina de estados, el guard, los esquemas, el alcance, el tamaño, la validación y el código

## Objetivo

Once funciones de la lógica de core pasan de los límites de Specty: `transition` (complejidad 27), `step` del tokenizador (26), `spectyArgs` (15), `decidePath` (71 líneas, 13), `withDefaults` (72, 38), `resolveChecks` (14), `removedAssertions` (14), `filesOf` (14), `formatSizeReason` (12), `split` del código (14) y `checkSections` (52). Cada una se divide por responsabilidad, o pasa a tabla, sin cambiar ninguna decisión.

## Fuera de alcance

- Cambiar una transición, una decisión del guard, un valor por defecto, un mensaje o el resultado de un análisis.
- Las funciones de core que ya están dentro de los límites.

## Supuestos

- A1: Los tests de core de la máquina de estados, el guard, los esquemas, el alcance, el tamaño, la validación y el código cubren estas funciones, así que pasan sin cambios si el refactor no cambia nada; los de la CLI, que pasan por ellas, lo confirman al aceptar.
  - impacto: alto
- A2: Las ramas se separan sin casts: los eventos de la máquina por grupos estrechados con `Extract`, el tokenizador y el guard por etapas en el mismo orden, y los valores por defecto por sección de la configuración.
  - impacto: alto

## Criterios de aceptación

- AC1: CUANDO se mide `packages/core/src` con `specty check --all` ENTONCES ninguna función pasa de 50 líneas ni de complejidad 10.
- AC2: CUANDO se ejecutan los tests de core y de la CLI ENTONCES pasan sin cambiar lo que comprueban.

## Archivos

- modificar packages/core/src/flow/machine.ts — el resultado de cada grupo de eventos
- modificar packages/core/src/guard/tokens.ts — cada carácter por su clase, en el mismo orden
- modificar packages/core/src/guard/shell.ts — cada forma de invocar Specty
- modificar packages/core/src/guard/decide.ts — la ruta por etapas: spec y protegidos, cambio y fase, alcance de la tarea
- modificar packages/core/src/schema/config.ts — los valores por defecto por sección
- modificar packages/core/src/schema/checks.ts — las capas, los generadores y los comandos
- modificar packages/core/src/scope/assertions.ts — las cabeceras y las aserciones de un diff
- modificar packages/core/src/scope/risk.ts — las cabeceras y las líneas añadidas de un diff
- modificar packages/core/src/sizing/size.ts — los motivos que cuentan, en una tabla
- modificar packages/core/src/checks/code.ts — el comentario de bloque y cada carácter de código
- modificar packages/core/src/validate/structure.ts — las secciones que sobran

## Tareas

- [x] T1: La máquina de estados
  - files: packages/core/src/flow/machine.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run
  - type: refactor
- [x] T2: El guard
  - files: packages/core/src/guard/tokens.ts, packages/core/src/guard/shell.ts, packages/core/src/guard/decide.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run
  - type: refactor
- [x] T3: Los esquemas de la configuración
  - files: packages/core/src/schema/config.ts, packages/core/src/schema/checks.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run
  - type: refactor
- [x] T4: Los diffs del alcance
  - files: packages/core/src/scope/assertions.ts, packages/core/src/scope/risk.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run
  - type: refactor
- [x] T5: El tamaño, el código y la validación
  - files: packages/core/src/sizing/size.ts, packages/core/src/checks/code.ts, packages/core/src/validate/structure.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run
  - type: refactor
