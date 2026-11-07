---
kind: standard
epic: 20261107-flujo-configurable-en-la-ui
slice: C13
---

# Los límites del servidor de la UI pasan a ser ajustes internos

## Objetivo

Hoy el servidor de `specty ui` tiene sus límites fijos en el código: mira los cambios cada segundo mientras alguien escucha sus eventos, lee cada medio segundo las verificaciones que corren en otros procesos, guarda las últimas 1000 líneas de una verificación en curso y la avisa como mucho cada 250 ms, y no lee el cuerpo de una acción de más de 64 KiB. Con este cambio son cinco claves opcionales de `internal.server`, con un mínimo y un máximo en el schema y el valor de hoy por defecto, y la página «Configuración» las muestra en «Interno» con la marca «Nuevo». Es el corte C13 de la épica: AC23, AC25 y AC26 para estos parámetros.

## Fuera de alcance

- Las comprobaciones de origen, cookie y CSRF del servidor: son una garantía y no se configuran.
- `PAGE` de `server/finished.ts`, los 30 cambios terminados que da `GET /api/changes/finished` cuando la petición no trae `limit` (A2).
- Lo que ya pasó a ajuste en otros cortes (`internal.server.portsTried`, `internal.exec.maxOutputKiB`) y el resto de parámetros de C14 a C18: el hook de Antigravity, los límites de lo que se muestra y las esperas y bloqueos.
- Tocar la UI: la página ya muestra cada ajuste del catálogo en su sección, con sus marcas y su unidad (A4).
- Plegar la sección «Interno» y su aviso, que ya pone C8.

## Supuestos

- A1: Las claves van en el bloque `server` de `schema/internal-run.ts`, junto a `portsTried` (C9), así que `config.ts` no cambia y no hay un segundo bloque `internal`. Son enteros con estos valores y límites: `changesEveryMs` 1000 (de 100 a 60000), `tasksEveryMs` 500 (de 100 a 60000), `runLines` 1000 (de 100 a 10000), `runEveryMs` 250 (de 50 a 10000) y `maxBodyKiB` 64 (de 64 a 1024). Los mínimos evitan que el servidor se coma la CPU mirando sin pausa, que una verificación no deje ver su fallo o que una acción de hoy se quede sin cuerpo (R2 de la épica); los máximos acotan la espera y la memoria.
  - impacto: medio
- A2: `PAGE` de `server/finished.ts` queda fijo: la UI siempre pide su página con `limit` (`data/finished-pages.ts`), así que una clave no cambiaría nada de lo que ve la persona.
  - impacto: medio
- A3: `runLines` y `runEveryMs` rigen las dos copias de hoy: la verificación completa que lanza el servidor (`server/run-output.ts` y lo que guarda cada unidad en `server/runs.ts`) y el archivo en vivo que escriben `specty task done`, `accept` y `verify --fresh` (`flow/live-run.ts`), que el servidor lee para avisar de ellas. El servidor usa la configuración de la carpeta en la que arrancó, como `portsTried`; `runLive`, la de la sesión que verifica.
  - impacto: medio
