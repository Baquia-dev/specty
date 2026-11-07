---
kind: standard
epic: 20261107-flujo-configurable-en-la-ui
slice: C6
---

# El tamaño y el esfuerzo pasan a ser ajustes

## Objetivo

Hoy están fijos en el código del core los pesos con los que Specty puntúa el tamaño de un cambio, las tareas que no pesan, el umbral de archivo muy importado, la fracción desde la que avisa de que un cambio está cerca de partirse y la tabla de esfuerzo recomendado por tamaño, con la regla del esfuerzo de una tarea. Con este cambio son claves opcionales de `.specty/config.yaml`, `sizing` y `effort`, con los valores de hoy por defecto, y `propose`, `approve` y la tarjeta de cada tarea las usan. La página «Configuración» las muestra en sus secciones con la marca «Nuevo». Es el corte C6 de la épica `20261107-flujo-configurable-en-la-ui`: cubre sus AC20, AC25 y AC26 para estos parámetros.

## Fuera de alcance

- Que la CLI mida cuántos archivos importan cada archivo tocado o qué módulos no tienen tests: sin esos datos, `sizing.highFanIn` y los pesos `fanIn` y `noTests` no suman, como hoy.
- Las señales del tamaño, los umbrales de `size` y los límites de `split`, que ya son ajustes, y que el modelo pueda bajar el tamaño o el esfuerzo, que sigue sin poder.
- El esfuerzo de la cabecera de un cambio en la UI, oculto hoy (`SHOW_EFFORT_HINT`), que sigue con la tabla por defecto.
- Los nombres del esfuerzo en cada herramienta (`EFFORT_NAMES` de `core/src/agents.ts`).
- Guardar ajustes desde la UI (C2), las piezas de la vista Flujo (C3) y los perfiles (C4).

## Supuestos

- A1: Las claves nuevas son dos bloques de primer nivel en un módulo propio, `schema/sizing.ts`. Exporta su forma para que `config.ts` la reúna con un spread (`...SIZING_SHAPE`), sus valores por defecto y su `resolve`. `sizing` reúne `weights` (`create` 1, `modify` 1, `delete` 2, `rename` 2, `module` 2, `sensitive` 3, `dependencies` 2, `task` 1, `fanIn` 1 y `noTests` 2), `tasksWithoutWeight` (3), `highFanIn` (10) y `nearRatio` (0,8). No van dentro de `size` ni de `split` porque cada uno es un solo ajuste agrupado en el catálogo de C1, y una clave dentro de ellos no se vería como ajuste propio con la marca «Nuevo».
  - impacto: alto
- A2: `effort` pasa a ser la tabla de esfuerzo (A8 de la épica): `S`, `M`, `L` y `XL`, cada uno con `plan` e `implement` (`low`, `medium`, `high` o `max`, con los de hoy por defecto), y `task`, con `lowMaxFiles` (1) y `highMinFiles` (4). Una tarea con una ruta sensible o con `highMinFiles` archivos o más es `high`; con `lowMaxFiles` o menos, `low`; si no, `medium`, como hoy. La regla de la ruta sensible sigue fija. El `effort` de hoy, un mapa libre «por herramienta» que nada lee ni escribe `init`, deja de aceptarse: un `config.yaml` que lo tenga con otra forma da un error con su clave.
  - impacto: alto
- A3: Los límites del schema son estos. Los pesos y `tasksWithoutWeight` son enteros de 0 en adelante, y 0 apaga una señal. `highFanIn` es un entero positivo. `nearRatio` es mayor que 0 y como mucho 1. `lowMaxFiles` es un entero de 0 en adelante, menor que `highMinFiles`, que es positivo. Una clave que no existe dentro de `sizing` o de `effort` es un error, como en el resto del archivo.
  - impacto: medio
- A4: La CLI no mide hoy el fan-in ni los módulos sin tests (`flow/analysis.ts` solo pasa los globs y los generados). Por eso `sizing.highFanIn` lleva también la marca «Próximamente», y la documentación dice que los pesos `fanIn` y `noTests` solo suman cuando se conocen esas señales.
  - impacto: medio
- A5: En el catálogo, «Tamaño y cortes» gana `sizing.weights` (un grupo), `sizing.tasksWithoutWeight`, `sizing.highFanIn` y `sizing.nearRatio`. La sección `effort` pasa a llamarse «Esfuerzo recomendado», con cinco ajustes agrupados: `effort.S`, `effort.M`, `effort.L`, `effort.XL` y `effort.task`. Todos llevan la marca `new`, y el esfuerzo deja de llevar `soon`.
  - impacto: medio
