---
kind: standard
epic: 20261105-temporales-se-borran
slice: C2
---

# Los tests de vscode, la UI y evals borran sus temporales al terminar

## Objetivo

Los tests de la extensión de VS Code, de la UI y de evals, y la suite de cumplimiento (`pnpm evals`), crean sus temporales en una carpeta propia de cada ejecución (`specty-tests-<pid>-…`) que se borra al terminar, pasen o fallen, con el mismo ayudante que ya usan core, exporters y la CLI (corte C1). El informe de la suite sigue en `specty-evals/` de la carpeta temporal del sistema, fuera de la carpeta que se borra. Es el corte C2 de la épica 20261105-temporales-se-borran.

## Fuera de alcance

- Cambiar el ayudante `packages/core/vitest-temp-dir.ts` o `packages/cli/test/global-setup.ts`, que evals reutiliza.
- Cambiar los tests que ya existen: crean sus temporales con `tmpdir()`, que ya apunta a la carpeta de la ejecución.
- Borrar lo que ya hay en la carpeta temporal del sistema: lo decide y lo hace la persona.
- La caché del E2E de OpenCode (P182), de la CLI.

## Supuestos

- A1: El constructor de tests de Angular (`@angular/build:unit-test` 22.2.5, con `runnerConfig: true`) pasa el `test` de `vitest-base.config.ts` a su proyecto de Vitest, `globalSetup` incluido: solo quita `reporters`, `include`, `projects`, `watch` y el `reporter` de la cobertura, según su `plugins.js`. La ruta del `globalSetup` es relativa a `packages/ui`, la raíz que le da el constructor.
  - impacto: alto
- A2: Vitest evalúa `vitest.config.ts` antes de ejecutar el `globalSetup`, así que `tmpdir()` en la configuración de evals todavía da la carpeta temporal del sistema; se la pasa a la suite con `provide`, y la suite la lee con `inject`.
  - impacto: alto
- A3: La suite de cumplimiento también usa la carpeta de la ejecución: los repositorios desechables donde trabajaron los agentes se borran al terminar, y lo que queda de cada ejecución es el informe, que ya da por agente y escenario las violaciones y sus motivos.
  - impacto: alto
- A4: Los tests de la UI no crean hoy nada en la carpeta temporal: el ayudante va también en ella para que lo hagan los que la usen.

## Criterios de aceptación

- AC1: CUANDO se ejecutan los tests de la extensión de VS Code, de la UI o de evals ENTONCES lo que crean en la carpeta temporal, también desde los procesos que lanzan, queda dentro de una carpeta de esa ejecución, que no existe al terminar, también si algún test falla.
- AC2: CUANDO termina la suite de cumplimiento (`pnpm evals`) ENTONCES su informe queda en `specty-evals/` de la carpeta temporal del sistema, fuera de la carpeta de la ejecución que se borra.

## Diseño

- El `globalSetup` de `packages/vscode/vitest.config.ts` y de `packages/ui/vitest-base.config.ts` nombra `../core/vitest-temp-dir.ts`; el de `evals/vitest.config.ts`, `../packages/core/vitest-temp-dir.ts` antes de `../packages/cli/test/global-setup.ts`.
- `evals/vitest.config.ts` da a sus tests `provide: { reports: join(tmpdir(), "specty-evals") }`, con su tipo en `ProvidedContext`; `evals/run/compliance.eval.ts` escribe el informe en `inject("reports")` en lugar de `join(tmpdir(), "specty-evals")`.
- Un test por paquete, como los de exporters y la CLI en C1: `packages/vscode/test/temp-dir.test.ts` y `evals/test/temp-dir.test.ts` comprueban que la ejecución y un proceso hijo usan una carpeta `specty-tests-…`; `packages/ui/src/temp-dir.test.ts`, que la usa la ejecución; el de evals, además, que el informe va a `specty-evals/` de la carpeta que contiene la de la ejecución.
- `docs/ARCHITECTURE.md`: en Pruebas, que el ayudante lo nombran todos los paquetes con tests; en la suite de cumplimiento, que el informe queda fuera de la carpeta de la ejecución.

## Archivos

- modificar packages/vscode/vitest.config.ts — usa el ayudante en `globalSetup`
- crear packages/vscode/test/temp-dir.test.ts — sus tests y los procesos que lanzan usan la carpeta de la ejecución (AC1)
- modificar packages/ui/vitest-base.config.ts — usa el ayudante en `globalSetup`
- crear packages/ui/src/temp-dir.test.ts — sus tests usan la carpeta de la ejecución (AC1)
- modificar evals/vitest.config.ts — usa el ayudante en `globalSetup` y da a la suite la carpeta del informe
- modificar evals/run/compliance.eval.ts — escribe el informe en la carpeta que le da la configuración
- crear evals/test/temp-dir.test.ts — sus tests y los procesos que lanzan usan la carpeta de la ejecución, y el informe va fuera de ella (AC1, AC2)
- modificar docs/ARCHITECTURE.md — qué paquetes usan el ayudante y dónde queda el informe de la suite

## Tareas

- [x] T1: Los tests de la extensión de VS Code usan la carpeta de la ejecución
  - files: packages/vscode/vitest.config.ts, packages/vscode/test/temp-dir.test.ts
  - ac: AC1
  - verify: pnpm --filter specty-vscode exec vitest run test/temp-dir.test.ts && pnpm lint && pnpm --filter specty-vscode typecheck && pnpm knip
- [x] T2: Los tests de la UI usan la carpeta de la ejecución
  - files: packages/ui/vitest-base.config.ts, packages/ui/src/temp-dir.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/temp-dir.test.ts && pnpm lint && pnpm --filter @baquia-dev/specty-ui typecheck && pnpm knip
- [ ] T3: Los tests y la suite de evals usan la carpeta de la ejecución, y el informe queda fuera
  - files: evals/vitest.config.ts, evals/run/compliance.eval.ts, evals/test/temp-dir.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-evals exec vitest run test/temp-dir.test.ts && pnpm lint && pnpm typecheck && pnpm knip

## Riesgos

- R1: Si el constructor de Angular no ejecutara el `globalSetup` de `runnerConfig`, o lo ejecutara dos veces (en la raíz y en su proyecto) — el test de T2 lo detecta en el primer caso; en el segundo, la segunda carpeta queda dentro de la primera y las dos se borran.
- R2: `pnpm test:evals` no corre en `pnpm check` ni en `verify.units`, solo en el CI — la verificación de T3 ejecuta su test nuevo, y `pnpm test:evals` entero se ejecuta antes de cerrar.
