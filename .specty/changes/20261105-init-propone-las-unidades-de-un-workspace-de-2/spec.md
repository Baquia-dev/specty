---
kind: standard
epic: 20261105-unidades-de-mas-workspaces
slice: C6
---

# init propone las unidades de un workspace de Dart

## Objetivo

Desde C1, `specty init` prueba en orden una lista de detectores de workspace: hoy, los de pnpm, npm y yarn, Cargo, `go.work`, uv y Gradle. Un monorepo de Dart o Flutter con un workspace de pub o de melos no recibe nada. Con este corte, `specty init` en un workspace de pub o de melos con al menos dos paquetes con tests propone, en su tarjeta, una unidad por paquete que ejecuta `dart test` o `flutter test` en su carpeta, con su carpeta, las de los paquetes de los que depende y los archivos de la raíz que comparten.

## Fuera de alcance

- La documentación de qué workspaces reciben la propuesta: es C7.
- Los paquetes anidados más de un nivel bajo la parte fija de un glob (`packages/**` encuentra `packages/a`, no `packages/a/example`), como en los workspaces de pnpm.
- Los scripts de melos (`melos run test`), sus filtros (`--scope`, `--ignore`) y la configuración de melos 7 bajo la clave `melos` de `pubspec.yaml`, salvo la lista `workspace` de pub, que sí cuenta.
- Los tests de integración de Flutter (`integration_test/`): solo cuenta la carpeta `test`.
- Cambiar lo que detecta el stack: la unidad de comprobaciones estáticas sale de lo que ya detecta el `pubspec.yaml` de la raíz (`dart analyze` o `flutter analyze`).

## Supuestos

- A1: El detector de Dart encuentra un workspace cuando el `pubspec.yaml` de la raíz tiene la lista `workspace` (pub) o `melos.yaml` tiene la lista `packages` (melos hasta la 6). Sus paquetes son las carpetas de las dos listas, con sus globs expandidos con `expand` como los de pnpm, menos las de `ignore` de `melos.yaml`, expandidas igual, y menos la raíz y las que salen del repositorio, que tienen un `pubspec.yaml` con `name`. No encuentra workspace con menos de dos paquetes o cuando la raíz tiene una carpeta `test`, cuya unidad sería el repositorio entero.
  - impacto: alto
- A2: Un paquete tiene tests si tiene una carpeta `test`, y su unidad ejecuta `(cd <carpeta> && flutter test)` si su `pubspec.yaml` tiene la clave `flutter` o la dependencia `flutter`, como decide el stack, y `(cd <carpeta> && dart test)` si no. El paréntesis abre una subshell para que el `cd` no pase a la unidad siguiente cuando la verificación completa las une con `&&`; su nombre es el `name` de su `pubspec.yaml`.
  - impacto: alto
- A3: Un paquete depende de otro cuando sus `dependencies` o `dev_dependencies` nombran a otro paquete del workspace, sea cual sea su fuente (`path`, versión o `workspace`); las demás dependencias no cuentan.
- A4: Los archivos de la raíz que comparten todos los paquetes son los que existen de `pubspec.yaml`, `pubspec.lock` y `melos.yaml`.
- A5: El YAML se lee con `yaml`, que la CLI ya usa, y `safeYaml` de `detect/project.ts` se exporta para no repetirlo; un `pubspec.yaml` que no se puede leer cuenta como ausente.
- A6: El detector de Dart va el último de `DETECTORS`; un repositorio con otro workspace de los anteriores recibe la propuesta de ese.

## Criterios de aceptación

- AC6: CUANDO se ejecuta `specty init` en un workspace de melos o de pub con al menos dos paquetes con tests ENTONCES propone una unidad por paquete con `dart test` o `flutter test` en su carpeta y las carpetas de los paquetes de los que depende, y no propone nada con menos de dos paquetes con tests, con tests en la raíz o sin workspace.

## Diseño

- CLI, `detect/units-dart.ts` (nuevo, como `units-uv.ts`): `dartWorkspace(root)`, el detector, que lee el `pubspec.yaml` y el `melos.yaml` de la raíz, expande las carpetas de `workspace` y `packages` menos las de `ignore` con `expand`, lee el `pubspec.yaml` de cada una y devuelve sus paquetes como `WorkspacePackage` con su `name`, `tests` según su carpeta `test`, su `command` y los nombres de sus dependencias que son paquetes del workspace, sin gestor, y los archivos compartidos que existen.
- CLI, `detect/project.ts`: `safeYaml` pasa a exportarse.
- CLI, `detect/workspace-units.ts`: `DETECTORS` pasa a `[jsWorkspace, cargoWorkspace, goWorkspace, uvWorkspace, gradleWorkspace, dartWorkspace]`.

## Archivos

- crear packages/cli/src/detect/units-dart.ts — el detector de los workspaces de pub y melos
- modificar packages/cli/src/detect/project.ts — exportar `safeYaml`
- modificar packages/cli/src/detect/workspace-units.ts — añadir el detector de Dart al final de `DETECTORS`
- crear packages/cli/test/units-dart.test.ts — la propuesta de `specty init` en un workspace de pub o de melos y lo que lee de sus archivos

## Tareas

- [x] T1: init propone las unidades de un workspace de Dart
  - files: packages/cli/src/detect/units-dart.ts, packages/cli/src/detect/project.ts, packages/cli/src/detect/workspace-units.ts, packages/cli/test/units-dart.test.ts
  - ac: AC6
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/units-dart.test.ts test/workspace-units.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: feat

## Riesgos

- R1: En Windows, `cmd` agrupa con paréntesis sin abrir una subshell, así que el `cd` de una unidad pasaría a la siguiente al unirlas con `&&` — la propuesta es una sugerencia que la persona revisa antes de añadirla, y las unidades que Specty ejecuta una a una no se ven afectadas.
