---
kind: standard
---

# La verificación completa anota la cobertura de lo que añade el cambio y la aceptación la muestra

## Objetivo

`diff-coverage` solo mide cuando `specty check` lanza los tests, y en `task done` con verificación propia no los lanza, así que la persona acepta sin saber qué parte de lo que añade el cambio ejecutan los tests. Con este cambio, cada verificación completa que Specty registra (la de `accept`, la de la UI o la del merge de la rama principal) anota esa cobertura en la auditoría, y la aceptación la muestra a la persona y al agente. Además, los tests de core y de la CLI de este repositorio dejan su informe LCOV, para que haya qué medir.

## Fuera de alcance

- Mostrar la cobertura en la UI y en el chat (Aceptación) y que los tests de ui, exporters y vscode dejen LCOV: van en el cambio siguiente.
- Anotar la cobertura en la verificación de cada tarea (`task.verified`): la aceptación mira el cambio entero.
- Bloquear la aceptación por la cobertura: solo se muestra, con el aviso de `checks.coverage.warn`.
- Ejecutar los tests con cobertura por su cuenta: Specty lee el informe que deja la verificación del proyecto.

## Supuestos

- A1: Las herramientas de cobertura escriben el informe durante la verificación, así que un informe modificado desde que empezó la verificación es de esa ejecución.
  - impacto: alto
- A2: Basta con la cobertura de la última verificación completa que pasó sobre el código actual: una que falló puede no haber dejado informe, y una sobre otro código ya no describe el cambio.
- A3: Cinco tramos sin ejecutar, con cuántos más quedan, bastan para decidir en la aceptación; el detalle completo lo da `specty check`.

## Criterios de aceptación

- AC1: CUANDO `specty accept` ejecuta la verificación completa y esta deja un informe de cobertura en una ruta de `checks.coverage.reports` ENTONCES la nota de la verificación dice qué porcentaje de las líneas que añade el cambio ejecutaron los tests, y la entrada `change.verified` de la auditoría lo anota (líneas medidas, ejecutadas y tramos sin ejecutar).
- AC2: CUANDO ese porcentaje queda por debajo de `checks.coverage.warn` ENTONCES la línea lo dice, con el umbral, y lista hasta cinco tramos sin ejecutar como `ruta:línea` o `ruta:desde-hasta`, con cuántos quedan además.
- AC3: CUANDO el cambio está en aceptación y su última verificación completa que pasó sobre el código actual anotó la cobertura ENTONCES la muestran el resumen que ve la persona al aceptar y la tarjeta del agente (`specty next`, sección COBERTURA); si el código cambió desde esa verificación, o ninguna la anotó, no sale.
- AC4: CUANDO los tests de core y de la CLI de este repositorio corren con cobertura ENTONCES dejan `coverage/lcov.info` en la carpeta de su paquete, sin informe HTML.
  - test: manual

## Diseño

- Core, puro:
  - `cards/view.ts`: `CoverageView` (`measured`, `covered`, `gaps` hasta cinco, `stretches` con el total de tramos y `warn`) y `ChangeView.coverage`.
  - `cards/coverage.ts`: `coverageLines(coverage, lang)`. El porcentaje se redondea hacia abajo, como en el check.
    - Con el porcentaje en `warn` o más: «Cobertura: los tests ejecutan el 92 % de las 130 líneas que añade el cambio.».
    - Por debajo, la misma línea con «, por debajo del 80 %», una línea por tramo («sin ejecutar: ruta:10-14») y «y N tramos más» si quedan.
  - `cards/accept.ts`: `acceptanceSummary` añade esas líneas. `cards/acceptance.ts`: la tarjeta del agente las pone en la sección COBERTURA.
