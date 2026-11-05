---
kind: epic
---

# init propone las unidades de los workspaces de Cargo, Go, Gradle, uv y Dart

## Objetivo

Desde 20261105-init-propone-unidades, `specty init` propone en su tarjeta las unidades de `verify.units` de un workspace de pnpm, npm o yarn, sin escribirlas. Un monorepo de Rust, Go, Java o Kotlin, Python o Dart no recibe nada, aunque es donde más ahorran: cada uno con su forma de listar sus paquetes, ejecutar los tests de uno y declarar de cuáles depende. Con esta épica, `init` propone también las de los workspaces de Cargo, `go.work`, Gradle, uv y melos o pub, con las mismas reglas: una unidad con las comprobaciones estáticas detectadas y una por paquete con tests, con su carpeta, las de los paquetes de los que depende y los archivos de la raíz que comparten. Es P166.

## Fuera de alcance

- Escribir las unidades en `.specty/config.yaml`: siguen siendo una propuesta que la persona revisa.
- Maven, Bazel, Nx, Turborepo y otros orquestadores.
- Cambiar la línea «Paquetes» de AGENTS.md o lo que detecta el stack.

## Supuestos

- A1: El núcleo deja que cada paquete traiga su propio comando de tests (`WorkspacePackage.command`), y la CLI prueba un detector por tipo de workspace, en orden, y propone con el primero que encuentra uno; el de pnpm, npm y yarn es el primero y no cambia.
  - impacto: alto
- A2: Los manifiestos TOML (Cargo y uv) se leen con `smol-toml`, que ya está en el lockfile como dependencia de otra herramienta.
  - impacto: alto
- A3: Un paquete tiene tests si su ecosistema los ejecuta sin más: en Cargo y Go, todos; en Gradle, los que tienen `src/test`; en uv, los que tienen una carpeta `tests`; en Dart, los que tienen `test/`. Cada uno los ejecuta con `cargo test -p <nombre>`, `go test ./<carpeta>/...`, `./gradlew :<proyecto>:test` (o `gradle` sin wrapper), `uv run --package <nombre> pytest <carpeta>` y `dart test` o `flutter test` en su carpeta.
  - impacto: alto
- A4: Un paquete depende de otro del workspace si su manifiesto lo nombra: en Cargo, una dependencia con `path` o `workspace = true` hacia un miembro; en Go, un `require` de su módulo; en Gradle, un `project(":…")`; en uv, una dependencia del proyecto que es un miembro; en Dart, una dependencia con el nombre de otro paquete.

## Criterios de aceptación

- AC1: CUANDO un paquete trae su propio comando de tests ENTONCES la unidad que se propone para él usa ese comando, y los workspaces de pnpm, npm y yarn se proponen como antes.
- AC2: CUANDO se ejecuta `specty init` en un workspace de Cargo con al menos dos miembros ENTONCES propone una unidad por miembro con `cargo test -p <nombre>` y las carpetas de los miembros de los que depende.
- AC3: CUANDO se ejecuta `specty init` en un workspace de `go.work` con al menos dos módulos ENTONCES propone una unidad por módulo con `go test ./<carpeta>/...` y las carpetas de los módulos que requiere.
- AC4: CUANDO se ejecuta `specty init` en un proyecto de Gradle con al menos dos subproyectos con tests ENTONCES propone una unidad por subproyecto con su tarea `test` y las carpetas de los subproyectos de los que depende.
- AC5: CUANDO se ejecuta `specty init` en un workspace de uv con al menos dos miembros con tests ENTONCES propone una unidad por miembro con `uv run --package <nombre> pytest <carpeta>` y las carpetas de los miembros de los que depende.
- AC6: CUANDO se ejecuta `specty init` en un workspace de melos o de pub con al menos dos paquetes con tests ENTONCES propone una unidad por paquete con `dart test` o `flutter test` en su carpeta y las carpetas de los paquetes de los que depende.
- AC7: CUANDO se lee la documentación de `verify.units` ENTONCES dice qué workspaces recibe la propuesta y con qué comando.
  - test: manual

## Cortes

- C1: Cada paquete puede traer su comando de tests y la CLI prueba un detector por workspace
  - ac: AC1
- C2: init propone las unidades de un workspace de Cargo
  - ac: AC2
  - depends: C1
- C3: init propone las unidades de un workspace de Go
  - ac: AC3
  - depends: C1
- C4: init propone las unidades de un proyecto de Gradle
  - ac: AC4
  - depends: C2
- C5: init propone las unidades de un workspace de uv
  - ac: AC5
  - depends: C3
- C6: init propone las unidades de un workspace de Dart
  - ac: AC6
  - depends: C4
- C7: La documentación de las unidades propuestas en cada workspace
  - ac: AC7
  - depends: C5, C6
