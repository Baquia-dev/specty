---
kind: standard
epic: 20261107-flujo-configurable-en-la-ui
slice: C11
---

# El resto de esperas, bloqueos y retención pasan a ser ajustes internos

## Objetivo

Hoy cuántas veces reintenta Specty escribir en su memoria cuando otra sesión escribe a la vez, cuántas veces repite `specty new` la escritura que liga la rama a su cambio cuando otro proceso bloquea la configuración de git, y cuántos días guarda el registro de unidades que pasaron están fijos en el código de la CLI. Con este cambio son claves opcionales de `.specty/config.yaml` bajo `internal` (`internal.retries.memory`, `internal.retries.gitConfig` e `internal.retention.verifiedDays`), con mínimos y máximos en el schema y los valores de hoy por defecto, y la página «Configuración» las muestra en «Interno» con la marca «Nuevo». Es el corte C11 de la épica, estrechado (R4 de la épica): cubre sus AC22, AC25 y AC26 para estos parámetros.

## Fuera de alcance

- Las esperas que quedan del inventario de C8, que pasan a un corte nuevo de la épica: `POLL_MS` de `flow/full-verification.ts` y de `store/verify-slots.ts`, `STALE_MS` de `store/turn-queue.ts` y de `store/waits.ts`, y el `--interval` de 500 ms de `specty wait`.
- `INDEX_LIFE` de `store/leftovers.ts`, la vida de los índices temporales de git, que también pasa a un corte nuevo: además cambia la línea «de más de una hora» de la tarjeta de `prune` y su test en core.
- Cambiar las cuatro vidas del cumplimiento (A10 de la épica), que siguen fijas en 24 h y con candado.
- La salida, lo que se muestra y los límites del servidor, que son de C12.
- El código de la página «Configuración»: la sección «Interno», su pliegue y la marca «Nuevo» ya muestran cualquier ajuste del catálogo.

## Supuestos

- A1: El corte completo (nueve constantes en diez archivos de la CLI, cada uno con su test, más core y la tarjeta de `prune`) sale XL. Por eso este cambio se estrecha a los reintentos de la memoria y de la configuración de git y a la retención del registro de unidades, y deja las esperas y la vida de los índices temporales para un corte nuevo de la épica, que se ajusta para recogerlas.
  - impacto: alto
- A2: Las claves son `internal.retries.memory` (9 por defecto, entre 1 y 50), `internal.retries.gitConfig` (5, entre 1 y 10) e `internal.retention.verifiedDays` (30, entre 1 y 365). Los reintentos cuentan las veces más tras el primer intento, como `internal.retries.landing`, así que 9 son los 10 intentos de hoy. Su mínimo es 1 para que un choque suelto con otra sesión no haga fallar el comando, porque muchos comandos escriben en la memoria por su cuenta. Las esperas entre reintentos de la configuración de git doblan la anterior desde 50 ms, como hoy (50, 100, 200, 400 y 800 ms), y con 10 suman unos 51 s.
  - impacto: medio
- A3: Ninguna de las tres forma parte del cumplimiento. El registro de unidades se consulta por la huella de la unidad, no por su edad, así que guardarlo menos solo hace que una unidad vuelva a correr. Los reintentos solo cambian cuánta coincidencia con otros procesos se tolera antes de fallar.
  - impacto: alto
- A4: Las claves van en el módulo de C8, `schema/internal-waits.ts`: `memory` y `gitConfig` en su bloque `retries` y un bloque nuevo `retention`. Así `ResolvedConfig.internal` las tiene sin tocar `config.ts`, que ya reúne ese módulo bajo `internal`.
  - impacto: medio
- A5: Los textos de «Interno» (los de C8, los de C9 y los nuevos) pasan a su propio módulo, `cards/settings-internal.ts`, que `cards/settings.ts` reúne con los demás. `cards/settings.ts` tiene 406 líneas y pasaría de 440 con los nuevos, y su división ya está propuesta en la memoria (P273, P274 y P280). C12 añadirá allí los suyos.
  - impacto: bajo
