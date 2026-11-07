---
kind: standard
epic: 20261107-flujo-configurable-en-la-ui
slice: C14
---

# Los límites de lo que muestran las tarjetas pasan a ser ajustes internos

## Objetivo

Hoy cuatro límites de lo que Specty le muestra al agente están fijos en el código. `propose` nombra cinco importadores por archivo (`SHOWN` de `cards/impact.ts`). La tarjeta de `specty review` repite 200 líneas de la respuesta del revisor (`MAX_LINES` de `cards/review.ts`). `task done` admite 300 caracteres por resumen o hallazgo (`NOTE_MAX` de `cards/work.ts`). Y `new` corta en 48 caracteres el slug del id del cambio y de su rama (`slugify` de `ids.ts`, que también usa `branches.ts`). Con este cambio son las claves opcionales del bloque `internal.cards`, con mínimos y máximos en el schema y el valor de hoy por defecto. La página «Configuración» las muestra en la sección «Interno» con la marca «Nuevo». Es el corte C14 de la épica: cubre AC23, AC25 y AC26 para estos cuatro parámetros.

## Fuera de alcance

- Renombrar los cambios o las ramas que ya existen: el largo del slug rige solo para los ids y las ramas que crea `new` desde entonces.
- El id de `specty retro` (`retro <hash>`), que es más corto que cualquier límite admitido.
- Los límites de lo que muestran los comandos y los checks (`SHOWN` de `commands/verify.ts`, `MAX_ENTRIES` de `commands/why.ts`, `SHOWN` de `cards/test-time.ts` y los de `checks/output.ts`), que son el corte C15.
- Los límites de la UI (`SHOWN` de `settings/settings-view.ts` y de `data/acceptance.ts`, `MAX_LINES` de `progress/live-output.ts`).
- La página «Configuración»: muestra cada ajuste del catálogo en su sección con sus marcas, y plegar «Interno» con su aviso ya lo hace C8.

## Supuestos

- A1: Las cuatro claves van en un bloque nuevo, `internal.cards`, en su propio módulo `schema/internal-cards.ts`, que `config.ts` reúne en el único `z.strictObject` de `internal`, como `internal-run.ts` (C9, C12) e `internal-waits.ts` (C8, C11). Son `importersShown` (5, entero de 1 a 50), `reviewLines` (200, de 20 a 2000), `noteChars` (300, de 100 a 1000) y `slugChars` (48, de 16 a 100). Los mínimos son R2 de la épica: un importador, una revisión que aún se lee, una nota de una frase y un slug que aún distingue los cambios. Los máximos acotan lo que la tarjeta repite: las notas se repiten en cada tarjeta de tarea, que se queda en unos 1500 tokens con 300 caracteres (ARCHITECTURE §7).
  - impacto: medio
- A2: El slug va en `internal.cards` aunque no sea solo de una tarjeta, porque el id encabeza cada tarjeta y la épica lo pone en este corte. Un id ya creado no se recalcula, porque vive en el nombre de su carpeta y de su rama, así que cambiar `slugChars` solo cambia los ids y las ramas nuevos.
  - impacto: bajo