- A6: Los textos de «Tamaño y cortes» y de «Esfuerzo recomendado», los de hoy y los nuevos, pasan a un módulo propio, `cards/settings-size.ts`, que `cards/settings.ts` reúne con un spread, como los de «Interno». En main, `cards/settings.ts` ya pasa de 300 líneas de código.
  - impacto: bajo
- A7: `recommendEffort` recibe la tabla como tercer argumento, opcional y con la de por defecto, y la CLI le pasa `session.config.effort` en `propose` y en `approve`. `recommendTaskEffort` ya recibe la configuración de la sesión, y la UI sigue llamándolo sin tabla.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO `.specty/config.yaml` no tiene `sizing` ni `effort` ENTONCES el tamaño de un cambio, el aviso de que está cerca de partirse y el esfuerzo recomendado, del cambio y de cada tarea, salen igual que hoy.
- AC2: CUANDO `config.yaml` tiene `sizing.weights`, `sizing.tasksWithoutWeight` o `sizing.highFanIn` ENTONCES la puntuación del tamaño suma cada señal con su peso, deja sin peso esas tareas y cuenta como muy importado un archivo desde ese umbral. Cada clave que falta tiene su valor de hoy, y el modelo sigue sin poder bajar el tamaño con `estimate`.
- AC3: CUANDO `config.yaml` tiene `sizing.nearRatio` ENTONCES `propose` avisa de que el cambio está cerca de partirse cuando sus tareas o sus archivos de código llegan a esa fracción de `split.maxTasks` o de `split.maxFiles` sin pasarlos.
- AC4: CUANDO `config.yaml` tiene en `effort` el esfuerzo de un tamaño ENTONCES `propose` y `approve` recomiendan ese esfuerzo para revisar e implementar un cambio de ese tamaño. Con `effort.task`, la tarjeta de cada tarea sugiere el suyo con esos límites de archivos. El `effort` del modelo puede subirlos, nunca bajarlos.
- AC5: CUANDO una clave de `sizing` o de `effort` no es válida (un peso negativo o con decimales, un `nearRatio` que no es mayor que 0 y como mucho 1, un esfuerzo que no es `low`, `medium`, `high` ni `max`, un `lowMaxFiles` que no es menor que `highMinFiles`, o una clave que no existe) ENTONCES el validador del core da un error con su clave, y Specty no usa el archivo.
- AC6: CUANDO la persona abre «Configuración» ENTONCES ve en «Tamaño y cortes» los pesos del tamaño, las tareas que no pesan, el archivo muy importado y el aviso de cerca de partir, y en «Esfuerzo recomendado» el esfuerzo de cada tamaño y el de una tarea. Cada uno lleva la marca «Nuevo», su clave y su valor. El archivo muy importado lleva también «Próximamente», y el esfuerzo ya no.
- AC7: CUANDO la UI está en inglés ENTONCES la sección «Esfuerzo recomendado» y los nombres y descripciones de los ajustes nuevos salen en inglés, y cada uno tiene su nombre y su descripción en español y en inglés.
- AC8: CUANDO se lee `docs/formats.md` §6 ENTONCES documenta `sizing` y `effort`, con sus claves, sus valores por defecto y sus límites, y que el `effort` por herramienta deja de existir. `docs/ARCHITECTURE.md` §11 dice que los pesos y la tabla de esfuerzo se configuran, y `docs/ui.md` nombra la sección «Esfuerzo recomendado».
  - test: manual

## Diseño

