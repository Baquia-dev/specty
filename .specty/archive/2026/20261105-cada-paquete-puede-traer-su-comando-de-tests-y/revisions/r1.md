---
kind: standard
epic: 20261105-unidades-de-mas-workspaces
slice: C1
---

# Cada paquete puede traer su comando de tests y la CLI prueba un detector por workspace

## Objetivo

Hoy `proposeUnits` arma el comando de los tests de cada paquete con el gestor de JavaScript (pnpm, npm o yarn), y la CLI solo sabe leer un workspace de `package.json`. Con este corte, cada paquete puede traer su propio comando de tests y la CLI prueba, en orden, una lista de detectores de workspace y propone con el primero que encuentra uno. El de pnpm, npm y yarn es el primero y propone lo mismo que antes. Es la base de los cortes C2–C6, que añaden un detector cada uno.

## Fuera de alcance

- Los detectores de Cargo, `go.work`, Gradle, uv y Dart: llegan en C2–C6.
- La documentación de qué workspaces reciben la propuesta: es C7.
- Cambiar la línea «Paquetes» de AGENTS.md o lo que detecta el stack.

## Supuestos

- A1: `WorkspacePackage` admite `command`, el comando que ejecuta los tests de ese paquete, y `UnitsFacts.manager` pasa a ser opcional. La unidad de un paquete con tests usa su `command` y, si no lo trae, el del gestor (`pnpm --filter`, `npm test --workspace=`, `yarn workspace`); un paquete sin ninguno de los dos no recibe unidad.
  - impacto: alto
- A2: Un detector recibe la raíz y la detección del proyecto, y devuelve los paquetes, el gestor si lo hay y los archivos de la raíz que comparten, o nada si el repositorio no es su tipo de workspace. `proposedUnits` los prueba en orden, uno tras otro, y propone con el primero que devuelve algo, aunque no llegue a dos paquetes con tests; las comprobaciones estáticas y el idioma los añade ella, como antes.
  - impacto: alto
- A3: El detector de pnpm, npm y yarn encuentra un workspace solo si al menos dos de los paquetes detectados tienen un `package.json` con nombre. Así un workspace de melos, cuyos paquetes también salen en la detección pero sin `package.json`, queda para un detector posterior, y la propuesta de un workspace de JavaScript no cambia.

## Criterios de aceptación

- AC1: CUANDO un paquete trae su propio comando de tests ENTONCES la unidad que se propone para él usa ese comando, y los workspaces de pnpm, npm y yarn se proponen como antes.

## Diseño

- Core, `units-proposal.ts`: `WorkspacePackage.command?` y `UnitsFacts.manager?`; `proposeUnits` toma, por paquete con tests, su `command` o el del gestor, y descarta los que no tienen ninguno antes de contar si llegan a dos.
- CLI, `detect/workspace-units.ts`: los tipos `WorkspaceFacts` (lo que un detector sabe del workspace: `UnitsFacts` sin `checks` ni `lang`) y `UnitsDetector`, la lista `DETECTORS` y `proposedUnits(root, detection, lang, detectors = DETECTORS)`, que los prueba en orden.
- CLI, `detect/units-js.ts` (nuevo): el detector de pnpm, npm y yarn, con la lectura de los `package.json`, el gestor y los archivos de la raíz que hoy están en `workspace-units.ts`; cada detector de C2–C6 tendrá su archivo igual.

## Archivos

- modificar packages/core/src/units-proposal.ts — el comando propio de cada paquete y el gestor opcional
- modificar packages/core/test/units-proposal.test.ts — la unidad de un paquete con su propio comando
- modificar packages/cli/src/detect/workspace-units.ts — probar los detectores en orden
- crear packages/cli/src/detect/units-js.ts — el detector de los workspaces de pnpm, npm y yarn
- crear packages/cli/test/workspace-units.test.ts — el orden de los detectores y el de JavaScript ante un workspace de melos

## Tareas

- [ ] T1: Cada paquete puede traer su comando de tests
  - files: packages/core/src/units-proposal.ts, packages/core/test/units-proposal.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/units-proposal.test.ts
  - type: feat
- [ ] T2: La CLI prueba un detector por workspace, en orden
  - files: packages/cli/src/detect/workspace-units.ts, packages/cli/src/detect/units-js.ts, packages/cli/test/workspace-units.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/workspace-units.test.ts test/init-units.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: feat

## Riesgos

- R1: Un detector posterior nunca correría si el de JavaScript reclamara cualquier workspace con paquetes detectados — A3 lo limita a paquetes con `package.json`, y un test lo comprueba con un workspace de melos.
