---
kind: standard
epic: 20261105-temporales-se-borran
slice: C1
---

# Los tests de la CLI, core y exporters borran sus temporales al terminar

## Objetivo

Los tests de la CLI, core y exporters crean sus temporales en una carpeta propia de cada ejecución (`specty-tests-<pid>-…`), que se borra al terminar, pasen o fallen, y cada ejecución borra al empezar las de las que murieron sin limpiar. Hoy cada pasada de la suite de la CLI deja más de mil carpetas en la carpeta temporal del sistema. Es el corte C1 de la épica 20261105-temporales-se-borran: en C2, vscode, la UI y evals usan el mismo ayudante.

## Fuera de alcance

- Los tests de vscode, la UI y evals (corte C2), y `packages/cli/test/global-setup.ts`, que evals reutiliza.
- Borrar lo que ya hay en la carpeta temporal del sistema: lo decide y lo hace la persona.
- Cambiar los tests que ya existen: crean sus temporales con `tmpdir()`, que ya apunta a la carpeta de la ejecución.
- La caché del E2E de OpenCode (`specty-e2e-opencode-cache` en `opencode-e2e.test.ts`), que ese test comparte entre ejecuciones a propósito: pasa a estar dentro de la carpeta de cada ejecución, así que con OpenCode instalado se descarga en cada pasada. Sacarla queda como pendiente.

## Supuestos

- A1: El ayudante va en `packages/core/vitest-temp-dir.ts`, junto a `vitest.config.ts` y fuera de `src/` y `test/`: es código de Node para Vitest, ni parte del core puro ni un test. Todas las unidades de `verify.units` que ejecutan tests (core, exporters, vscode, ui y cli) incluyen `packages/core/**`, así que un cambio del ayudante las repite sin tocar sus `paths`; en `scripts/` solo lo verían estático y cli. La CLI y exporters lo nombran con una ruta relativa en su `globalSetup`, como evals nombra `../packages/cli/test/global-setup.ts`.
  - impacto: alto
- A2: Vitest pasa a sus workers el `process.env` del proceso principal tal como queda tras el `globalSetup`, y los procesos que lanzan los tests lo heredan, así que basta con poner ahí `TMPDIR`, y también `TMP` y `TEMP`, que son las que lee `os.tmpdir()` en Windows. Comprobado con Vitest 5.0.5 en una ejecución de prueba.
  - impacto: alto
- A3: Una carpeta `specty-tests-<pid>-…` es de una ejecución que murió cuando `process.kill(pid, 0)` dice que el proceso no existe; con `EPERM` el proceso existe, de otro usuario, y la carpeta se deja. Un pid que ya usa otro proceso deja la carpeta hasta una ejecución posterior, así que nunca se borra la de una ejecución viva.
- A4: Si al terminar no se puede borrar la carpeta, por ejemplo porque un proceso que lanzó un test sigue escribiendo en ella, el teardown no hace fallar la ejecución: la borra la siguiente, porque su proceso ya no existirá.

## Criterios de aceptación

- AC1: CUANDO se ejecutan los tests de la CLI, de core o de exporters ENTONCES lo que crean en la carpeta temporal, también desde los procesos que lanzan, queda dentro de una carpeta de esa ejecución, que no existe al terminar, también si algún test falla.
- AC2: CUANDO al empezar una ejecución de tests hay carpetas de ejecuciones anteriores cuyo proceso ya no existe ENTONCES las borra, y no toca las de una ejecución que sigue en marcha ni las demás carpetas de la carpeta temporal.

## Diseño

- `packages/core/vitest-temp-dir.ts` exporta por defecto el `globalSetup`: toma la carpeta temporal del sistema con `tmpdir()`, borra en ella las `specty-tests-<pid>-…` cuyo proceso ya no existe, crea la de esta ejecución con `mkdtempSync` y le apunta `TMPDIR`, `TMP` y `TEMP`. Devuelve el teardown, que Vitest ejecuta también si fallan tests: restaura las tres variables y borra la carpeta.
- El `globalSetup` de `vitest.config.ts` en core, exporters y la CLI lo nombra; en la CLI, antes de `test/global-setup.ts`.
- `packages/core/test/vitest-temp-dir.test.ts` prueba el ayudante con una carpeta del sistema propia del test (pone `TMPDIR` a una carpeta suya antes de llamarlo) y lanza una ejecución anidada de Vitest con un test que escribe en la carpeta temporal y falla. Los `test/temp-dir.test.ts` de exporters y la CLI comprueban que su ejecución usa una carpeta `specty-tests-…`, en la CLI también desde un proceso hijo.
- `docs/ARCHITECTURE.md`, en Pruebas: dónde van los temporales de los tests.

