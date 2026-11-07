---
kind: standard
epic: 20261107-flujo-configurable-en-la-ui
slice: C8
---

# Las esperas, los reintentos y la retención pasan a ser ajustes internos

## Objetivo

Hoy cuánto espera `specty wait`, cada cuánto escribe su línea de latido y cuántas veces reintenta `close` aterrizar cuando main se mueve están fijos en el código de la CLI. Con este cambio son claves opcionales de `.specty/config.yaml` bajo `internal` (`internal.waits` e `internal.retries`), con mínimos y máximos en el schema y los valores de hoy por defecto. La página «Configuración» las muestra en una sección «Interno», la última, plegada y con un aviso, junto a las cuatro vidas que forman parte del cumplimiento (recibos, pendientes del guard, instantáneas de shell y vinculación de sesiones), que se ven con la marca «Garantía» y un candado, sin clave. Es el corte C8 de la épica, estrechado (R4 de la épica): cubre sus AC22, AC25 y AC26 para estos parámetros.

## Fuera de alcance

- Los demás parámetros fijos del inventario de C8, que pasan a un corte nuevo de la épica: `POLL_MS` de `flow/full-verification.ts` y de `store/verify-slots.ts`, `STALE_MS` de `store/waits.ts` y de `store/turn-queue.ts`, `ATTEMPTS` de `store/memory.ts`, `LOCK_WAITS` de `flow/branches.ts`, `INDEX_LIFE` de `store/leftovers.ts`, `RECORD_DAYS` de `flow/units.ts` y el `--interval` de 500 ms de `specty wait`.
- Cambiar las cuatro vidas del cumplimiento: siguen fijas en 24 h en `store/local.ts`, `enforce/pending.ts`, `enforce/shell-snapshot.ts` y `flow/orphans.ts`.
- `internal.exec`, `internal.output` e `internal.server`, que son de C9.
- Guardar ajustes desde la UI (C2) y las piezas y garantías de la vista Flujo (C3).

## Supuestos

- A1: El corte completo (13 parámetros en 12 archivos de la CLI, cada uno con su test, más core y UI) sale XL. Por eso este cambio se estrecha a la base de `internal` (schema, catálogo, sección «Interno» y garantías) y a tres parámetros, uno de las esperas de `specty wait`, otro de su latido y otro de los reintentos de aterrizaje. Los demás van a un corte nuevo de la épica, que se ajusta para recogerlos.
  - impacto: alto
- A2: Las claves son `internal.waits.waitTimeoutSec` (3600 por defecto, entre 60 y 3600), `internal.waits.heartbeatSec` (60, entre 1 y 240) e `internal.retries.landing` (2, entre 0 y 10). La espera no pasa de una hora porque es lo que aguantan todas las herramientas medidas (`cards/wait.ts`, y el `timeout: 3660000` de OpenCode 1). El latido no pasa de 240 s porque Gemini CLI corta un comando callado a los 300 s. Cero reintentos es válido: `close` no vuelve a intentarlo y lo dice, como hoy al agotarlos. `--timeout` sigue mandando sobre la clave.
  - impacto: medio
- A3: Las cuatro vidas de A10 de la épica, revisadas una a una, quedan con candado. Un recibo que viviera más dejaría colar un commit con un recibo viejo. Un pendiente del guard que viviera más dejaría pasar un fin de turno con una marca vieja. Una instantánea de shell que viviera menos se borraría antes del segundo hook de un comando largo, y el guard no sabría qué cambió. Una vinculación de sesión que viviera menos dejaría que la limpieza borrara la carpeta en la que trabaja una sesión. Ninguna tiene clave: el schema rechaza cualquier clave desconocida bajo `internal`.
  - impacto: alto
- A4: Las claves van en un módulo propio, `schema/internal-waits.ts`, como `memory.ts` o `dev.ts`. Exporta la forma de sus bloques para que `config.ts` la reúna bajo `internal` con la de C9 (`{ ...INTERNAL_WAITS_SHAPE }`), sus valores por defecto y su `resolve`. `ResolvedConfig.internal` siempre tiene los valores resueltos, y la CLI los lee de `session.config`.
  - impacto: medio
- A5: En el catálogo, «Interno» es la última sección (`internal`), y estar en ella ya es la marca de interno, así que no se añade una marca aparte. Los ajustes nuevos llevan la marca `new`. Las garantías llevan la marca nueva `guarantee` y su valor fijo (`fixed`, con la unidad nueva `h`), con un id `guarantee.*` que no es una clave. El test del catálogo las deja fuera de la cobertura del schema, como el modo delegado.
  - impacto: medio
