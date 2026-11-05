---
kind: standard
epic: 20261105-verificacion-por-unidades
slice: C5
---

# La verificación avisa de los tests que pasan de un tiempo

## Objetivo

Un test que tarda cada vez más pasa desapercibido hasta que la suite entera se alarga, y nada dice cuál es. Con este cambio, si `checks.testTime` da dónde dejan los tests sus informes JUnit XML y un tiempo máximo, `specty check` avisa de cada test que lo pasa, con su archivo, su nombre y su tiempo. Y la nota de la verificación completa de `accept` muestra los más lentos que dejó.

## Fuera de alcance

- Activarlo en este repositorio: `checks.testTime` en `.specty/config.yaml` lo escribe la persona (el guard no deja al agente editar ese archivo), y el informe JUnit de Vitest en cada paquete va con él.
- Fallar por el tiempo de un test: solo avisa.
- Guardar los tests lentos en el registro del cambio (`change.verified`, `task.verified`) y mostrarlos en la tarjeta de aceptación, en el resumen antes de aceptar o cuando `accept` reutiliza una verificación: solo los muestra la nota de la verificación de `accept` que los ejecuta.
- Mostrar los tests lentos en la UI o en el MCP App.
- Otros formatos de informe que JUnit XML.

## Supuestos

- A1: Un test es un `<testcase>` de un informe JUnit XML, con `time` en segundos. Su archivo es su atributo `file`, si no el `file` de su `<testsuite>`, y si no su `classname` (en Vitest, la ruta del archivo; en JUnit de Java, la clase). Su nombre es `name`. Un `<testcase>` sin `time` no cuenta, y lo que va dentro de CDATA o de un comentario no se lee.
  - impacto: alto
- A2: Como `diff-coverage`, `test-time` corre después de las demás verificaciones y solo lee los informes de `checks.testTime.reports` escritos desde que empezó la ejecución: un informe de antes no describe estos tests.
  - impacto: alto
- A3: `reports` usa los mismos patrones que `checks.coverage.reports` (`*` dentro de un tramo). Como no hay una ruta habitual para JUnit, `reports` y `maxMs` no tienen valor por defecto: sin `checks.testTime`, la verificación no corre.
- A4: Solo avisa: sus hallazgos son avisos aunque su nivel sea `error`, y nunca impiden aceptar.
- A5: La nota de la verificación completa de `accept` muestra los cinco tests más lentos que `maxMs` de los informes que dejó y cuántos más hay, como muestra la cobertura; las verificaciones completas de la UI y de la incorporación no los muestran.

## Criterios de aceptación

- AC1: CUANDO `checks.testTime` da `reports` y `maxMs` y un informe JUnit de sus `reports`, escrito durante `specty check`, tiene tests que tardan más de `maxMs` ENTONCES la verificación `test-time` avisa de cada uno, de mayor a menor tiempo, con su archivo, su nombre y su tiempo, y `specty check` no falla por ello.
- AC2: CUANDO el informe nombra el archivo de un test relativo a la carpeta de su paquete, o con una ruta absoluta dentro del repositorio ENTONCES el aviso lo da con su ruta desde la raíz del repositorio.
- AC3: CUANDO no hay `checks.testTime`, o ningún informe de sus `reports` se escribió durante la ejecución ENTONCES `test-time` no aparece en el informe; con informes nuevos sin tests lentos, pasa.
- AC4: CUANDO la verificación completa de `accept` deja informes de `checks.testTime.reports` con tests más lentos que `maxMs` ENTONCES su nota muestra los cinco más lentos, con su archivo, su nombre y su tiempo, y cuántos más hay; sin tests lentos, no dice nada de ellos.
- AC5: CUANDO `checks.testTime` no da `reports` o `maxMs`, o `maxMs` no es un entero positivo ENTONCES la configuración no es válida.
- AC6: CUANDO salen el aviso de `test-time` o las líneas de los tests lentos de la aceptación ENTONCES salen en español y en inglés.

## Diseño

- Core: `checks.testTime?: { reports, maxMs }` en `schema/checks.ts`. `checks/junit.ts`, puro: `parseJunit(text, root)` da cada test (`{ path?, name, ms }`, con una ruta absoluta dentro de `root` ya relativa) y `slowTests(tests, maxMs)` los que pasan de `maxMs`, de mayor a menor tiempo. `cards/test-time.ts`: `slowTestMessage` (el hallazgo de `test-time`) y `slowTestLines` (lo que muestra la nota de `accept`: los cinco primeros y cuántos más hay).
- CLI: `check/test-time.ts`: la verificación `test-time` (`after: true`) y `slowTestsSince(session, started)`, que lee los informes nuevos y ancla cada archivo relativo a la carpeta más profunda del informe donde existe. Usa `freshReports` y el anclaje de `check/coverage.ts`, que pasan a exportarse. `commands/accept.ts` añade a la nota de la verificación completa las líneas de `slowTestLines` con lo que da `slowTestsSince` desde que empezó su turno.
- Docs: formats.md §6 (`checks.testTime` y la lista de verificaciones), checks.md y checks.en.md (`test-time`), y ARCHITECTURE (la lista de verificaciones y la nota de `accept`).

## Archivos

