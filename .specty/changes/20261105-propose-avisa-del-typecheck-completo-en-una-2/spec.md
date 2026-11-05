---
kind: standard
epic: 20261105-pendientes-de-las-unidades
slice: C4
---

# propose avisa del typecheck completo en una tarea que no es la última

## Objetivo

Con `policy.tests: contract`, los tests de todas las tareas se escriben y se aprueban antes que el código. Si una tarea de código que no es la última ejecuta en su `verify` la comprobación de tipos del proyecto, esa comprobación compila también los tests de las tareas siguientes, que importan lo que aún no existe, y la tarea no se completa: pasó en el corte C5 de la épica de unidades (P129). Con este cambio, `propose` avisa de esa tarea y sugiere ejecutar en ella solo sus tests.

## Fuera de alcance

- Bloquear `propose`: es un aviso.
- Reconocer la comprobación de tipos de un solo paquete, como `pnpm --filter <paquete> typecheck`: depende de cada herramienta, y Specty solo conoce la del proyecto.
- Mirar `verify.quick`: va delante de la verificación de todas las tareas, y la spec no puede quitarlo.
- Cambiar el aviso de la última tarea de código (`task-no-typecheck`).

## Supuestos

- A1: La comprobación de tipos que el aviso reconoce es la misma que ya usa el de la última tarea de código: la del proyecto, la que ejecuta `specty check` (`checks.commands.typecheck` o la que detecta del stack), o `verify.full`. Specty no sabe qué paquete compila cada comando, y esa comprobación abarca el proyecto entero, así que basta con que una tarea de código posterior liste un test, esté en el paquete que esté.
  - impacto: alto
- A2: Cuenta la verificación de la tarea como la escribe la spec: su `verify` o, sin ella, `verify.default`. Las tareas posteriores que cuentan son las de código (`feat`, `fix`, `refactor` o `perf`) que listan un test en `files` y no están hechas. Los tests de una tarea `docs` o `chore` posterior a la última de código no cuentan: van después de la última de código, que ya debe comprobar los tipos.
- A3: Solo avisa cuando el cambio tiene fase de tests (ADR 0014: un cambio `standard` con una tarea `feat` pendiente, o uno con tareas `fix` pendientes y sin `feat`) y no está en el cierre, porque sin esa fase cada test se escribe con su tarea. No avisa de una tarea ya hecha.
- A4: Los textos nuevos son mensajes de diagnóstico, junto a los demás en `packages/core/src/spec/messages.es.ts` y `messages.en.ts`, como el de `task-no-typecheck`.

## Criterios de aceptación

- AC1: CUANDO, con `policy.tests: contract`, una tarea de código que no es la última ejecuta en su verificación la comprobación de tipos del proyecto o `verify.full`, y una tarea de código posterior sin hacer lista un test ENTONCES `propose` avisa en esa tarea, con el comando y las tareas posteriores, y sugiere ejecutar en su `verify` solo sus tests.
- AC2: CUANDO esa tarea no ejecuta la comprobación de tipos ni `verify.full`, ya está hecha, o ninguna tarea de código posterior sin hacer lista un test ENTONCES no avisa de ella.
- AC3: CUANDO no hay `contract`, ni comprobación de tipos del proyecto, ni fase de tests, o el cambio está en el cierre ENTONCES no avisa.
- AC4: CUANDO sale el aviso ENTONCES no impide proponer, y sale en español y en inglés.

## Diseño

- `validate/quality.ts`: `checkTypecheck` da también el aviso nuevo, `task-early-typecheck`, en las tareas de código anteriores a la última. Las dos comparten cómo se reconoce la comprobación de tipos en una verificación, y la regla de los tipos bajo `contract` sigue en un solo sitio, sin tocar `validate/index.ts`.
- `spec/diagnostics.ts`: el código nuevo, entre los avisos. `spec/messages.es.ts` y `messages.en.ts`: su texto, con `id`, `value` (el comando) y `ref` (las tareas posteriores con tests), parámetros que ya usan otros mensajes y que el test del catálogo ya rellena.
- Docs: formats.md §2, en los avisos.

## Archivos

- modificar packages/core/src/validate/quality.ts — el aviso de la comprobación de tipos en una tarea que no es la última
- modificar packages/core/src/spec/diagnostics.ts — el código `task-early-typecheck`, entre los avisos
- modificar packages/core/src/spec/messages.es.ts — su texto en español
- modificar packages/core/src/spec/messages.en.ts — su texto en inglés
- modificar packages/core/test/validate/quality.test.ts — los tests del aviso
- modificar docs/formats.md — el aviso en §2

## Tareas

- [x] T1: El aviso de la comprobación de tipos en una tarea que no es la última
  - files: packages/core/src/validate/quality.ts, packages/core/src/spec/diagnostics.ts, packages/core/src/spec/messages.es.ts, packages/core/src/spec/messages.en.ts, packages/core/test/validate/quality.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/validate/quality.test.ts && pnpm typecheck && pnpm lint && pnpm sources
- [x] T2: El aviso en formats.md
  - files: docs/formats.md
  - ac: AC1
  - verify: pnpm lint
  - type: docs