- A6: Los días del registro llevan una unidad nueva del catálogo, `d`, y la página la muestra tal cual («30 d»), como hace con `s`, `min` y `h`.
  - impacto: bajo
- A7: Los tests de la página que listan los ajustes de «Interno» al buscar `internal.retries` o al filtrar los nuevos pasan a sacar la lista del catálogo, para que un ajuste nuevo no obligue a tocarlos.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO `.specty/config.yaml` tiene `internal.retries.memory` y la rama de la memoria no se deja mover en ningún intento ENTONCES Specty intenta escribir la entrada esas veces más tras el primero y después falla, como hoy al agotarlos. Sin la clave, lo intenta 10 veces en total, como hoy.
- AC2: CUANDO `.specty/config.yaml` tiene `internal.retries.gitConfig` y otro proceso tiene bloqueada la configuración de git ENTONCES `specty new` repite esas veces más la escritura que liga la rama a su cambio, cada espera el doble de la anterior desde 50 ms. Si no puede, deshace lo que creó y lo dice, como hoy. Sin la clave, la repite 5 veces.
- AC3: CUANDO `.specty/config.yaml` tiene `internal.retention.verifiedDays` ENTONCES `specty prune` borra del registro de unidades las anotadas hace más de esos días, guarda las demás y su salida dice esos días. Sin la clave, borra las de más de 30 días, como hoy.
- AC4: CUANDO una de esas claves queda fuera de sus límites (los reintentos de la memoria entre 1 y 50, los de la configuración de git entre 1 y 10 y los días del registro entre 1 y 365) o no es un entero ENTONCES el validador del core da un error con su clave, y Specty no usa el archivo, como con cualquier error de `config.yaml`.
- AC5: CUANDO la persona abre «Configuración» y despliega «Interno», busca o filtra los nuevos ENTONCES ve los tres ajustes en «Interno» con la marca «Nuevo», su clave y su valor, los días con la unidad `d`.
- AC6: CUANDO la UI está en inglés ENTONCES los nombres y las descripciones de los tres ajustes salen en inglés, y cada uno los tiene en español y en inglés.
- AC7: CUANDO se lee `docs/formats.md` §6 ENTONCES documenta las tres claves con sus valores por defecto y sus límites, y §1 y la memoria remiten a ellas en lugar de a los valores fijos.
  - test: manual

## Diseño

- Core, `schema/internal-waits.ts`: `InternalWaitsConfig.retries` gana `memory` y `gitConfig`, y nace `retention: { verifiedDays }`, con sus valores en `DEFAULT_INTERNAL_WAITS`, sus `int`, `min` y `max` en `INTERNAL_WAITS_SHAPE` (`retention` es otro `strictObject` opcional) y su resolución en `resolveInternalWaits`.
- Core, `settings/catalog.ts`: `unit` admite `d`. Entran `internal.retries.memory`, `internal.retries.gitConfig` (`kind: "number"`, `new: true`) e `internal.retention.verifiedDays` (`unit: "d"`), en el bloque `INTERNAL`, tras `internal.retries.landing`.
- Core, `cards/settings-internal.ts`: `INTERNAL_SETTING_TEXTS`, con los textos de «Interno» que hoy están en `cards/settings.ts` (`INTERNAL_TEXTS` e `INTERNAL_RUN_TEXTS`) y los nombres y descripciones de los tres nuevos en los dos idiomas. `cards/settings.ts` los reúne en `TEXTS` con un spread.
- CLI, `store/memory.ts`: `MemoryTarget` gana `retries` (opcional, con el valor por defecto de core), y `editMemory` intenta `retries + 1` veces en lugar de `ATTEMPTS`. `targetOf` de `commands/memory.ts`, que arma cada `MemoryTarget` de los comandos, lo llena con `session.config.internal.retries.memory`.
- CLI, `flow/branches.ts`: `LOCK_WAITS` deja paso a `lockWaits(retries)`, que da las esperas que doblan desde 50 ms. `markBranch` recibe siempre sus esperas, y `commands/new.ts` le pasa `lockWaits(session.config.internal.retries.gitConfig)` en sus dos llamadas.
- CLI, `flow/units.ts`: `RECORD_DAYS` deja paso a `session.config.internal.retention.verifiedDays`, y `pruneRecord` devuelve lo que borró y los días que usó, que `commands/prune.ts` pasa a su tarjeta.
- Tests: `core/test/schema/schema.test.ts` (AC4), `core/test/settings/catalog.test.ts` (AC5, AC6), `ui/src/settings/settings-page.test.ts` (AC5), `cli/test/memory.test.ts` (AC1, con la rama bloqueada por un `refs/heads/specty-memory.lock` y los `update-ref` contados con `GIT_TRACE`), `cli/test/new-locked-config.test.ts` (AC2, con los `git config` contados con `GIT_TRACE`) y `cli/test/prune-units.test.ts` (AC3).

