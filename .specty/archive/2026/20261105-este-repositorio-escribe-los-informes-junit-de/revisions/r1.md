---
kind: standard
epic: 20261105-pendientes-de-las-unidades
slice: C7
---

# Este repositorio escribe los informes JUnit de sus tests

## Objetivo

Los tests de este repositorio no dejan ningún informe JUnit, así que `checks.testTime` no tiene qué leer y la verificación fresca no puede nombrar los tests que fallan (el corte C8). Con este cambio, los tests de core, exporters y la CLI dejan su informe JUnit en `coverage/junit.xml` de su paquete, y un test vigila que lo hagan. Es el corte C7 de la épica `20261105-pendientes-de-las-unidades` (AC9 de la épica), dividido como el LCOV para no pasar de tres módulos.

## Fuera de alcance

- Los informes JUnit de vscode, la UI y evals: van a un cambio de continuación al cerrar este.
- Escribir `checks.testTime` en `.specty/config.yaml`: lo edita la persona.
- Que la verificación fresca lea los informes y nombre los tests que fallaron: es el corte C8.
- Cambiar los informes de cobertura o sus umbrales.

## Supuestos

- A1: core, exporters y la CLI añaden en su `vitest.config.ts` el reporter `junit` a los de Vitest por defecto (`configDefaults.reporters`), con `outputFile: { junit: "coverage/junit.xml" }`. Así conservan el reporter de siempre en una terminal, el breve con un agente y las anotaciones en GitHub Actions. La ruta es relativa a la carpeta del paquete, y `.gitignore` ya ignora `coverage/`.
  - impacto: alto
- A2: El reporter `junit` abre su archivo después de que la cobertura limpie `coverage/` al empezar, así que el informe y la cobertura conviven en la misma carpeta.
- A3: Un test de `packages/cli/test` importa el `vitest.config.ts` de cada uno de los tres paquetes y comprueba sus `reporters` y su `outputFile`. Lee archivos de core y exporters, que ya están en los `paths` de la unidad cli.
- A4: Cambiar esas configuraciones cambia las huellas de las unidades core, exporters y cli, que en la próxima verificación completa corren una vez de nuevo.

## Criterios de aceptación

- AC1: CUANDO se ejecutan los tests de core, exporters o la CLI ENTONCES cada uno deja su informe JUnit en `coverage/junit.xml` de su paquete.

## Diseño

- `packages/{core,exporters,cli}/vitest.config.ts`: `test.reporters: [...configDefaults.reporters, "junit"]` y `test.outputFile: { junit: "coverage/junit.xml" }`.
- `packages/cli/test/repo-junit.test.ts` (nuevo), como `repo-units.test.ts`: importa el `vitest.config.ts` de cada paquete y comprueba que sus reporters son los de Vitest por defecto más `junit`, y que este escribe en `coverage/junit.xml`.

## Archivos

- modificar packages/core/vitest.config.ts — el reporter junit en coverage/junit.xml
- modificar packages/exporters/vitest.config.ts — el reporter junit en coverage/junit.xml
- modificar packages/cli/vitest.config.ts — el reporter junit en coverage/junit.xml
- crear packages/cli/test/repo-junit.test.ts — vigila que los tres paquetes dejan su informe: AC1

## Tareas

- [ ] T1: core, exporters y la CLI dejan su informe JUnit en coverage/junit.xml
  - files: packages/core/vitest.config.ts, packages/exporters/vitest.config.ts, packages/cli/vitest.config.ts, packages/cli/test/repo-junit.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/repo-junit.test.ts && pnpm --filter @baquia-dev/specty-exporters test && test -s packages/exporters/coverage/junit.xml && pnpm --filter @baquia-dev/specty typecheck && pnpm lint && pnpm knip
  - type: build