- A3: La página ya muestra cada ajuste del catálogo en su sección con sus marcas (C1, C8, C9 y C12 lo prueban), así que basta con añadir las claves al catálogo y sus textos a `cards/settings-internal.ts`, sin tocar la UI. Sus tests derivan del catálogo las listas de «Nuevo», así que tampoco cambian.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO `.specty/config.yaml` tiene `internal.cards.importersShown` y un archivo que cambia la spec tiene más importadores fuera de ella ENTONCES `propose` nombra solo ese número de importadores y cuenta los demás («y N más»). Sin la clave nombra cinco, como hoy.
- AC2: CUANDO tiene `internal.cards.reviewLines` y la respuesta del revisor independiente tiene más líneas ENTONCES la tarjeta de `specty review` repite solo ese número de líneas, seguidas de «…», y `reviews/` la guarda entera. Sin la clave repite 200.
- AC3: CUANDO tiene `internal.cards.noteChars` y el resumen o un hallazgo de `task done` pasan de ese número de caracteres ENTONCES `task done` no completa la tarea y dice el máximo configurado. Con un máximo mayor que 300, un resumen de más de 300 caracteres que no lo pasa completa la tarea. Sin la clave el máximo es 300.
- AC4: CUANDO tiene `internal.cards.slugChars` ENTONCES `new` forma el id del cambio nuevo y el slug de su rama (con `git.flow` `github`, `trunk` o `gitflow`, o `{slug}` en `git.branchPattern`) con como mucho ese número de caracteres, cortados en el último guion, como hoy con 48. Sin la clave, 48. Los cambios y las ramas que ya existen no cambian.
- AC5: CUANDO una de esas claves no es un entero dentro de sus límites, o hay otra clave bajo `internal.cards` ENTONCES el validador del core da un error con su clave, y Specty no usa el archivo, como con cualquier error de `config.yaml`. Sin las claves, la configuración resuelta tiene 5, 200, 300 y 48.
- AC6: CUANDO la persona abre «Configuración» ENTONCES ve los cuatro ajustes en la sección «Interno», tras los de ejecución y servidor, con la marca «Nuevo», su clave y su valor.
- AC7: CUANDO la UI está en español o en inglés ENTONCES el nombre y la descripción de cada ajuste salen en ese idioma.
- AC8: CUANDO se lee `docs/formats.md` §6 ENTONCES documenta las cuatro claves de `internal.cards`, con su valor por defecto, sus límites y dónde rigen, y dice que el largo del slug no cambia los ids ni las ramas que ya existen. `docs/ARCHITECTURE.md` dice lo mismo donde habla de `task done`, de los importadores de `propose` y de las ramas.
  - test: manual

## Diseño

- Core, funciones (T1): cada una recibe su límite como parámetro, con el valor de hoy por defecto (Diseño de la épica). `impactLine(path, importers, lang, shown = IMPORTERS_SHOWN)`, `reviewedCard(view, ctx, maxLines = REVIEW_LINES)`, `makeChangeId(date, title, slugChars = SLUG_CHARS)`, que se lo pasa a `slugify` (cuyo valor por defecto pasa a ser `SLUG_CHARS`), y `branchName`, que gana `slugChars?` en su objeto. La negativa `too-long` de `task done` (`TaskDoneRefusal`) gana `max?`, el máximo que dice la tarjeta, `NOTE_MAX` sin él. Las constantes se exportan desde su módulo (`NOTE_MAX` ya lo está) para que el schema las tome como valores por defecto: una sola fuente para cada valor, e `ids.ts` sigue sin importar zod, porque la entrada ligera lo alcanza por `settings/catalog.ts` y `branches.ts`.
- Core, schema (T2): `schema/internal-cards.ts`, con la forma de `internal-run.ts`: `InternalCardsConfig`, `DEFAULT_INTERNAL_CARDS` con esas constantes, `INTERNAL_CARDS_SHAPE` (`cards`, un `z.strictObject` de enteros con sus límites, opcionales) y `resolveInternalCards`. `config.ts` lo suma al tipo de `internal`, a `DEFAULT_CONFIG`, al único `z.strictObject` de `internal` y a `resolveConfig`. En `settings/catalog.ts`, un bloque `INTERNAL_CARDS` tras `INTERNAL_RUN`, cuatro números con `new: true` y sin unidad (las del catálogo son de tiempo). En `cards/settings-internal.ts`, `INTERNAL_CARDS_TEXTS`, en los dos idiomas, que se suma a `INTERNAL_SETTING_TEXTS`.
- CLI (T3): `flow/impact.ts` pasa `session.config.internal.cards.importersShown` a `impactLine`; `commands/review.ts`, `reviewLines` a `reviewedCard`; `commands/task.ts` compara las notas con `noteChars` y lo pone en `max`; `commands/new.ts` pasa `slugChars` a `makeChangeId`, en los dos sitios donde forma el id, y a `branchName`.
- Tests: `core/test/settings/card-limits.test.ts`, nuevo, con un `describe` de las funciones con su parámetro (T1) y otro de las claves, el catálogo y los textos (T2); `core/test/settings/catalog.test.ts` suma las cuatro claves a sus listas exactas de «Nuevo» y de «Interno», y su cuenta fija de ajustes en «Interno» pasa a comprobar que están todos sus ajustes y que son al menos esos, para no chocar con los cortes que trabajan en paralelo; y `cli/test/card-limits.test.ts`, nuevo, que prueba de punta a punta AC1 a AC4 con la clave y sin ella. Los tests leen la configuración resuelta con `toMatchObject`, sin tipos, para que compilen en cada tarea.