- Core, `schema/sizing.ts`: `SizeWeights`, `SizingConfig` (`weights`, `tasksWithoutWeight`, `highFanIn`, `nearRatio`), `EffortConfig` (`S`, `M`, `L` y `XL` con `plan` e `implement`, y `task` con `lowMaxFiles` y `highMinFiles`), `DEFAULT_SIZING`, `DEFAULT_EFFORT`, `SIZING_SHAPE` (los `strictObject` opcionales de `sizing` y `effort`, con `int`, `min`, `gt`, `max` y la regla de `lowMaxFiles` menor que `highMinFiles`) y `resolveSizing(input)`, que da `{ sizing, effort }`. `config.ts` quita el `effort` de hoy (`z.record`), añade `...SIZING_SHAPE` al schema, `sizing` y `effort` a `ResolvedConfig` y a `DEFAULT_CONFIG`, y `...resolveSizing(input)` a `withDefaults`.
- Core, `sizing/size.ts`: `HIGH_FAN_IN` y `TASKS_WITHOUT_WEIGHT` dejan paso a `config.sizing`, y la puntuación multiplica cada señal por su peso de `config.sizing.weights`. Core, `validate/limits.ts`: `NEAR_RATIO` deja paso a `config.sizing.nearRatio`. Core, `sizing/effort.ts`: `BY_LEVEL` deja paso a la tabla (`recommendEffort(level, spec?, effort = DEFAULT_EFFORT)`), y `recommendTaskEffort` lee `config.effort.task`. El modelo solo sube, como hoy (`higher`).
- Core, `settings/catalog.ts`: los cuatro ajustes de `sizing` tras `split`, y los cinco de `effort` en lugar del de hoy, con `new` (y `soon` en `sizing.highFanIn`). Core, `cards/settings-size.ts`: los textos de `size`, `lanes.quick.maxFiles`, `split`, `sizing.*` y `effort.*` en los dos idiomas, que `cards/settings.ts` reúne en `TEXTS`. La sección `effort` se llama «Esfuerzo recomendado» / «Recommended effort».
- CLI, `commands/propose.ts` y `commands/approve.ts`: `recommendEffort(analysis.size.level, analysis.spec, session.config.effort)`. La tarjeta de la tarea ya pasa `session.config` a `recommendTaskEffort` (`flow/task-views.ts`).
- Tests: `core/test/sizing/configured.test.ts` (AC1 a AC5), `cli/test/effort-config.test.ts` (AC2, AC4: `propose`, la nota de `approve` y la tarjeta de la tarea con un `config.yaml` con pesos y tabla), `core/test/settings/catalog.test.ts` (AC6, AC7) y `ui/src/settings/settings-page.test.ts` (AC6, AC7).

## Archivos

- crear packages/core/src/schema/sizing.ts — las claves `sizing` y `effort`, con sus límites y los valores de hoy
- modificar packages/core/src/schema/config.ts — reúne esas claves en el schema, en `ResolvedConfig` y en `DEFAULT_CONFIG`, en lugar del `effort` libre
- modificar packages/core/src/sizing/size.ts — la puntuación con los pesos, las tareas sin peso y el umbral de fan-in de la configuración
- modificar packages/core/src/sizing/effort.ts — la tabla de esfuerzo y la regla de la tarea de la configuración
- modificar packages/core/src/validate/limits.ts — la fracción de cerca de partir de la configuración
- modificar packages/core/src/settings/catalog.ts — los ajustes nuevos del tamaño y del esfuerzo, con la marca `new`
- modificar packages/core/src/cards/settings.ts — reúne los textos del tamaño y del esfuerzo y renombra la sección del esfuerzo
- crear packages/core/src/cards/settings-size.ts — los nombres y descripciones de los ajustes del tamaño y del esfuerzo, en español y en inglés
- modificar packages/cli/src/commands/propose.ts — recomienda el esfuerzo con la tabla de la configuración
- modificar packages/cli/src/commands/approve.ts — recomienda el esfuerzo con la tabla de la configuración
- crear packages/core/test/sizing/configured.test.ts — el tamaño, el aviso y el esfuerzo con y sin las claves, y sus errores
- modificar packages/core/test/settings/catalog.test.ts — los ajustes nuevos, sus marcas y sus textos
- crear packages/cli/test/effort-config.test.ts — `propose`, `approve` y la tarjeta de la tarea con un `config.yaml` con pesos y tabla
- modificar packages/ui/src/settings/settings-page.test.ts — la sección renombrada y los ajustes nuevos con sus marcas en los dos idiomas
- modificar docs/formats.md — §6: `sizing` y `effort`
- modificar docs/ARCHITECTURE.md — §11: los pesos y la tabla de esfuerzo se configuran
- modificar docs/ui.md — la sección «Esfuerzo recomendado» de «Configuración»

## Tareas

- [x] T1: Las claves `sizing` y `effort` del schema, y el tamaño, el aviso de cerca de partir y el esfuerzo que las usan
  - files: packages/core/src/schema/sizing.ts, packages/core/src/schema/config.ts, packages/core/src/sizing/size.ts, packages/core/src/sizing/effort.ts, packages/core/src/validate/limits.ts, packages/core/test/sizing/configured.test.ts
  - ac: AC1, AC2, AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/sizing/configured.test.ts && pnpm lint && pnpm knip
