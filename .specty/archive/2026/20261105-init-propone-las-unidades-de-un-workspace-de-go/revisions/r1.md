---
kind: standard
epic: 20261105-unidades-de-mas-workspaces
slice: C3
---

# init propone las unidades de un workspace de Go

## Objetivo

Desde C1, `proposedUnits` prueba en orden una lista de detectores de workspace, pero solo hay el de pnpm, npm y yarn: un monorepo de Go con `go.work` no recibe unidades. Con este corte, `specty init` en un workspace de `go.work` con al menos dos módulos propone, en su tarjeta, una unidad por módulo que ejecuta `go test ./<carpeta>/...` con la carpeta del módulo, las de los módulos del workspace que requiere y los archivos de la raíz que comparten.

## Fuera de alcance

- Los workspaces de Cargo, Gradle, uv y Dart: son C2, C4, C5 y C6.
- La documentación de qué workspaces reciben la propuesta: es C7.
- Cambiar lo que detecta el stack: un `go.work` sin `go.mod` en la raíz sigue sin stack de Go, así que su propuesta no lleva la unidad de comprobaciones estáticas salvo que las detecte el CI.
- Las dependencias entre módulos que solo resuelve el workspace, sin un `require` en su `go.mod`.

## Supuestos

- A1: Los módulos del workspace son las carpetas de las directivas `use` de `go.work`, en bloque o de una línea, con o sin comillas y con comentarios `//`, que tienen un `go.mod` con su directiva `module`; su nombre es la ruta del módulo. Se ignoran las que salen del repositorio (`..` o absolutas) y las que no tienen `go.mod`, y el detector no encuentra un workspace con menos de dos módulos, para dejar el repositorio a un detector posterior.
  - impacto: alto
- A2: Todos los módulos tienen tests, y la unidad de cada uno ejecuta `go test ./<carpeta>/...` desde la raíz, que en modo workspace resuelve los demás módulos sin `replace`.
  - impacto: alto
- A3: Un módulo depende de otro del workspace si un `require` de su `go.mod`, en bloque o de una línea, nombra la ruta de ese módulo; los demás `require` no cuentan.
- A4: Los archivos de la raíz que comparten todos los módulos son `go.work` y `go.work.sum`, los que existan.
- A5: Un `go.work` que usa la raíz (`use .`) no recibe propuesta: el módulo de la raíz contiene todas las carpetas, así que su unidad se repetiría con cualquier cambio y no ahorraría nada.
- A6: El detector de Go va en `DETECTORS` detrás del de pnpm, npm y yarn, que sigue primero; un repositorio con los dos workspaces recibe la propuesta del de JavaScript.

## Criterios de aceptación

- AC1: CUANDO se ejecuta `specty init` en un workspace de `go.work` con al menos dos módulos ENTONCES propone una unidad por módulo con `go test ./<carpeta>/...` y las carpetas de los módulos que requiere, y no propone nada con menos de dos módulos o con el módulo de la raíz.

## Diseño

- CLI, `detect/units-go.ts` (nuevo, como `units-js.ts`): `goWorkspace(root)`, el detector, que lee `go.work`, el `go.mod` de cada carpeta de `use` y devuelve los módulos como `WorkspacePackage` con su `command`, sin gestor, y los archivos compartidos. Un lector pequeño de las directivas de `go.work` y `go.mod` (bloques `verbo ( … )`, líneas sueltas, comillas y comentarios) sirve para `use`, `module` y `require`.
- CLI, `detect/workspace-units.ts`: `DETECTORS` pasa a `[jsWorkspace, goWorkspace]`.

## Archivos

- crear packages/cli/src/detect/units-go.ts — el detector de los workspaces de `go.work`
- modificar packages/cli/src/detect/workspace-units.ts — añadir el detector de Go a `DETECTORS`, tras el de JavaScript
- crear packages/cli/test/units-go.test.ts — la propuesta de `specty init` en un workspace de `go.work` y lo que lee de sus archivos

## Tareas

- [ ] T1: init propone las unidades de un workspace de Go
  - files: packages/cli/src/detect/units-go.ts, packages/cli/src/detect/workspace-units.ts, packages/cli/test/units-go.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/units-go.test.ts test/workspace-units.test.ts test/init-units.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: feat

## Riesgos

- R1: C2 añade el detector de Cargo a la misma línea de `DETECTORS` en paralelo — el conflicto al incorporar main es de una línea y se resuelve con los dos detectores tras el de JavaScript.