- CLI:
  - `check/coverage.ts`: `changeCoverage(context)` lee los informes nuevos y calcula la cobertura. El check `diff-coverage` la usa, sin cambiar lo que informa.
  - `flow/verified.ts`:
    - `recordFullVerification` mide la cobertura con el contexto `--changed` (las líneas que añade el cambio desde su merge-base con la rama destino). El inicio de la ejecución es la hora de llamada menos su duración (`ms`), así que sus tres llamadas no cambian.
    - Si alguna línea se midió, la anota en `change.verified` como `coverage: {measured, covered, gaps, stretches}` y la devuelve.
    - Si medir falla, la verificación se anota igual, sin cobertura.
    - `coverageOnThisCode(session, audit)`: la de la última `change.verified` que pasó, si anotó cobertura y su `tree` es el del código actual.
  - `flow/acceptance.ts`: `acceptanceFacts` añade `coverage` con `checks.coverage.warn`.
  - `commands/accept.ts`: la nota de la verificación completa añade las líneas de la cobertura que devuelve el registro.
- Este repositorio: `lcovonly` junto a `text-summary` en los `vitest.config.ts` de core y de la CLI. `coverage/` ya está en `.gitignore`, y la ruta `*/*/coverage/lcov.info` ya está entre las de `checks.coverage.reports` por defecto.

## Archivos

- crear packages/core/src/cards/coverage.ts — las líneas de la cobertura del cambio, en español e inglés
- modificar packages/core/src/cards/view.ts — `CoverageView` y `ChangeView.coverage`
- modificar packages/core/src/cards/accept.ts — el resumen de la aceptación muestra la cobertura
- modificar packages/core/src/cards/acceptance.ts — la sección COBERTURA de la tarjeta del agente
- modificar packages/core/src/cards/index.ts — exporta `coverageLines` y `CoverageView`
- crear packages/core/test/cards/coverage.test.ts — los textos de AC2 y AC3
- modificar packages/cli/src/check/coverage.ts — `changeCoverage`, que comparten el check y la verificación
- modificar packages/cli/src/flow/verified.ts — `change.verified` anota la cobertura; `coverageOnThisCode`
- modificar packages/cli/src/flow/acceptance.ts — la cobertura en la vista de aceptación
- modificar packages/cli/src/commands/accept.ts — la nota de la verificación lleva la cobertura
- crear packages/cli/test/accept-coverage.test.ts — AC1, AC2 y AC3 de punta a punta
- modificar packages/core/vitest.config.ts — el informe `lcovonly`
- modificar packages/cli/vitest.config.ts — el informe `lcovonly`
- modificar docs/formats.md — `coverage` en `change.verified` (§4)
- modificar docs/ARCHITECTURE.md — la cobertura en la aceptación

## Tareas

- [x] T1: Las tarjetas muestran la cobertura del cambio
  - files: packages/core/test/cards/coverage.test.ts, packages/core/src/cards/coverage.ts, packages/core/src/cards/view.ts, packages/core/src/cards/accept.ts, packages/core/src/cards/acceptance.ts, packages/core/src/cards/index.ts
  - ac: AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/coverage.test.ts test/cards/accept.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint
- [x] T2: La verificación completa anota la cobertura y la aceptación la muestra
  - files: packages/cli/test/accept-coverage.test.ts, packages/cli/src/check/coverage.ts, packages/cli/src/flow/verified.ts, packages/cli/src/flow/acceptance.ts, packages/cli/src/commands/accept.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/accept-coverage.test.ts test/check-coverage.test.ts test/integrate.test.ts && pnpm --filter @baquia-dev/specty typecheck && pnpm lint && pnpm knip
- [ ] T3: Los tests de core y de la CLI dejan LCOV
  - files: packages/core/vitest.config.ts, packages/cli/vitest.config.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty-core test && test -f packages/core/coverage/lcov.info && test ! -d packages/core/coverage/lcov-report
  - type: chore
- [ ] T4: La documentación cuenta la cobertura en la aceptación
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: Medir la cobertura alarga cada registro de la verificación completa — lee solo los informes nuevos y las líneas del diff, y si falla la verificación se anota igual.
- R2: Un informe de los tests de otra carpeta modificado durante la verificación contaría como suyo — solo se leen las rutas de `checks.coverage.reports` dentro del repositorio, como en el check.