## Archivos

- crear packages/core/vitest-temp-dir.ts — el `globalSetup` que crea, apunta y borra la carpeta de cada ejecución y borra las de las ejecuciones que murieron
- modificar packages/core/vitest.config.ts — usa el ayudante en `globalSetup`
- crear packages/core/test/vitest-temp-dir.test.ts — tests del ayudante (AC1, AC2)
- modificar docs/ARCHITECTURE.md — dónde van los temporales de los tests
- modificar packages/exporters/vitest.config.ts — usa el ayudante en `globalSetup`
- crear packages/exporters/test/temp-dir.test.ts — sus tests usan la carpeta de la ejecución (AC1)
- modificar packages/cli/vitest.config.ts — usa el ayudante en `globalSetup`
- crear packages/cli/test/temp-dir.test.ts — sus tests y los procesos que lanzan usan la carpeta de la ejecución (AC1)

## Tareas

- [x] T1: Los tests de core crean sus temporales en una carpeta de la ejecución que se borra al terminar
  - files: packages/core/vitest-temp-dir.ts, packages/core/vitest.config.ts, packages/core/test/vitest-temp-dir.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/vitest-temp-dir.test.ts && pnpm lint && pnpm --filter @baquia-dev/specty-core typecheck && pnpm knip
- [x] T2: Los tests de exporters usan la carpeta de la ejecución
  - files: packages/exporters/vitest.config.ts, packages/exporters/test/temp-dir.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-exporters exec vitest run test/temp-dir.test.ts && pnpm lint && pnpm --filter @baquia-dev/specty-exporters typecheck && pnpm knip
- [x] T3: Los tests de la CLI y los procesos que lanzan usan la carpeta de la ejecución
  - files: packages/cli/vitest.config.ts, packages/cli/test/temp-dir.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/temp-dir.test.ts && pnpm lint && pnpm typecheck && pnpm knip

## Riesgos

- R1: Las rutas de los temporales crecen unos 27 caracteres (`specty-tests-<pid>-XXXXXX/`), y un socket Unix en la carpeta temporal podría pasar del límite de 104 de macOS — hoy ni los tests ni la CLI crean sockets ahí; si alguno falla por eso, se verá en `pnpm check` de este cambio.
- R2: Un test que compara rutas con la carpeta temporal del sistema dejaría de casar — todos usan `tmpdir()` en el momento, y `pnpm check` de este cambio ejecuta la suite entera con el ayudante.

## Cierre

### Resumen

`packages/core/vitest-temp-dir.ts` es el `globalSetup` de Vitest que comparten los paquetes: borra en la carpeta temporal del sistema las `specty-tests-<pid>-…` cuyo proceso ya no existe, crea la de la ejecución, le apunta `TMPDIR`, `TMP` y `TEMP`, y su teardown restaura las tres variables y la borra, también si fallan tests. Lo nombran el `vitest.config.ts` de core, exporters y la CLI (en la CLI, antes de `test/global-setup.ts`), y `docs/ARCHITECTURE.md` lo cuenta en Pruebas. Los tests nuevos comprueban que los tests y los procesos que lanzan usan la carpeta de la ejecución (core, exporters y la CLI), que el teardown la borra, que una ejecución anidada de Vitest con un test que falla no deja la suya, y que solo se borran las carpetas de procesos que ya no existen. `specty verify --fresh` pasó todas las unidades (estático, core, exporters, vscode, ui y cli) y, al terminar, la carpeta temporal del sistema no tenía ninguna `specty-tests-…`.

### Desviaciones

- Ninguna.

### Decisiones

- El ayudante va en `packages/core/`, junto a `vitest.config.ts` y fuera de `src/` y `test/`: todas las unidades de `verify.units` que ejecutan tests miran `packages/core/**`, así que no hace falta ampliar ningún `paths`; en `scripts/` solo lo verían estático y cli.
- Si el teardown no puede borrar la carpeta, no hace fallar la ejecución: la borra la siguiente, cuando su proceso ya no existe.
- `packages/cli/test/global-setup.ts`, que evals reutiliza, no cambia: evals y el resto de paquetes son del corte C2.

### Pendientes

- P182: la caché del E2E de OpenCode (`specty-e2e-opencode-cache`) queda dentro de la carpeta de cada ejecución, así que con OpenCode instalado el proveedor se descarga en cada pasada.