## Archivos

- modificar packages/core/src/schema/internal-waits.ts — las claves `internal.retries.memory`, `internal.retries.gitConfig` e `internal.retention.verifiedDays`, con sus límites y los valores de hoy
- modificar packages/core/src/settings/catalog.ts — la unidad `d` y los tres ajustes nuevos en «Interno»
- crear packages/core/src/cards/settings-internal.ts — los textos de «Interno», con los de los tres ajustes nuevos en español y en inglés
- modificar packages/core/src/cards/settings.ts — reúne los textos de «Interno» de su módulo
- modificar packages/core/test/schema/schema.test.ts — los valores por defecto y los límites de las claves nuevas
- modificar packages/core/test/settings/catalog.test.ts — los ajustes nuevos, su unidad, sus marcas y sus textos
- modificar packages/ui/src/settings/settings-page.test.ts — las listas de «Interno» salen del catálogo
- modificar packages/cli/src/store/memory.ts — los reintentos de la memoria de su destino
- modificar packages/cli/src/commands/memory.ts — `targetOf` pone los reintentos de la configuración
- modificar packages/cli/src/flow/branches.ts — las esperas de `markBranch` salen de sus reintentos
- modificar packages/cli/src/commands/new.ts — pasa a `markBranch` los reintentos de la configuración
- modificar packages/cli/src/flow/units.ts — los días del registro de la configuración
- modificar packages/cli/src/commands/prune.ts — la tarjeta dice los días que se usaron
- modificar packages/cli/test/memory.test.ts — los reintentos configurados de la memoria
- modificar packages/cli/test/new-locked-config.test.ts — los reintentos configurados de la configuración de git
- modificar packages/cli/test/prune-units.test.ts — los días configurados del registro
- modificar docs/formats.md — §1, la memoria y §6: las claves nuevas
- modificar docs/ARCHITECTURE.md — `markBranch` y el registro de unidades remiten a sus claves
- modificar docs/dominio.md — el registro de unidades remite a su clave

## Tareas

- [x] T1: Las claves nuevas de `internal`, sus ajustes en «Interno» y los textos de «Interno» en su módulo
  - files: packages/core/src/schema/internal-waits.ts, packages/core/src/settings/catalog.ts, packages/core/src/cards/settings-internal.ts, packages/core/src/cards/settings.ts, packages/core/test/schema/schema.test.ts, packages/core/test/settings/catalog.test.ts, packages/ui/src/settings/settings-page.test.ts, docs/formats.md
  - ac: AC4, AC5, AC6, AC7
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/schema/schema.test.ts test/settings/catalog.test.ts && pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/settings/settings-page.test.ts
- [x] T2: La memoria y `specty new` reintentan según la configuración
  - files: packages/cli/src/store/memory.ts, packages/cli/src/commands/memory.ts, packages/cli/src/flow/branches.ts, packages/cli/src/commands/new.ts, packages/cli/test/memory.test.ts, packages/cli/test/new-locked-config.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/memory.test.ts test/new-locked-config.test.ts
