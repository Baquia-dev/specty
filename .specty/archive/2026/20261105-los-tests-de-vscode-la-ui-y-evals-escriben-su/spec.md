---
kind: standard
---

# Los tests de vscode, la UI y evals escriben su informe JUnit

## Objetivo

Los tests de core, exporters y la CLI ya dejan su informe JUnit en `coverage/junit.xml` (el corte C7 de la épica `20261105-pendientes-de-las-unidades`), pero los de vscode, la UI y evals no dejan ninguno, así que `checks.testTime` y la verificación fresca no ven sus tests. Con este cambio, los tres dejan su informe en `coverage/junit.xml` de su paquete sin perder los reporters de Vitest por defecto, y cada paquete tiene un test que lo vigila. Es la continuación de C7 (P149).

## Fuera de alcance

- core, exporters y la CLI, y su test `packages/cli/test/repo-junit.test.ts`: ya los cubrió C7.
- Escribir `checks.testTime` en `.specty/config.yaml`: lo edita la persona.
- Que la verificación fresca lea los informes y nombre los tests que fallaron: es el corte C8.
- Cambiar los informes de cobertura o sus umbrales.

## Supuestos

- A1: vscode y evals añaden en su `vitest.config.ts`, como core, exporters y la CLI, el reporter `junit` a los de Vitest por defecto (`[...configDefaults.reporters, "junit"]`), con `outputFile: { junit: "coverage/junit.xml" }`, relativo a la carpeta del paquete. `.gitignore` ya ignora `coverage/`, y en evals, que no mide cobertura, el reporter crea la carpeta.
- A2: En la UI, las opciones `reporters` y `outputFile` del builder `@angular/build:unit-test` en `angular.json` sustituyen los reporters de Vitest por defecto por una lista fija, que no sabe si corre con un agente (el reporter breve) ni en GitHub Actions (las anotaciones). Por eso la UI no las usa: su target `test` activa `runnerConfig: true`, y un `packages/ui/vitest-base.config.ts`, el nombre que busca el builder, declara los mismos `reporters` y `outputFile` que los demás paquetes. El builder conserva los de ese archivo cuando `angular.json` no fija los suyos: una prueba fuera del repositorio escribió el informe con el reporter breve.
  - impacto: alto
- A3: La cobertura de la UI va a `coverage/specty-ui/` y su informe JUnit a `coverage/junit.xml`, así que limpiar la cobertura no lo borra. En vscode, como en los paquetes de C7, el reporter abre su archivo después de que la cobertura limpie `coverage/`.
- A4: Cada paquete comprueba su propia configuración con un test suyo. El de la UI importa `vitest-base.config.ts` con una ruta literal, así que knip lo ve usado, y el builder deja `vitest/config` fuera del bundle de tests.
- A5: Cambiar estas configuraciones cambia las huellas de las unidades vscode, ui y estático, que en la próxima verificación completa corren una vez de nuevo. evals no tiene unidad: `pnpm test` no lo ejecuta y el CI lo corre con `pnpm test:evals`.

## Criterios de aceptación

- AC1: CUANDO se ejecutan los tests de vscode, la UI o evals ENTONCES cada uno deja su informe JUnit en `coverage/junit.xml` de su paquete y conserva los reporters de Vitest por defecto.

## Diseño

- `packages/vscode/vitest.config.ts` y `evals/vitest.config.ts`: `test.reporters: [...configDefaults.reporters, "junit"]` y `test.outputFile: { junit: "coverage/junit.xml" }`, con el comentario de la CLI.
- `packages/ui/vitest-base.config.ts` (nuevo): solo esos `reporters` y `outputFile`. `packages/ui/angular.json`: `"runnerConfig": true` en las opciones del target `test`, sin `reporters` ni `outputFile`.
- Los tests, como `packages/cli/test/repo-junit.test.ts` pero de un solo paquete: importan la configuración del suyo y comprueban que sus reporters son los de Vitest por defecto más `junit` y que este escribe en `coverage/junit.xml`. El de la UI además lee `angular.json` desde `process.cwd()`, como `src/theme/tokens.test.ts` lee `styles.css`, y comprueba que el target `test` carga ese archivo y no fija `reporters` ni `outputFile`.

## Archivos

- modificar packages/vscode/vitest.config.ts — el reporter junit en coverage/junit.xml
- crear packages/vscode/test/repo-junit.test.ts — vigila que vscode deja su informe: AC1
- modificar evals/vitest.config.ts — el reporter junit en coverage/junit.xml
- crear evals/test/repo-junit.test.ts — vigila que evals deja su informe: AC1
- crear packages/ui/vitest-base.config.ts — los reporters de Vitest por defecto más junit en coverage/junit.xml
- modificar packages/ui/angular.json — el target test carga vitest-base.config.ts
- crear packages/ui/src/repo-junit.test.ts — vigila que la UI deja su informe: AC1

## Tareas

- [x] T1: vscode deja su informe JUnit en coverage/junit.xml
  - files: packages/vscode/vitest.config.ts, packages/vscode/test/repo-junit.test.ts
  - ac: AC1
  - verify: pnpm --filter specty-vscode test && test -s packages/vscode/coverage/junit.xml && pnpm --filter specty-vscode typecheck && pnpm lint && pnpm knip
  - type: build
- [x] T2: evals deja su informe JUnit en coverage/junit.xml
  - files: evals/vitest.config.ts, evals/test/repo-junit.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-evals exec vitest run test/repo-junit.test.ts && test -s evals/coverage/junit.xml && pnpm --filter @baquia-dev/specty-evals typecheck && pnpm lint && pnpm knip
  - type: build
- [x] T3: la UI deja su informe JUnit en coverage/junit.xml
  - files: packages/ui/vitest-base.config.ts, packages/ui/angular.json, packages/ui/src/repo-junit.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/repo-junit.test.ts && test -s packages/ui/coverage/junit.xml && pnpm --filter @baquia-dev/specty-ui typecheck && pnpm lint && pnpm knip
  - type: build

## Cierre

### Resumen

Los tests de vscode, la UI y evals dejan su informe JUnit en `coverage/junit.xml` de su paquete, como ya hacían core, exporters y la CLI. vscode y evals añaden en su `vitest.config.ts` el reporter `junit` a los de Vitest por defecto, con `outputFile: { junit: "coverage/junit.xml" }`. La UI activa `runnerConfig: true` en el target `test` de `angular.json`, y el builder carga `packages/ui/vitest-base.config.ts`, que declara esos mismos `reporters` y `outputFile`. Cada paquete tiene su `repo-junit.test.ts`, que comprueba su propia configuración; el de la UI también comprueba que `angular.json` carga ese archivo y no fija `reporters` ni `outputFile`.

### Desviaciones

- Ninguna: se siguió el plan aprobado.

### Decisiones

- La UI no usa las opciones `reporters` y `outputFile` del builder `@angular/build:unit-test`: la lista fija de `angular.json` sustituiría a los reporters de Vitest por defecto y perdería el reporter breve con un agente y las anotaciones en GitHub Actions. En su lugar, el target carga un `vitest-base.config.ts` (el nombre que busca el builder con `runnerConfig: true`), cuyos `reporters` y `outputFile` el builder conserva.
- Cada paquete vigila su configuración con un test suyo, que solo lee archivos del paquete, así que no hace falta tocar los `paths` de ninguna unidad.
- El informe de la UI va a `coverage/junit.xml`, al lado de `coverage/specty-ui/`, donde el builder deja la cobertura: limpiar la cobertura no lo borra.

### Pendientes

- Ninguno.