- [x] T2: `propose`, `approve` y la tarjeta de la tarea recomiendan el esfuerzo de la configuración
  - files: packages/cli/src/commands/propose.ts, packages/cli/src/commands/approve.ts, packages/cli/test/effort-config.test.ts
  - ac: AC2, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/effort-config.test.ts && pnpm lint
- [x] T3: Los ajustes del tamaño y del esfuerzo en el catálogo, con sus textos
  - files: packages/core/src/settings/catalog.ts, packages/core/src/cards/settings.ts, packages/core/src/cards/settings-size.ts, packages/core/test/settings/catalog.test.ts
  - ac: AC6, AC7
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/settings/catalog.test.ts && pnpm lint && pnpm knip
- [x] T4: La página «Configuración» muestra los ajustes nuevos, y la documentación los describe
  - files: packages/ui/src/settings/settings-page.test.ts, docs/formats.md, docs/ARCHITECTURE.md, docs/ui.md
  - ac: AC6, AC7, AC8
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/settings/settings-page.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: Main ya tiene C8, y C4, C5, C7 y C9 tocan también `config.ts`, el catálogo, sus textos, sus tests y `docs/formats.md` §6 — las claves van en su módulo y en su bloque del catálogo, la forma se reúne con un spread, y al incorporar main `specty integrate` conserva lo de los dos.
- R2: Unos pesos a 0 o una tabla de esfuerzo baja dejan pasar cambios grandes como pequeños — lo decide la persona en su `config.yaml`, con su commit; el modelo sigue sin poder bajar el tamaño ni el esfuerzo, y `split` sigue partiendo por tareas, archivos y módulos sea cual sea la puntuación.
- R3: Un `config.yaml` con un `effort` del formato anterior deja de validar — nada lo escribía ni lo leía, el error dice su clave y `docs/formats.md` da la forma nueva.

## Cierre

### Resumen

- Core: `schema/sizing.ts` define `sizing` (`weights`, `tasksWithoutWeight`, `highFanIn`, `nearRatio`) y `effort` (`S`, `M`, `L` y `XL` con `plan` e `implement`, y `task` con `lowMaxFiles` y `highMinFiles`), con sus límites y los valores de hoy; `config.ts` los reúne con `...SIZING_SHAPE` en lugar del `effort` libre, y `ResolvedConfig` siempre trae los valores resueltos.
- El tamaño puntúa cada señal por su peso (`scoreOf` en `sizing/size.ts`), el aviso de cerca de partir usa `sizing.nearRatio` y el esfuerzo lee la tabla y la regla de la tarea de la configuración; el modelo sigue solo pudiendo subir.
- CLI: `propose` y `approve` pasan `session.config.effort` a `recommendEffort`; la tarjeta de la tarea ya pasaba la configuración.
- Catálogo: los cuatro ajustes de `sizing` tras `split` y los cinco de `effort` (la sección se llama «Esfuerzo recomendado»), todos con «Nuevo» y `sizing.highFanIn` también con «Próximamente»; sus textos, con los de `size`, `lanes.quick.maxFiles` y `split`, pasan a `cards/settings-size.ts`.
- Documentación: formats.md §6, ARCHITECTURE §11 y ui.md.

### Desviaciones

- La página de la UI no necesitó cambios de código: muestra los ajustes nuevos desde el catálogo, y T4 solo llevó su test y la documentación.

### Decisiones

- El error de `lowMaxFiles` no menor que `highMinFiles` sale en `effort.task.lowMaxFiles`, y compara con el valor por defecto de la clave que falta.
- `weightsOf` toma cada peso con un acceso por nombre para no pasar del límite de complejidad, que cuenta cada `??`.

### Pendientes

- AC8 se comprueba a mano: formats.md §6, ARCHITECTURE §11 y ui.md.
- Al incorporar main (C8), chocan `schema/config.ts`, `catalog.test.ts` (las marcas `new` y las secciones), `settings-page.test.ts`, `docs/ui.md` y `docs/formats.md` §6: hay que conservar lo de los dos.
- La CLI no mide el fan-in ni los módulos sin tests, así que `sizing.highFanIn` y los pesos `fanIn` y `noTests` no tienen efecto hasta que lo haga.
- El esfuerzo de la cabecera de un cambio en la UI, oculto hoy (`SHOW_EFFORT_HINT`), sigue con la tabla por defecto.