- [x] T3: `specty prune` guarda el registro de unidades los días de la configuración
  - files: packages/cli/src/flow/units.ts, packages/cli/src/commands/prune.ts, packages/cli/test/prune-units.test.ts, docs/dominio.md
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/prune-units.test.ts && pnpm typecheck && pnpm lint && pnpm knip

## Riesgos

- R1: C12 añadirá sus textos de «Interno» y también toca el catálogo, `docs/formats.md` §6 y, quizá, `cards/settings.ts`, de donde este cambio saca los de «Interno». Mitigación: los textos pasan a `cards/settings-internal.ts` en un solo movimiento, las claves nuevas van en su propio bloque, y al incorporar main `specty integrate` conserva lo de los dos.
- R2: El test de la memoria bloquea su rama con el archivo `.lock` de git, que solo existe con el almacén de refs en archivos. Mitigación: es el almacén por defecto de los repositorios de los tests, y el test cuenta los `update-ref` con `GIT_TRACE`, sin depender del mensaje de git.

## Cierre

### Resumen

- Core: `schema/internal-waits.ts` añade `internal.retries.memory` (9, entre 1 y 50), `internal.retries.gitConfig` (5, entre 1 y 10) y el bloque `internal.retention` con `verifiedDays` (30, entre 1 y 365); `ResolvedConfig.internal` los trae sin tocar `config.ts`.
- Catálogo: los tres ajustes en «Interno», tras `internal.retries.landing`, con la marca `new`; la unidad nueva `d` para los días.
- Textos: los de «Interno» (C8, C9 y los nuevos) pasan a `cards/settings-internal.ts` (`INTERNAL_SETTING_TEXTS`), que `cards/settings.ts` reúne; este baja de 406 a 318 líneas.
- CLI: `editMemory` intenta `retries + 1` veces (`MemoryTarget.retries`, que pone `targetOf`); `markBranch` recibe las esperas de `lockWaits(internal.retries.gitConfig)`, que doblan desde 50 ms; `pruneRecord` borra según `internal.retention.verifiedDays` y devuelve los días, que dice la tarjeta de `prune`.
- Documentación: formats.md §1, la memoria y §6; ARCHITECTURE (`markBranch` y el registro de unidades) y dominio.md remiten a las claves.

### Desviaciones

- Los tests de la página (`settings-page.test.ts`) no entraron en el contrato: el verify de T1 encadena con `&&` vitest del core y `ng test` de la UI, y el rojo de `propose` se cortaba en el primero sin llegar al segundo (P190). Se enviaron solo los del core y la CLI, y los de la página se escribieron en T1, como planeaba la spec (A7): las dos listas de «Interno» salen del catálogo y hay dos tests nuevos de AC5 y AC6.
- Los tests del catálogo de C8 que enumeraban los ajustes internos (la lista de `new`, la de «Interno» y su número) se ampliaron con los tres nuevos.

### Decisiones

- Los reintentos cuentan las veces más tras el primer intento, como `internal.retries.landing`, así que la memoria tiene 9 por defecto (10 intentos, como hoy); los dos empiezan en 1 para que un choque suelto no haga fallar el comando.
- `MemoryTarget.retries` es opcional, con el valor por defecto de core, para que quien arme un destino a mano (un test del servidor) no tenga que darlo.
- Los tests de la CLI cuentan los intentos con `GIT_TRACE` (`update-ref` de la memoria y `git config branch.<rama>.specty`), sin depender del tiempo.

### Pendientes

- El resto del inventario de C8 (`POLL_MS`, `STALE_MS`, el `--interval` de `specty wait` e `INDEX_LIFE`) va a un corte nuevo de la épica, o a dos, porque juntos salen XL.
- `packages/ui/src/settings/settings-page.test.ts` tiene 469 líneas de código (aviso desde 400): conviene llevar los tests de «Interno» a su propio archivo.
- AC7 se comprueba a mano: formats.md §1, la memoria y §6.