## Archivos

- modificar packages/core/src/cards/impact.ts — `impactLine` recibe cuántos importadores nombra; `IMPORTERS_SHOWN`, exportada
- modificar packages/core/src/cards/review.ts — `reviewedCard` recibe cuántas líneas repite; `REVIEW_LINES`, exportada
- modificar packages/core/src/cards/task.ts — la negativa `too-long` lleva el máximo que dice su tarjeta
- modificar packages/core/src/ids.ts — `makeChangeId` recibe el largo del slug; `SLUG_CHARS`, exportada
- modificar packages/core/src/branches.ts — `branchName` recibe el largo del slug
- crear packages/core/src/schema/internal-cards.ts — el bloque `internal.cards`, con sus límites y los valores de hoy
- modificar packages/core/src/schema/config.ts — `internal.cards` en el tipo, el valor por defecto, el schema y la resolución de `internal`
- modificar packages/core/src/settings/catalog.ts — los cuatro ajustes nuevos en la sección «Interno», con la marca «Nuevo»
- modificar packages/core/src/cards/settings-internal.ts — su nombre y su descripción en español y en inglés
- crear packages/core/test/settings/card-limits.test.ts — las funciones con su parámetro, las claves, sus límites, el catálogo y los textos
- modificar packages/core/test/settings/catalog.test.ts — las cuatro claves en las listas exactas de «Nuevo» y de «Interno»
- modificar packages/cli/src/flow/impact.ts — los importadores que nombra `propose`, de la configuración
- modificar packages/cli/src/commands/review.ts — las líneas de la revisión que repite la tarjeta, de la configuración
- modificar packages/cli/src/commands/task.ts — el máximo de las notas de `task done`, de la configuración
- modificar packages/cli/src/commands/new.ts — el largo del slug del id y de la rama, de la configuración
- crear packages/cli/test/card-limits.test.ts — los cuatro límites de punta a punta, con la clave y sin ella
- modificar docs/formats.md — §6: el bloque `internal.cards`
- modificar docs/ARCHITECTURE.md — los límites de `task done`, de los importadores de `propose` y del slug de las ramas

## Tareas

- [ ] T1: Las funciones de core reciben los límites de lo que muestran, con el valor de hoy por defecto
  - files: packages/core/src/cards/impact.ts, packages/core/src/cards/review.ts, packages/core/src/cards/task.ts, packages/core/src/ids.ts, packages/core/src/branches.ts, packages/core/test/settings/card-limits.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/settings/card-limits.test.ts -t "as parameters"
- [ ] T2: El bloque `internal.cards` en el schema y sus ajustes en el catálogo, con sus textos
  - files: packages/core/src/schema/internal-cards.ts, packages/core/src/schema/config.ts, packages/core/src/settings/catalog.ts, packages/core/src/cards/settings-internal.ts, packages/core/test/settings/card-limits.test.ts, packages/core/test/settings/catalog.test.ts, docs/formats.md
  - ac: AC5, AC6, AC7, AC8
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/settings/card-limits.test.ts test/settings/catalog.test.ts
- [ ] T3: `propose`, `review`, `task done` y `new` usan los límites de la configuración
  - files: packages/cli/src/flow/impact.ts, packages/cli/src/commands/review.ts, packages/cli/src/commands/task.ts, packages/cli/src/commands/new.ts, packages/cli/test/card-limits.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3, AC4, AC8
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/card-limits.test.ts && pnpm typecheck

## Riesgos

- R1: Un `noteChars` alto infla cada tarjeta de tarea, que repite los resúmenes y los hallazgos, y un `slugChars` alto alarga las rutas de `.worktrees/<id>`; uno bajo hace los ids menos claros. Mitigación: el schema pone mínimos y máximos, la sección «Interno» va plegada con su aviso (C8) y quitar la clave devuelve el valor de hoy.
- R2: C13, C16, C17 y C18 trabajan en paralelo y también tocan `config.ts`, el catálogo, `cards/settings-internal.ts`, `catalog.test.ts` y formats.md §6. Mitigación: cada corte añade su propio bloque, el test no fija el número de ajustes de «Interno» y el conflicto al incorporar main se resuelve con `specty integrate`, conservando lo de los dos.
