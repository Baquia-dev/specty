---
kind: standard
---

# Test primero y aviso de aserciones quitadas

## Objetivo

La tarjeta de cada tarea de código pide escribir primero el test y verlo fallar, y prohíbe cambiar un test que ya existía para que pase: si falla, el agente para y se lo explica al usuario. Además, `task done` detecta, de forma determinista, las aserciones que una tarea quita de tests que ya existían, y lo avisa al agente, lo anota en la auditoría y lo muestra al aceptar, para que la persona vea si un test se debilitó.

## Fuera de alcance

- Mostrar el aviso en la pestaña Aceptación de la UI: lo hará la sesión de la UI con el dato de la auditoría.
- Detectar tests desactivados (`.skip`, `xit`, `@Ignore`) o vaciados de otras formas.
- Bloquear `task done` o `accept` por quitar aserciones: es un aviso.
- Cambiar la política de tests por defecto ni responder la pregunta abierta 5 de ARCHITECTURE §19.

## Supuestos

- A1: Una aserción es una línea que llama a `expect(`, a `assert…(` o `assert…!` (también `assert x` de Python y `assert.`/`require.` de Go), a `XCTAssert…`, a `.should` o a `t.Error`/`t.Fatal`; las líneas de comentario no cuentan, así que comentar una aserción cuenta como quitarla.
  - impacto: alto
- A2: Un test pierde aserciones cuando, en el diff de la tarea contra su commit base, sus líneas quitadas que son aserciones superan a las añadidas; mover o reescribir una aserción no avisa, y un test borrado o renombrado avisa por las que pierde.
  - impacto: alto
- A3: Solo cuentan los tests que ya existían en el commit base de la tarea, reconocidos por el nombre o la carpeta como hoy (`isTestFile`); los tests nuevos no pueden perder nada.
- A4: Las reglas de la tarjeta dependen del tipo de la tarea: `feat` y `fix` piden test primero y no tocar un test que falla; `refactor` y `perf` solo lo segundo; los demás tipos, y la política de tests `off`, ninguna.
- A5: El aviso vive en `task.completed` de la auditoría (`removedAssertions`), y las tarjetas de aceptación lo leen de ahí; `state.json` no cambia.

## Criterios de aceptación

- AC1: CUANDO la tarea activa es `feat` o `fix` ENTONCES su tarjeta incluye un bloque TESTS con «primero el test, míralo fallar» y «si falla un test que ya existía, no lo cambies: para y explícaselo al usuario»; CUANDO es `refactor` o `perf` ENTONCES solo la segunda línea; CUANDO es de otro tipo o la política es `off` ENTONCES no hay bloque.
- AC2: CUANDO se analiza un diff de tests ENTONCES cada archivo con más aserciones quitadas que añadidas da su ruta y la diferencia, contando las aserciones comentadas como quitadas y las de un archivo borrado como perdidas, y uno que solo las mueve no da nada.
- AC3: CUANDO `task done` completa una tarea que quitó aserciones de un test que ya existía ENTONCES la salida lo avisa con el archivo y el número, y `task.completed` guarda `removedAssertions`; CUANDO no quitó ninguna ENTONCES ni la salida ni la auditoría cambian.
- AC4: CUANDO el cambio llega a aceptación con tareas que quitaron aserciones ENTONCES la tarjeta de aceptación del agente y la nota que ve la persona en `specty accept` lo dicen por tarea y archivo.
- AC5: CUANDO alguien lee ARCHITECTURE §7 y formats.md §4 ENTONCES encuentra las reglas de tests de la tarjeta y el dato `removedAssertions`.

## Diseño

- Core, `scope/assertions.ts`: `removedAssertions(diff)` lee un diff unificado de git y devuelve `{ path, removed }` por archivo; es puro, para que la UI pueda usarlo más adelante. `validate/quality.ts` exporta qué tipos son de código, que ya usa la política de tests.
- Core, tarjetas: `TaskView.testRules` (`first` o `keep`) y `TaskView.removedAssertions`; la tarjeta de la tarea muestra el bloque TESTS y la de aceptación un bloque de avisos, con un formateador que también usa `accept`.
- CLI: `flow/assertions.ts` pide a git el diff de los tests que ya existían (`git diff -U0 -M <base> -- <tests>`), y `task done` lo analiza tras verificar y antes del commit. `changeView` calcula `testRules` y, en aceptación, lee los avisos de la auditoría. `accept` añade los avisos a su nota.