- A6: La sección «Interno» muestra el aviso fuera del pliegue y sus ajustes dentro de un `sp-collapsible`, plegado al abrir la página. Se despliega sola mientras hay una búsqueda o un filtro distinto de Todos, para que lo que coincide se vea. Una garantía muestra un candado y su valor fijo en lugar del valor, y no muestra clave. Las palabras de la página van en la página, como las demás de «Configuración».
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO `.specty/config.yaml` tiene `internal.waits.waitTimeoutSec` ENTONCES `specty wait` sin `--timeout` espera como mucho esos segundos y su marca lo dice. Con `--timeout`, manda la opción, y sin la clave espera una hora, como hoy.
- AC2: CUANDO `.specty/config.yaml` tiene `internal.waits.heartbeatSec` ENTONCES `specty wait`, en Gemini CLI, escribe su línea de latido con esa separación como mucho. Sin la clave, la escribe cada minuto, como hoy.
- AC3: CUANDO `.specty/config.yaml` tiene `internal.retries.landing` y main avanza mientras un cambio aterriza ENTONCES `close` vuelve a incorporar main y a aterrizar como mucho esas veces más (ninguna con 0), y después dice que main no avanzó, como hoy. Sin la clave, lo intenta dos veces más.
- AC4: CUANDO una de esas claves queda fuera de sus límites (la espera entre 60 y 3600 s, el latido entre 1 y 240 s y los reintentos entre 0 y 10) o `internal` lleva una clave que no existe ENTONCES el validador del core da un error con su clave, y Specty no usa el archivo, como con cualquier error de `config.yaml`.
- AC5: CUANDO alguien escribe en `internal` una clave para la vida de los recibos, la de los pendientes del guard, la de las instantáneas de shell o la vinculación de las sesiones ENTONCES el validador la rechaza como clave desconocida. La página «Configuración» muestra esas cuatro vidas en «Interno» con la marca «Garantía», un candado, su valor fijo de 24 h y por qué no se cambia, sin clave ni control.
- AC6: CUANDO la persona abre «Configuración» ENTONCES ve la sección «Interno» la última, plegada, con un aviso de que esos ajustes pueden dejar Specty sin funcionar y de que quitar una clave la devuelve a su valor. Al desplegarla, o al buscar o filtrar, ve sus ajustes con la marca «Nuevo», su clave, su valor y, si cambió, el de por defecto.
- AC7: CUANDO la UI está en inglés ENTONCES la sección, el aviso, la marca «Garantía» y los nombres y descripciones de los ajustes internos salen en inglés, y cada uno tiene su nombre y su descripción en español y en inglés.
- AC8: CUANDO se lee `docs/formats.md` §6 ENTONCES documenta `internal`, sus claves con sus valores por defecto y sus límites, y por qué las cuatro vidas del cumplimiento no tienen clave. `docs/ui.md` describe la sección «Interno» y las garantías.
  - test: manual

## Diseño

- Core, `schema/internal-waits.ts`: `InternalWaitsConfig` (`waits: { waitTimeoutSec, heartbeatSec }`, `retries: { landing }`), `DEFAULT_INTERNAL_WAITS`, `INTERNAL_WAITS_SHAPE` (los `strictObject` opcionales de `waits` y `retries`, con `int`, `min` y `max`) y `resolveInternalWaits(input)`. `config.ts` añade `internal: z.strictObject({ ...INTERNAL_WAITS_SHAPE }).optional()` al schema, `internal: InternalWaitsConfig` a `ResolvedConfig`, `DEFAULT_INTERNAL_WAITS` a `DEFAULT_CONFIG` y `resolveInternalWaits(input.internal)` a `withDefaults`.
- Core, `settings/catalog.ts`: la sección `internal` al final de `SETTING_SECTIONS`. `Setting` gana `guarantee?: true` («una garantía de Specty: fija, sin clave») y `fixed?: number`, y `unit` admite `h`. Entran los tres ajustes nuevos (`kind: "number"`, `new: true`) y las cuatro garantías: `guarantee.receipts`, `guarantee.guardPending`, `guarantee.shellSnapshots` y `guarantee.sessions` (`fixed: 24`, `unit: "h"`). Todo va en un bloque propio al final de `SETTINGS`.
- Core, `cards/settings.ts`: la sección «Interno» / «Internal», y el nombre y la descripción de los siete en los dos idiomas. La descripción de cada garantía dice por qué no se cambia.
- CLI, `commands/wait.ts`: `TIMEOUT_SEC` y `BEAT_MS` dejan paso a `session.config.internal.waits` (`options.beatMs` sigue para los tests). CLI, `flow/land.ts`: `RETRIES` deja paso a `session.config.internal.retries.landing`.
- UI, `settings/settings-page.ts`: la marca `guarantee` («Garantía», tono de cierre). La sección `internal` pinta el aviso (`[data-internal-warning]`) y un `sp-collapsible` con sus filas, que se abre mientras hay búsqueda o filtro. Una fila con `guarantee` muestra el candado (`[data-lock]`) y `fixed` con su unidad como su valor, y no muestra la línea de la clave.
- Tests: `core/test/schema/schema.test.ts` (AC4, AC5), `core/test/settings/catalog.test.ts` (AC5, AC7), `cli/test/wait.test.ts` (AC1, AC2), `cli/test/close-moved.test.ts` (AC3) y `ui/src/settings/settings-page.test.ts` (AC5, AC6, AC7).