- A4: La página ya muestra cada ajuste del catálogo en su sección con sus marcas y escribe la unidad tras el número (C1, C8, C9 y C12 lo prueban en la UI), así que basta con añadir las claves al catálogo, con la unidad nueva `ms` en las de tiempo, y sus textos a `cards/settings-internal.ts`, sin tocar la UI.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO `.specty/config.yaml` tiene `internal.server.changesEveryMs` ENTONCES el servidor de la UI mira si los cambios se movieron con esa frecuencia mientras alguien escucha sus eventos: con 60000, un cambio que se mueve tras el primer `changes` no se oye en los dos segundos siguientes. Sin la clave se oye, porque mira cada segundo, como hoy.
- AC2: CUANDO tiene `internal.server.tasksEveryMs` ENTONCES el servidor lee con esa frecuencia las verificaciones que corren en otros procesos y emite su `run`: con 60000, la de una tarea que empieza no se oye en los dos segundos siguientes. Sin la clave se oye, porque las lee cada medio segundo.
- AC3: CUANDO tiene `internal.server.runLines` ENTONCES una verificación en curso guarda solo esas últimas líneas: la completa que lanza la UI, en lo que emite `run`, y la de una tarea, en su archivo en vivo. Sin la clave, las últimas 1000.
- AC4: CUANDO tiene `internal.server.runEveryMs` ENTONCES la verificación completa que lanza la UI se oye como mucho con esa frecuencia, y el archivo en vivo de la de una tarea se reescribe como mucho con esa frecuencia: con 10000, una línea nueva no llega al archivo en el segundo y medio siguiente. Sin la clave, cada 250 ms.
- AC5: CUANDO tiene `internal.server.maxBodyKiB` y una acción de la persona trae un cuerpo de más de 64 KiB y no más que ese límite ENTONCES el servidor lo lee y hace la acción. Uno más grande se lee como ninguno, y la acción que lo necesita responde 400, como hoy a partir de 64 KiB.
- AC6: CUANDO una de esas claves no es un entero entre sus límites (A1) ENTONCES el validador del core da un error con su clave, y Specty no usa el archivo, como con cualquier error de `config.yaml`. Sin ellas, la configuración resuelta tiene los valores de hoy.
- AC7: CUANDO la persona abre «Configuración» ENTONCES ve los cinco ajustes en la sección «Interno», la última, tras los puertos que prueba la UI, con la marca «Nuevo», su clave y su valor; los de tiempo, en ms.
- AC8: CUANDO la UI está en español o en inglés ENTONCES el nombre y la descripción de cada ajuste salen en ese idioma, con sus límites.
- AC9: CUANDO se lee `docs/formats.md` §6 ENTONCES documenta las cinco claves, con su valor por defecto, sus límites y dónde rigen, y `docs/ARCHITECTURE.md` dice lo mismo donde habla de los eventos, de las verificaciones en vivo y de las acciones de la persona.
  - test: manual

## Diseño

- Core, `schema/internal-run.ts`: `InternalRunConfig.server` gana `changesEveryMs`, `tasksEveryMs`, `runLines`, `runEveryMs` y `maxBodyKiB`; `DEFAULT_INTERNAL_RUN.server`, sus valores de hoy; `INTERNAL_RUN_SHAPE.server`, cada uno con `z.number().int().min(…).max(…).optional()`; y `resolveInternalRun`, su valor. `config.ts` ya reúne este módulo bajo `internal` y no cambia.
- Core, `settings/catalog.ts`: `Setting.unit` admite `"ms"`, y el bloque `INTERNAL_RUN` suma, tras `portsTried` y en este orden, los cinco ajustes `kind: "number"`, `new: true`, con `unit: "ms"` los tres de tiempo. `cards/settings-internal.ts`: sus nombres y descripciones en `INTERNAL_RUN_TEXTS`, en los dos idiomas.
- CLI, `server/run-output.ts`: `Shown` lleva `limits` (`runLines` y `runEveryMs`), que `liveRun` usa en lugar de `KEPT` y `EVERY`. `server/runs.ts` pone en su `RunTarget` `limits: session.config.internal.server` y recorta con él las líneas de cada unidad. `flow/live-run.ts` lee los dos de `session.config.internal.server`.
- CLI: `server/http.ts` pasa a `changeEvents` `options.interval ?? session.config.internal.server.changesEveryMs` (los tests siguen pasando `interval`); `server/watched-runs.ts` mira cada `tasksEveryMs`; y `server/api.ts` lee el cuerpo hasta `maxBodyKiB * 1024` bytes.
- Tests: `core/test/settings/internal-server.test.ts`, nuevo (AC6, AC7, AC8), porque `catalog.test.ts` ya pasa de 400 líneas de código; de este solo se suman las claves a sus dos listas exactas de ajustes «Nuevo» de «Interno». `cli/test/server/run-output.test.ts`, nuevo, prueba `liveRun` con temporizadores falsos (AC3, AC4); `cli/test/live-run.test.ts`, el archivo en vivo con `runLines` y `runEveryMs` (AC3, AC4); y `cli/test/server/internal-server.test.ts`, nuevo, los eventos, las verificaciones de otros procesos y el cuerpo de una acción con un servidor real (AC1, AC2, AC5).

## Archivos