## Archivos

- crear packages/core/src/scope/assertions.ts — aserciones quitadas en un diff
- crear packages/core/test/scope/assertions.test.ts — lenguajes, comentarios, movidas y borrados
- modificar packages/core/src/validate/quality.ts — exportar qué tareas son de código
- modificar packages/core/src/index.ts — exportar lo nuevo
- modificar packages/core/src/cards/view.ts — `testRules` y `removedAssertions` en `TaskView`
- modificar packages/core/src/cards/work.ts — el bloque TESTS y los avisos de aceptación
- crear packages/core/test/cards/tests.test.ts — las reglas y los avisos en las tarjetas
- crear packages/cli/src/flow/assertions.ts — el diff de los tests que ya existían
- modificar packages/cli/src/commands/task.ts — avisar y anotar en `task done`
- modificar packages/cli/src/flow/views.ts — las reglas por tarea y los avisos de la auditoría
- modificar packages/cli/src/commands/accept.ts — los avisos en la nota de la persona
- crear packages/cli/test/assertions.test.ts — de punta a punta
- modificar docs/ARCHITECTURE.md — §7: las reglas de tests de la tarjeta y el aviso
- modificar docs/formats.md — §4: `removedAssertions` en `task.completed`

## Tareas

- [x] T1: Aserciones quitadas en un diff
  - files: packages/core/src/scope/assertions.ts, packages/core/test/scope/assertions.test.ts, packages/core/src/index.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/scope
- [x] T2: Las reglas de tests y los avisos en las tarjetas
  - files: packages/core/src/validate/quality.ts, packages/core/src/cards/view.ts, packages/core/src/cards/work.ts, packages/core/test/cards/tests.test.ts, packages/core/src/index.ts
  - ac: AC1, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards test/validate
- [x] T3: task done avisa y accept lo muestra
  - files: packages/cli/src/flow/assertions.ts, packages/cli/src/commands/task.ts, packages/cli/src/flow/views.ts, packages/cli/src/commands/accept.ts, packages/cli/test/assertions.test.ts
  - ac: AC1, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/assertions.test.ts test/flow.test.ts
- [x] T4: Documentar test primero y el aviso
  - files: docs/ARCHITECTURE.md, docs/formats.md
  - ac: AC5
  - verify: pnpm check
  - type: docs

## Riesgos

- R1: El patrón de aserciones da falsos avisos (una línea que nombra `expect` sin serlo) o se le escapan frameworks. Mitigación: es un aviso, no un bloqueo, y el test de core fija qué cuenta en cada lenguaje.

## Cierre

### Resumen

La tarjeta de cada tarea trae un bloque TESTS según su tipo: en `feat` y `fix`, primero el test, visto fallar; en `feat`, `fix`, `refactor` y `perf`, un test que ya existía y falla no se cambia para que pase, y el agente para y se lo explica al usuario. Con `policy.tests: off`, o en otros tipos, no hay bloque. `task done` compara los tests que ya existían en el commit base de la tarea con el árbol de trabajo (`removedAssertions` de core sobre `git diff -U0 -M`), y si alguno pierde aserciones (las quitadas menos las añadidas, con las comentadas como quitadas) lo avisa en AVISOS, lo guarda en `task.completed` y lo muestran la tarjeta de aceptación y la nota de `specty accept`.

### Desviaciones

- Ninguna respecto al plan. `changeView` lee ahora la auditoría una sola vez, en cada fase, para los avisos de cada tarea, la petición del borrador y los comentarios pedidos; así la salida de `task done` usa el mismo formateador que la aceptación.

### Decisiones

- El aviso usa el diff del árbol de trabajo antes del commit de la tarea, con `--literal-pathspecs` y `core.quotePath=false`, para que las rutas con caracteres especiales no fallen.
- Mover o reescribir una aserción no avisa: se cuenta la diferencia entre quitadas y añadidas por archivo.

### Pendientes

- Mostrar el aviso en la pestaña Aceptación de la UI, con `task.completed.data.removedAssertions` de la auditoría.
- Detectar tests desactivados (`.skip`, `xit`, `@Ignore`, `t.Skip`), que debilitan un test sin quitar aserciones.
