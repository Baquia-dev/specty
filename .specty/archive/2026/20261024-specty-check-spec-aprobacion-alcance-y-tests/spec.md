---
kind: standard
follows:
  - 20261024-secretos-con-betterleaks-o-gitleaks
---

# specty check --spec: aprobación, alcance y tests

## Objetivo

`specty check --spec [id]` suma a las verificaciones de siempre las que dependen del plan aprobado de un cambio (el activo, si no se da el id): que la spec esté aprobada tal como está, que el diff no salga de su alcance, que cada tarea `fix` traiga un test, y un aviso, sin bloquear, si se borran tests o bajan sus casos. Así la persona, la CI y el agente comprueban lo mismo sin depender de que el agente lo recuerde.

## Fuera de alcance

- Las dependencias permitidas (`allowedDependencies` en la spec y la verificación de los manifiestos): son el cambio siguiente, porque amplían el formato de la spec.
- Añadir `status` o `scope` a la spec: la aprobación sigue en `state.json`, que el agente no puede escribir, y el alcance es la sección «Archivos» con los `files` de cada tarea.
- Que `task done` ejecute `specty check --spec` (corte 8).
- Usar `--spec` con `--all`: sin el diff del cambio no hay alcance que comparar, así que se rechaza.

## Supuestos

- A1: El alcance de un cambio es la unión de la sección «Archivos» (con el origen de los renombrados), los `files` de todas sus tareas y las ampliaciones aprobadas (`scopeExtra`), con las mismas reglas que `task done`: tests implícitos y archivos generados entran solos.
  - impacto: alto
- A2: «El diff» es el de la ejecución: con `--changed`, desde el merge-base con la rama destino; con `--staged`, lo preparado. Con `--staged`, una tarea `fix` ya hecha no se juzga, porque su commit ya pasó; la que está activa, sí.
  - impacto: alto
- A3: Un test pertenece a una tarea `fix` si está en sus `files` o en sus ampliaciones, o si es un test implícito de esos archivos (junto a ellos o en su espejo de `test/`).
- A4: Los casos de un archivo de test se cuentan por un catálogo de declaraciones por familia de frameworks (`it(`, `test(`, `testWidgets(`, `def test_`, `func Test`, `@Test`, `[Fact]`, `#[test]`…), una por línea; basta para avisar de que bajan, no para medirlos con exactitud.
- A5: `tests-removed` siempre da avisos, también en nivel `error`; su nivel en `checks.levels` sirve para apagarlo.

## Criterios de aceptación

- AC1: CUANDO se ejecuta `specty check --spec` en la carpeta de un cambio con su spec aprobada y sin tocar desde entonces ENTONCES `spec-approved` pasa; CUANDO la spec cambió tras aprobarse, no está aprobada o el cambio no existe ENTONCES falla con el motivo.
- AC2: CUANDO el diff toca un archivo fuera del alcance del cambio ENTONCES `scope` falla y lista cada ruta fuera; los tests implícitos, los generados y las ampliaciones aprobadas no cuentan como fuera.
- AC3: CUANDO una tarea `fix` activa o hecha no tiene ningún test suyo en el diff ENTONCES `fix-tests` falla con `T<n>`; con su test, pasa; con `--staged`, una `fix` ya hecha no se juzga.
- AC4: CUANDO el diff borra un archivo de test o un test conserva menos casos que en el punto de partida ENTONCES `tests-removed` avisa con la ruta, y con cuántos casos tenía y tiene, sin hacer fallar `specty check`.
- AC5: CUANDO se da `--spec <id>` ENTONCES usa ese cambio aunque la carpeta sea otra; sin `--spec`, ninguna de estas verificaciones aparece; con `--all`, `--spec` se rechaza con un mensaje.
- AC6: CUANDO el idioma es inglés ENTONCES los motivos y los avisos están en inglés.

## Diseño

- `core/src/checks/markers.ts` gana `testCases(text)`, el número de líneas que declaran un caso de test según el catálogo.
- `CheckContext` gana `deleted` (las rutas que el diff borra, con los mismos filtros que `files`) y `before(ruta)`, el texto en el punto de partida (el merge-base con `--changed`, HEAD con `--staged`; nada con `--all`).
- `check/plan.ts` carga el plan (`loadPlan`: el cambio de `--spec <id>` o el activo, su estado y su spec) y arma `planProvider(plan)`, con `spec-approved` y `scope`; `check/plan-tests.ts` define `fix-tests` y `tests-removed`. El proveedor del plan solo entra en la ejecución con `--spec`.
- `commands/check.ts` añade `--spec [id]` y rechaza `--spec` con `--all`.