## Archivos

- crear packages/core/src/schema/internal-waits.ts — las claves `internal.waits` e `internal.retries`, con sus límites y los valores de hoy
- modificar packages/core/src/schema/config.ts — la clave `internal`, que reúne esos bloques, en el schema, en `ResolvedConfig` y en `DEFAULT_CONFIG`
- modificar packages/core/src/settings/catalog.ts — la sección «Interno», la marca `guarantee`, el valor fijo, la unidad `h`, los ajustes nuevos y las cuatro garantías
- modificar packages/core/src/cards/settings.ts — la sección y los nombres y descripciones en español y en inglés
- modificar packages/core/test/schema/schema.test.ts — los valores por defecto, los límites y las claves que no existen
- modificar packages/core/test/settings/catalog.test.ts — la sección nueva, las garantías fuera de la cobertura del schema, las marcas y los textos
- modificar packages/cli/src/commands/wait.ts — la espera y el latido de la configuración
- modificar packages/cli/src/flow/land.ts — los reintentos de aterrizaje de la configuración
- modificar packages/cli/test/wait.test.ts — la espera y el latido configurados
- modificar packages/cli/test/close-moved.test.ts — los reintentos configurados
- modificar packages/ui/src/settings/settings-page.ts — la sección «Interno» plegada con su aviso y las garantías con candado
- modificar packages/ui/src/settings/settings-page.test.ts — la sección, el pliegue, las garantías y los textos en los dos idiomas
- modificar docs/formats.md — §6: `internal` y sus claves, y las vidas sin clave
- modificar docs/ui.md — la sección «Interno» y las garantías de «Configuración»

## Tareas

- [ ] T1: El bloque `internal` del schema y los ajustes internos del catálogo, con sus textos
  - files: packages/core/src/schema/internal-waits.ts, packages/core/src/schema/config.ts, packages/core/src/settings/catalog.ts, packages/core/src/cards/settings.ts, packages/core/test/schema/schema.test.ts, packages/core/test/settings/catalog.test.ts, docs/formats.md
  - ac: AC4, AC5, AC7, AC8
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/schema/schema.test.ts test/settings/catalog.test.ts
- [ ] T2: `specty wait` y `close` leen su espera, su latido y sus reintentos de la configuración
  - files: packages/cli/src/commands/wait.ts, packages/cli/src/flow/land.ts, packages/cli/test/wait.test.ts, packages/cli/test/close-moved.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/wait.test.ts test/close-moved.test.ts
- [ ] T3: La sección «Interno» plegada, con su aviso, y las garantías con candado
  - files: packages/ui/src/settings/settings-page.ts, packages/ui/src/settings/settings-page.test.ts, docs/ui.md
  - ac: AC5, AC6, AC7, AC8
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/settings/settings-page.test.ts && pnpm typecheck && pnpm lint && pnpm knip

## Riesgos

- R1: C9 añade a la vez `internal.exec`, `internal.output` e `internal.server` y también toca `config.ts`, el catálogo, sus textos, `docs/formats.md` §6 y la página. Mitigación: este bloque va en su módulo y en su bloque del catálogo, la forma se reúne con un spread, y al incorporar main `specty integrate` conserva lo de los dos.
- R2: Una espera o un latido extremos dejarían a `specty wait` inservible en alguna herramienta. Mitigación: el schema pone mínimos y máximos (A2), la sección va plegada con un aviso, y quitar la clave devuelve el valor de hoy.
