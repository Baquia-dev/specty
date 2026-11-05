---
kind: standard
epic: 20261105-unidades-de-mas-workspaces
slice: C4
---

# init propone las unidades de un proyecto de Gradle

## Objetivo

Desde C1, `specty init` prueba en orden una lista de detectores de workspace: hoy, el de pnpm, npm y yarn, el de Cargo y el de `go.work`. Un proyecto de Gradle con varios subproyectos no recibe nada. Con este corte, `specty init` en un proyecto de Gradle con al menos dos subproyectos con tests propone, en su tarjeta, una unidad por subproyecto que ejecuta su tarea `test`, con su carpeta, las de los subproyectos de los que depende y los archivos y carpetas de la raíz que comparten.

## Fuera de alcance

- Los workspaces de uv y Dart y la documentación de qué workspaces reciben la propuesta: son C5, C6 y C7.
- Un subproyecto cuya carpeta cambia `settings.gradle(.kts)` con `projectDir`: cuenta en su carpeta por defecto.
- Los `include` que se calculan en código (bucles, funciones o listas en variables): solo cuentan los que nombran sus rutas como texto.
- Los tests de Kotlin Multiplatform (`src/commonTest`, `src/jvmTest`) y su tarea `allTests`: un subproyecto sin `src/test` no recibe unidad.
- Los proyectos de las compilaciones incluidas con `includeBuild`: no reciben unidad, solo cuentan como carpetas compartidas.
- Cambiar lo que detecta el stack: un proyecto sin `build.gradle(.kts)` en la raíz sigue sin stack de Java o Kotlin, así que su propuesta no lleva la unidad de comprobaciones estáticas salvo que las detecte el CI.

## Supuestos

- A1: El detector de Gradle encuentra un proyecto cuando la raíz tiene `settings.gradle.kts` o `settings.gradle`. Sus subproyectos son las rutas de sus `include`, en Kotlin o en Groovy, con o sin paréntesis, varias por llamada y en varias líneas, sin las que están en comentarios `//` o `/* … */`; una ruta sin `:` inicial cuenta como si lo tuviera, y la carpeta de `:a:b` es `a/b`. Solo cuentan los que tienen su carpeta. No encuentra proyecto, para dejar el repositorio a un detector posterior, con menos de dos subproyectos con tests o cuando el proyecto de la raíz tiene `src/test`, cuya carpeta es el repositorio entero.
  - impacto: alto
- A2: Un subproyecto tiene tests cuando tiene la carpeta `src/test`, como dice A3 de la épica, y su unidad ejecuta `./gradlew :<ruta>:test` si la raíz tiene `gradlew`, o `gradle :<ruta>:test` si no; su nombre es su ruta, como `:libs:core`.
  - impacto: alto
- A3: Un subproyecto depende de otro cuando su `build.gradle.kts` o `build.gradle` lo nombra con `project(":…")`, también con `project(path: ":…")`, o con su accesor tipado (`projects.libs.coreData` para `:libs:core-data`), fuera de comentarios. Los subproyectos sin tests no reciben unidad, pero cuentan como dependencias, también indirectas.
- A4: Lo que comparten todos los subproyectos son los archivos de la raíz `settings.gradle.kts`, `settings.gradle`, `build.gradle.kts`, `build.gradle` y `gradle.properties`, y las carpetas `gradle`, `buildSrc` y las de cada `includeBuild` dentro del repositorio, como `<carpeta>/**`: las que existen.
- A5: El detector de Gradle va en `DETECTORS` detrás del de Cargo y el de Go; un repositorio con otro workspace de los anteriores recibe la propuesta de ese.

## Criterios de aceptación

- AC4: CUANDO se ejecuta `specty init` en un proyecto de Gradle con al menos dos subproyectos con tests ENTONCES propone una unidad por subproyecto con su tarea `test` y las carpetas de los subproyectos de los que depende, y no propone nada con menos de dos subproyectos con tests o con tests en el proyecto de la raíz.

## Diseño

- CLI, `detect/units-gradle.ts` (nuevo, como `units-go.ts`): `gradleWorkspace(root)` lee `settings.gradle.kts` o `settings.gradle` sin comentarios, saca las rutas de `include` y las carpetas de `includeBuild`, y por cada subproyecto con carpeta mira si tiene `src/test` y lee su archivo de construcción para encontrar los subproyectos que nombra con `project(…)` o con su accesor tipado. Devuelve los subproyectos como `WorkspacePackage` con su `command`, sin gestor, y lo que comparten.
- CLI, `detect/workspace-units.ts`: `DETECTORS` pasa a `[jsWorkspace, cargoWorkspace, goWorkspace, gradleWorkspace]`.

## Archivos

- crear packages/cli/src/detect/units-gradle.ts — el detector de los proyectos de Gradle
- modificar packages/cli/src/detect/workspace-units.ts — añadir el detector de Gradle a `DETECTORS`, tras el de Cargo y el de Go
- crear packages/cli/test/units-gradle.test.ts — la propuesta de `specty init` en un proyecto de Gradle y lo que lee de sus archivos

## Tareas

- [ ] T1: init propone las unidades de un proyecto de Gradle
  - files: packages/cli/src/detect/units-gradle.ts, packages/cli/src/detect/workspace-units.ts, packages/cli/test/units-gradle.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/units-gradle.test.ts test/workspace-units.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: feat

## Riesgos

- R1: C5 añade el detector de uv a la misma línea de `DETECTORS` en paralelo — el conflicto al incorporar main es de una línea y se resuelve con los dos detectores.
- R2: Leer los `include` y las dependencias con expresiones regulares, sin evaluar el script, falla con construcciones poco habituales — la propuesta es una sugerencia que la persona revisa antes de añadirla.
