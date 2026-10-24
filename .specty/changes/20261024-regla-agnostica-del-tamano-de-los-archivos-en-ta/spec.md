---
kind: standard
follows:
  - 20261024-la-regla-de-las-300-lineas-avisa-y-cuenta-solo-c
---

# Regla agnóstica del tamaño de los archivos en task done

## Objetivo

La regla de los archivos cortos pasa a ser de Specty, para cualquier proyecto y lenguaje, sin listas de extensiones ni nombres de frameworks. `task done` mide en líneas de código, sin líneas en blanco ni comentarios, los archivos que la tarea crea o modifica. Avisa cuando la tarea deja uno por encima de 300 (tests: 400) y lo hizo crecer, y pide proponer una división por responsabilidad, nunca partir por el número. Solo bloquea si la tarea lo lleva por encima de 500 (tests: 600). Los umbrales y las exclusiones los configura la persona en `lines`.

## Fuera de alcance

- Quitar la medida de tamaño de `pnpm sources` y actualizar AGENTS.md: irá en un cambio quick después de este.
- Medir archivos que la tarea no toca, o todo el repositorio.
- Reglas por lenguaje más allá de las excepciones de comentarios del diseño.

## Supuestos

- A1: Se miden los archivos gobernados que la tarea crea o modifica, salvo los generados (`scope.generated` o una marca `@generated`, `DO NOT EDIT`, `auto-generated` o `Code generated` en sus primeras líneas), los lockfiles, los binarios y los de `lines.exclude`, que por defecto lista carpetas comunes a cualquier ecosistema: fixtures, mocks, testdata, migraciones y textos traducidos.
  - impacto: alto
- A2: Una línea es de comentario si empieza por `//`, `#` o `-- `, o está dentro de un bloque `/* */`, `` o `--[[ ]]`. Son código las que solo lo parecen: las directivas pegadas a `#` de C, C++ y C# (`#include`, `#define`, `#if`, `#pragma`, `#region`…), los atributos de Rust (`#[…]`, `#![…]`), los selectores de CSS (`#id {`) y `--i`. El resto de comentarios (`;`, `%`, docstrings) cuentan como código: el error es avisar de más, nunca de menos.
  - impacto: alto
- A3: El aviso sale cuando el archivo queda por encima del umbral y la tarea lo hizo crecer; un archivo ya largo que la tarea no hace crecer no avisa.
- A4: El bloqueo sale solo si la tarea cruza el máximo: el archivo estaba en el máximo o por debajo, o es nuevo. Uno que ya lo pasaba y crece solo avisa. Con `fail: false` no se bloquea nunca. La configuración está protegida, así que el agente no puede subir los umbrales.
  - impacto: alto

## Criterios de aceptación

- AC1: CUANDO se cuentan las líneas de un archivo ENTONCES las líneas en blanco y las de comentario no cuentan, y las directivas de C, C++ y C#, los atributos de Rust, los selectores de CSS y `--i` sí.
- AC2: CUANDO `task done` completa una tarea que deja un archivo por encima de 300 líneas de código (tests: 400) y lo hizo crecer ENTONCES su salida lo avisa con la ruta y las líneas y pide proponer una división por responsabilidad sin partir por el número, `task.completed` guarda `longFiles`, y la tarjeta de aceptación y la nota de `specty accept` lo muestran.
- AC3: CUANDO la tarea lleva un archivo por encima de 500 líneas de código (tests: 600) ENTONCES `task done` no la completa y su SIGUIENTE pide dividirlo por responsabilidad o explicárselo al usuario, que puede cambiar `lines.fail`; un archivo que ya pasaba el máximo y crece solo avisa, y con `fail: false` nunca bloquea.
- AC4: CUANDO el archivo es ignorado, generado, un lockfile, binario o está en `lines.exclude` ENTONCES no se mide.
- AC5: CUANDO alguien lee ARCHITECTURE y formats.md ENTONCES encuentra la regla, la clave `lines` con sus valores por defecto y `longFiles`.

## Diseño

- Core, `sizing/lines.ts`: `codeLines(text)` y `longFiles(files, config)`, que recibe por archivo su texto antes y después y decide avisos y bloqueos; puro.
- Core, configuración: `lines: { warn, fail, tests: { warn, fail }, exclude }`; `fail` admite `false`. `scope/lockfiles.ts` añade `isLockfile`.
- Core, tarjetas: `cards/lines.ts` con las líneas de aviso y la tarjeta del bloqueo; `TaskView.longFiles`; la aceptación lo muestra en AVISOS.
- CLI: `flow/lines.ts` lee cada archivo de la tarea en el commit base (`git show`) y en disco; `task done` bloquea antes de la verificación o guarda los avisos en `task.completed`; `changeView` los lee de la auditoría; `accept` los añade a su nota.

## Archivos

- modificar packages/core/src/schema/config.ts — la clave `lines`
- crear packages/core/src/sizing/lines.ts — contar líneas de código y decidir avisos y bloqueos
- modificar packages/core/src/scope/lockfiles.ts — `isLockfile`
- crear packages/core/src/cards/lines.ts — los avisos y la tarjeta del bloqueo
- modificar packages/core/src/cards/view.ts — `TaskView.longFiles`
- modificar packages/core/src/cards/work.ts — los avisos en la aceptación
- modificar packages/core/src/index.ts — exportar lo nuevo
- crear packages/core/test/sizing/lines.test.ts — recuento, excepciones, avisos, bloqueos y exclusiones
- modificar packages/core/test/cards/tests.test.ts — los avisos en la tarjeta de aceptación
- crear packages/cli/src/flow/lines.ts — los textos antes y después de la tarea
- modificar packages/cli/src/commands/task.ts — avisar o bloquear en `task done`
- modificar packages/cli/src/flow/views.ts — los avisos de la auditoría
- modificar packages/cli/src/commands/accept.ts — los avisos en la nota de la persona
- crear packages/cli/test/lines.test.ts — de punta a punta
- modificar docs/ARCHITECTURE.md — la regla en `task done`
- modificar docs/formats.md — la clave `lines` y `longFiles`

## Tareas

- [x] T1: Contar líneas de código y decidir en core
  - files: packages/core/src/schema/config.ts, packages/core/src/sizing/lines.ts, packages/core/src/scope/lockfiles.ts, packages/core/src/cards/lines.ts, packages/core/src/cards/view.ts, packages/core/src/cards/work.ts, packages/core/src/index.ts, packages/core/test/sizing/lines.test.ts, packages/core/test/cards/tests.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/sizing test/cards test/schema test/scope
- [x] T2: task done avisa o bloquea
  - files: packages/cli/src/flow/lines.ts, packages/cli/src/commands/task.ts, packages/cli/src/flow/views.ts, packages/cli/src/commands/accept.ts, packages/cli/test/lines.test.ts
  - ac: AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/lines.test.ts test/assertions.test.ts test/risk.test.ts
- [x] T3: Documentar la regla
  - files: docs/ARCHITECTURE.md, docs/formats.md
  - ac: AC5
  - verify: pnpm check
  - type: docs