- modificar packages/core/src/schema/internal-run.ts — las cinco claves de `internal.server`, con sus límites y los valores de hoy
- modificar packages/core/src/settings/catalog.ts — la unidad `ms` y los cinco ajustes en «Interno», con la marca «Nuevo»
- modificar packages/core/src/cards/settings-internal.ts — sus nombres y descripciones en español y en inglés
- modificar packages/core/test/settings/catalog.test.ts — las claves nuevas en las listas exactas de ajustes «Nuevo» y de «Interno»
- crear packages/core/test/settings/internal-server.test.ts — los límites del schema, los valores por defecto, los ajustes en «Interno» y sus textos
- modificar packages/cli/src/server/run-output.ts — las líneas que guarda una verificación en curso y cada cuánto se oye, de la configuración
- modificar packages/cli/src/server/runs.ts — los límites de la configuración para `liveRun` y para las líneas de cada unidad
- modificar packages/cli/src/flow/live-run.ts — las líneas del archivo en vivo y cada cuánto se reescribe, de la configuración
- crear packages/cli/test/server/run-output.test.ts — `liveRun` con los límites configurados y con los de hoy
- modificar packages/cli/test/live-run.test.ts — el archivo en vivo con `runLines` y `runEveryMs`
- modificar packages/cli/src/server/http.ts — cada cuánto mira los cambios, de la configuración
- modificar packages/cli/src/server/watched-runs.ts — cada cuánto lee las verificaciones de otros procesos, de la configuración
- modificar packages/cli/src/server/api.ts — el cuerpo más grande de una acción, de la configuración
- crear packages/cli/test/server/internal-server.test.ts — los eventos, las verificaciones de otros procesos y el cuerpo de una acción, con las claves y sin ellas
- modificar docs/formats.md — §6: las cinco claves de `internal.server`
- modificar docs/ARCHITECTURE.md — los eventos, las verificaciones en vivo y el cuerpo de las acciones, con sus claves

## Tareas

- [x] T1: Las cinco claves de `internal.server` en el schema y sus ajustes en el catálogo, con sus textos
  - files: packages/core/src/schema/internal-run.ts, packages/core/src/settings/catalog.ts, packages/core/src/cards/settings-internal.ts, packages/core/test/settings/catalog.test.ts, packages/core/test/settings/internal-server.test.ts
  - ac: AC6, AC7, AC8
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/settings/catalog.test.ts test/settings/internal-server.test.ts
- [x] T2: Una verificación en vivo guarda las líneas y se avisa con la frecuencia de la configuración
  - files: packages/cli/src/server/run-output.ts, packages/cli/src/server/runs.ts, packages/cli/src/flow/live-run.ts, packages/cli/test/server/run-output.test.ts, packages/cli/test/live-run.test.ts
  - ac: AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server/run-output.test.ts test/live-run.test.ts
- [x] T3: El servidor mira los cambios y las verificaciones de otros procesos, y lee el cuerpo de una acción, con los límites de la configuración
  - files: packages/cli/src/server/http.ts, packages/cli/src/server/watched-runs.ts, packages/cli/src/server/api.ts, packages/cli/test/server/internal-server.test.ts
  - ac: AC1, AC2, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server/internal-server.test.ts && pnpm typecheck
- [ ] T4: formats.md y ARCHITECTURE documentan las claves de `internal.server`
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC9
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/settings/internal-server.test.ts
  - type: docs

## Riesgos

- R1: Un valor bajo de las esperas hace que el servidor mire más a menudo y gaste más CPU, y uno alto hace que la UI tarde en enterarse. Mitigación: los mínimos y máximos de A1, la sección «Interno» plegada con su aviso (C8) y quitar la clave devuelve el valor de hoy.
- R2: C16, C17 y C18 trabajan en paralelo y también tocan el catálogo, `cards/settings-internal.ts` y las listas de `catalog.test.ts`. Mitigación: cada corte añade sus entradas a su bloque, y el conflicto al incorporar main se resuelve con `specty integrate`, conservando lo de los dos.
- R3: Los tests de AC1, AC2 y AC4 prueban que algo no llega en un plazo (segundo y medio o dos segundos) con la espera más larga. Mitigación: la contraprueba sin la clave espera con margen, y con la máquina cargada un aviso que tarda solo puede hacer pasar el test, no fallarlo.