- modificar packages/core/src/schema/checks.ts — `checks.testTime`
- crear packages/core/src/checks/junit.ts — el lector de informes JUnit y los tests lentos
- modificar packages/core/src/index.ts — exporta el lector
- crear packages/core/test/checks/junit.test.ts — el lector y la configuración
- crear packages/core/src/cards/test-time.ts — el aviso y las líneas de la aceptación
- modificar packages/core/src/cards/index.ts — exporta los textos
- crear packages/core/test/cards/test-time.test.ts — los textos en español y en inglés
- crear packages/cli/src/check/test-time.ts — la verificación `test-time`
- modificar packages/cli/src/check/coverage.ts — exporta la búsqueda de informes nuevos y el anclaje
- modificar packages/cli/src/check/common.ts — registra `test-time`
- crear packages/cli/test/check-test-time.test.ts — la verificación en `specty check`
- modificar packages/cli/src/commands/accept.ts — los muestra en la nota de la verificación completa
- crear packages/cli/test/accept-test-time.test.ts — la nota de la verificación completa
- modificar packages/cli/test/check-docs.test.ts — `test-time` solo aparece con informes
- modificar docs/checks.md — `test-time`
- modificar docs/checks.en.md — `test-time`
- modificar docs/formats.md — `checks.testTime` y `test-time`
- modificar docs/ARCHITECTURE.md — la verificación y la nota de `accept`

## Tareas

- [x] T1: El lector de JUnit y `checks.testTime`
  - files: packages/core/src/schema/checks.ts, packages/core/src/checks/junit.ts, packages/core/src/index.ts, packages/core/test/checks/junit.test.ts
  - ac: AC1, AC2, AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/checks/junit.test.ts && pnpm typecheck && pnpm lint
- [x] T2: Los textos de los tests lentos
  - files: packages/core/src/cards/test-time.ts, packages/core/src/cards/index.ts, packages/core/test/cards/test-time.test.ts
  - ac: AC4, AC6
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/test-time.test.ts && pnpm typecheck && pnpm lint && pnpm sources
- [x] T3: La verificación `test-time` de `specty check`
  - files: packages/cli/src/check/test-time.ts, packages/cli/src/check/coverage.ts, packages/cli/src/check/common.ts, packages/cli/test/check-test-time.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-test-time.test.ts test/check-coverage.test.ts && pnpm typecheck && pnpm lint && pnpm exec knip
- [x] T4: La nota de la verificación completa de `accept` muestra los tests lentos
  - files: packages/cli/src/commands/accept.ts, packages/cli/test/accept-test-time.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/accept-test-time.test.ts test/accept-coverage.test.ts && pnpm typecheck && pnpm lint && pnpm exec knip
- [x] T5: La documentación de `test-time`
  - files: docs/checks.md, docs/checks.en.md, docs/formats.md, docs/ARCHITECTURE.md, packages/cli/test/check-docs.test.ts
  - ac: —
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-docs.test.ts && pnpm lint
  - type: docs

## Riesgos

- R1: El corte C1 también cambia `commands/accept.ts`, y su incorporación puede chocar con esta — cambios puntuales, y el conflicto se resuelve con `specty integrate`.

## Cierre

### Resumen

`checks.testTime` (`reports` y `maxMs`, sin valores por defecto) activa la verificación `test-time`: tras los tests, lee los informes JUnit XML escritos durante la ejecución y avisa de cada test que pasa de `maxMs`, de mayor a menor tiempo, con su archivo, su nombre y su tiempo, sin hacer fallar `specty check`. El lector (`checks/junit.ts`) toma el archivo de `file`, del de su `<testsuite>` o de `classname`, lo deja relativo a la raíz y lo ancla a la carpeta del paquete del informe. La nota de la verificación completa de `accept` muestra los cinco más lentos y cuántos más hay, en español y en inglés.

### Desviaciones

- La spec se recortó antes de aprobarla (era XL): los tests lentos no se guardan en `change.verified` ni salen en la tarjeta de aceptación o en el resumen antes de aceptar; solo en la nota de la verificación de `accept`.
- T1 pidió `cards/test-time.ts` y `cards/index.ts` (de T2): su `pnpm typecheck` compilaba los tests ya aprobados de T2, que importan esos textos. T2 quedó sin código propio.
- T4 pidió `check/test-time.ts` (de T3) para exportar `slowTestsSince`, que T3 dejó sin exportar porque knip rechaza una exportación sin uso.
- La aceptación incorporó main antes de su corrección 26f0facd (la coma final de `git.branchPerChange` en `.specty/config.yaml`), y la configuración de la carpeta del cambio dejó de ser válida: la persona llevó esa corrección a la carpeta del cambio.

### Decisiones

- Solo avisa, aunque su nivel sea `error`, como pedía la épica (A7).
- Los informes se buscan con los patrones de `checks.coverage.reports` (`freshReports`, `folderChain` y `deepest`, que `check/coverage.ts` ahora exporta) en lugar de un buscador propio.

### Pendientes

- Activar `test-time` en este repositorio: `checks.testTime` en `.specty/config.yaml` (lo escribe la persona) y el informe JUnit de Vitest en cada paquete (P127).
- `specty new` dejó una worktree y una rama a medias al fallar por `.git/config` bloqueado (P128).
- `propose` podría avisar de una tarea que no es la última de código y ejecuta el typecheck completo bajo `contract` (P129).
- Una configuración inválida que llega de main deja la worktree en closing sin salida (P131).