## Archivos

- modificar packages/core/src/checks/markers.ts — contar los casos de un archivo de test
- modificar packages/core/src/index.ts — exportar `testCases`
- modificar packages/core/test/checks/markers.test.ts — el catálogo de casos
- modificar packages/cli/src/check/provider.ts — `deleted` y `before` en el contexto
- modificar packages/cli/src/check/files.ts — calcular las rutas borradas y el texto de partida
- crear packages/cli/src/check/plan.ts — cargar el plan, su proveedor, `spec-approved` y `scope`
- crear packages/cli/src/check/plan-tests.ts — `fix-tests` y `tests-removed`
- modificar packages/cli/src/commands/check.ts — la opción `--spec [id]`
- crear packages/cli/test/check-plan.test.ts — las verificaciones del plan de punta a punta
- modificar docs/formats.md — las verificaciones del plan
- modificar docs/ARCHITECTURE.md — `--spec` en la fila de `specty check`

## Tareas

- [x] T1: Contar los casos de un archivo de test
  - files: packages/core/src/checks/markers.ts, packages/core/src/index.ts, packages/core/test/checks/markers.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/checks/markers.test.ts
- [x] T2: `--spec` con `spec-approved` y `scope`
  - files: packages/cli/src/check/provider.ts, packages/cli/src/check/files.ts, packages/cli/src/check/plan.ts, packages/cli/src/commands/check.ts, packages/cli/test/check-plan.test.ts
  - ac: AC1, AC2, AC5, AC6
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-plan.test.ts test/check.test.ts
- [x] T3: `fix-tests` y `tests-removed`
  - files: packages/cli/src/check/plan-tests.ts, packages/cli/src/check/plan.ts, packages/cli/test/check-plan.test.ts
  - ac: AC3, AC4, AC6
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-plan.test.ts
- [x] T4: La documentación
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC5
  - verify: pnpm check

## Riesgos

- R1: El alcance de `specty check` y el de `task done` divergen — los dos usan `evaluateTaskScope` y `scopeRulesFrom` del core, sin reglas propias.
- R2: El catálogo de casos cuenta de menos o de más en un framework raro — solo compara el mismo archivo antes y después, y solo avisa.

## Cierre

### Resumen

`specty check --spec [id]` suma las verificaciones del plan aprobado de un cambio, el activo si no se da el id:

- `spec-approved`: la spec está aprobada y sin tocar; el cierre no cuenta.
- `scope`: los archivos tocados y borrados están dentro del alcance, con las mismas reglas que `task done`.
- `fix-tests`: cada `fix` activa o hecha trae un test suyo.
- `tests-removed`: avisa, sin bloquear, de los tests borrados o con menos casos.

El contexto de cada verificación sabe ahora qué borra el diff y cómo era cada archivo en el punto de partida. El core cuenta los casos de un test con un catálogo por familia de frameworks. Sobre este mismo cambio, `specty check --spec` dio todo en verde, salvo `secrets`, que no corrió por no haber escáner.

### Desviaciones

- `planProvider` no recibe verificaciones de fuera: cuando no hay cambio, solo trae `spec-approved`, y las demás reciben el plan ya cargado. Así `plan-tests.ts` importa de `plan.ts` solo un tipo y no hay un import circular.
- `scope` cuenta también los archivos borrados, como hace `task done`; el diseño solo hablaba de los del diff.

### Decisiones

- `--spec` sin id usa el cambio activo de la carpeta, para que `task done` (corte 8) lo llame sin repetir el id.
- `--spec` con `--all` se rechaza con un mensaje y sale con 1, porque sin el diff del cambio no hay alcance que comparar.
- `tests-removed` da siempre avisos; su nivel en `checks.levels` solo sirve para apagarlo.

### Pendientes

- El cambio siguiente: `allowedDependencies` en la spec y la verificación de las dependencias nuevas en los manifiestos (`package.json`, `pubspec.yaml`).
- Un comentario HTML sin cerrar en el cuerpo de una spec se traga el resto del archivo: `propose` solo dice que faltan secciones, sin señalar la línea.
- `execute` guarda solo los últimos 512 KB de stdout: un diff mayor pierde sus primeros archivos (que entonces cuentan enteros) y un archivo preparado mayor se leería cortado.
- `isTestFile` no reconoce los tests unitarios de Rust dentro de `src/` ni los `*.cy.ts` de Cypress.
- Arreglar el flujo de las épicas: su tarjeta en `implementing` y la regla de una sesión por worktree con sus cortes.
- `packages/cli/src/commands/init.ts` sigue con 307 líneas de código.
