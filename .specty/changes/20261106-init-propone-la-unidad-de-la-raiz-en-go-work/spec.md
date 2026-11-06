---
kind: standard
---

# init propone la unidad de la raíz en go.work, Gradle y pub

## Objetivo

Desde 6bfc989, `specty init` propone una unidad para la raíz de un workspace de Cargo o uv que también es un paquete. Los de `go.work`, Gradle y pub o melos siguen sin propuesta en ese caso (P195): un `use .`, un `src/test` en la raíz o una carpeta `test` en la raíz. Con este cambio, la raíz es en ellos también un paquete más, en `.`, con su propio comando y por `paths` las entradas de la raíz fuera de las carpetas de los miembros (`rootPackagePaths`).

## Fuera de alcance

- Cambiar la unidad estática que se propone (`go vet ./...`, `dart analyze`…), o las de los miembros.
- La raíz que no es el caso que hoy se descarta: un workspace sin `use .`, sin `src/test` o sin `test` en la raíz sigue como hasta ahora.

## Supuestos

- A1: Con `go.work`, el patrón `./...` salta los subdirectorios con su propio `go.mod`, así que `go test ./...` desde la raíz prueba solo el módulo de la raíz (por eso se recomienda `go list -m -f '{{.Dir}}/...' | xargs go test` para probarlos todos). Go no está instalado en esta máquina: se apoya en ese comportamiento conocido de `go`.
  - impacto: alto
- A2: En Gradle, `:test` es la tarea de test del proyecto raíz y solo de él (`./gradlew :test`, o `gradle :test` sin `gradlew`). La unidad se llama como `rootProject.name` de los settings, o `root` si no lo dicen, y un subproyecto que depende de `project(":")` lleva los `paths` de la raíz.
  - impacto: alto
- A3: En pub o melos, `dart test` (o `flutter test`) en la raíz ejecuta solo la carpeta `test` del paquete de la raíz; no hace falta el `cd` en una subshell de los miembros. La raíz necesita un `name` en su `pubspec.yaml`.
- A4: Solo entra la raíz en el caso que hoy se descarta (`use .`, `src/test` o `test` en la raíz), así las propuestas de los demás workspaces no cambian, y cuenta para el mínimo de paquetes de cada uno.

## Criterios de aceptación

- AC1: CUANDO `specty init` corre en un workspace de `go.work` con `use .` y un `go.mod` en la raíz ENTONCES propone, además de una unidad por módulo, una para la raíz, llamada como su módulo, con `go test ./...` y por `paths` las entradas de la raíz fuera de las carpetas de los módulos y de las ocultas, y la de un módulo que requiere el de la raíz lleva esos `paths`.
- AC2: CUANDO `specty init` corre en un proyecto de Gradle con subproyectos y `src/test` en la raíz ENTONCES propone, además de una unidad por subproyecto con tests, una para la raíz con la tarea `:test`, llamada como `rootProject.name`, con los `paths` de la raíz, y la de un subproyecto que depende de `project(":")` los lleva.
- AC3: CUANDO `specty init` corre en un workspace de pub o melos con una carpeta `test` en la raíz y un `name` en su `pubspec.yaml` ENTONCES propone, además de una unidad por paquete con tests, una para la raíz con `dart test` (o `flutter test`), llamada como su paquete y con los `paths` de la raíz.

## Diseño

- Cada detector lee la raíz como un miembro más en `.` en el caso que hoy descarta, con `paths: rootPackagePaths(root, <carpetas de los miembros leídos>)`, y con su comando sin carpeta: `go test ./...`, `<runner> :test`, `dart test` o `flutter test`. `WorkspacePackage.paths` y el nombre de la unidad en `.` ya los da core (6bfc989).
- Gradle: el nombre sale de `rootProject.name = "…"` de los settings; `usesOf` traduce `project(":")` a ese nombre.

## Archivos

- modificar packages/cli/src/detect/units-go.ts — el módulo de la raíz con `use .`
- modificar packages/cli/src/detect/units-gradle.ts — el proyecto raíz con `src/test`
- modificar packages/cli/src/detect/units-dart.ts — el paquete de la raíz con `test`
- modificar packages/cli/test/units-go.test.ts — la raíz con `use .`; su caso sale del test que esperaba que no hubiera propuesta
- modificar packages/cli/test/units-gradle.test.ts — el proyecto raíz con tests; su caso sale del test que esperaba que no hubiera propuesta
- modificar packages/cli/test/units-dart.test.ts — la raíz con tests; su caso sale del test que esperaba que no hubiera propuesta
- modificar docs/formats.md — `verify.units`: la raíz como paquete en `go.work`, Gradle y pub o melos

## Tareas

- [x] T1: El módulo de la raíz de go.work recibe su unidad
  - files: packages/cli/src/detect/units-go.ts, packages/cli/test/units-go.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/units-go.test.ts && pnpm lint
  - type: feat
- [x] T2: El proyecto raíz de Gradle con tests recibe su unidad
  - files: packages/cli/src/detect/units-gradle.ts, packages/cli/test/units-gradle.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/units-gradle.test.ts && pnpm lint
  - type: feat
- [x] T3: El paquete de la raíz de pub o melos con tests recibe su unidad
  - files: packages/cli/src/detect/units-dart.ts, packages/cli/test/units-dart.test.ts, docs/formats.md
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/units-dart.test.ts test/units-go.test.ts test/units-gradle.test.ts test/workspace-units.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: feat

## Riesgos

- R1: A1 no se puede comprobar con Go en esta máquina — si `go test ./...` también recogiera los módulos miembros, la unidad de la raíz correría de más, pero no dejaría tests sin correr; es una propuesta que la persona revisa.
