---
kind: standard
follows:
  - 20261030-la-verificacion-completa-anota-la-cobertura-de
---

# Aceptación en la UI muestra la cobertura de lo que añade el cambio

## Objetivo

La verificación completa ya anota en `change.verified` qué parte de las líneas que añade el cambio ejecutan los tests, pero solo lo ven la terminal y la tarjeta del agente. Con este cambio, la sección Verificación completa de la pestaña Aceptación (en la UI y en el chat) lo muestra, con los tramos sin ejecutar. Además, `diff-coverage` y la verificación completa encuentran sin configuración el informe que deja una herramienta en `coverage/<proyecto>/lcov.info`, como el constructor de tests de Angular, y los tests de la UI de este repositorio lo dejan.

## Fuera de alcance

- Que los tests de exporters y vscode dejen LCOV: un cambio rápido aparte, para no pasar de tres módulos.
- El umbral `checks.coverage.warn` en la UI: el servidor no lo envía, así que la UI muestra siempre el porcentaje y los tramos, sin marcarlo como aviso.
- Comprobar en la UI que la verificación corrió sobre el código actual: la sección ya muestra el último resultado con su fecha.
- La cobertura por tarea en Progreso.

## Supuestos

- A1: El constructor de tests de Angular (`@angular/build:unit-test`) escribe la cobertura en `coverage/<proyecto>/lcov.info` dentro de la carpeta del espacio de trabajo, aquí `packages/ui/coverage/specty-ui/lcov.info`.
  - impacto: alto
- A2: La vista del chat (MCP App) usa el mismo componente de la pestaña Aceptación, así que lo muestra sin cambios propios.

## Criterios de aceptación

- AC1: CUANDO la última verificación completa del cambio pasó y anotó `coverage` en la auditoría ENTONCES la sección Verificación completa de Aceptación dice qué porcentaje de las líneas que añade el cambio ejecutaron los tests y cuántas de cuántas, en español o en inglés según el idioma elegido.
- AC2: CUANDO esa cobertura tiene tramos sin ejecutar ENTONCES la sección los lista como `ruta:línea` o `ruta:desde-hasta` y dice cuántos tramos más quedan, si los hay.
- AC3: CUANDO la última verificación completa falló, no anotó `coverage` o lo anotó sin la forma de formats.md §4 ENTONCES la sección no muestra ninguna cobertura.
- AC4: CUANDO los tests dejan su informe LCOV en `coverage/<proyecto>/lcov.info`, en la raíz o dentro de una o dos carpetas ENTONCES `diff-coverage` lo lee sin configurar `checks.coverage.reports`.
- AC5: CUANDO corren los tests de la UI de este repositorio con cobertura ENTONCES dejan `packages/ui/coverage/specty-ui/lcov.info`, sin informe HTML.
  - test: manual

## Diseño

- UI:
  - `data/progress.ts`: `VerificationView.coverage` (`measured`, `covered`, `gaps`, `stretches`), leída con cuidado de `change.verified`: si falta un campo o no tiene su tipo, no hay cobertura; un tramo mal formado se descarta.
  - `acceptance/full-verification.ts`: con el último resultado correcto y su cobertura, una línea bajo el veredicto. Texto: «Los tests ejecutan el 92 % de las líneas que añade el cambio (120 de 130).». Si hay tramos, «Sin ejecutar:» con cada uno en monoespaciada y «y 2 tramos más» si quedan. El porcentaje se redondea hacia abajo, como en la terminal.
  - `data/sample-run.ts`: la verificación completa simulada que pasa anota una cobertura de ejemplo, para verlo en el prototipo.
  - `angular.json`: `lcovonly` en `coverageReporters`.
- Core: `schema/checks.ts` añade a las rutas por defecto `coverage/*/lcov.info`, `*/coverage/*/lcov.info` y `*/*/coverage/*/lcov.info`.

## Archivos

- modificar packages/ui/src/data/progress.ts — la cobertura de `change.verified`
- modificar packages/ui/src/data/progress.test.ts — AC3 en los datos: forma válida, inválida y sin ella
- modificar packages/ui/src/acceptance/full-verification.ts — la línea de cobertura y sus tramos
- modificar packages/ui/src/acceptance/full-verification.test.ts — AC1, AC2 y AC3 en la sección
- modificar packages/ui/src/data/sample-run.ts — la cobertura de ejemplo de la verificación simulada
- modificar packages/ui/angular.json — el informe `lcovonly`
- modificar packages/core/src/schema/checks.ts — las rutas `coverage/<proyecto>/lcov.info` por defecto
- modificar packages/cli/test/check-coverage.test.ts — AC4
- modificar docs/ui.md — Aceptación, la cobertura en la verificación completa
- modificar docs/formats.md — las rutas por defecto de `checks.coverage.reports`

## Tareas

- [ ] T1: diff-coverage encuentra el informe en una subcarpeta de coverage
  - files: packages/cli/test/check-coverage.test.ts, packages/core/src/schema/checks.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-coverage.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint
- [ ] T2: Aceptación muestra la cobertura de la verificación completa
  - files: packages/ui/src/acceptance/full-verification.test.ts, packages/ui/src/data/progress.test.ts, packages/ui/src/data/progress.ts, packages/ui/src/acceptance/full-verification.ts, packages/ui/src/data/sample-run.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/acceptance/full-verification.test.ts --include src/data/progress.test.ts && pnpm --filter @baquia-dev/specty-ui typecheck && pnpm lint
- [ ] T3: Los tests de la UI dejan LCOV
  - files: packages/ui/angular.json
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty-ui test && test -f packages/ui/coverage/specty-ui/lcov.info && test ! -d packages/ui/coverage/specty-ui/lcov-report
  - type: chore
- [ ] T4: La documentación cuenta la cobertura en Aceptación
  - files: docs/ui.md, docs/formats.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: Las rutas nuevas con `*` recorren más carpetas al buscar informes — `*` no entra en dependencias ni en carpetas ocultas, y solo se leen los informes modificados durante la ejecución.
