---
kind: standard
follows:
  - 20261027-cada-criterio-se-comprueba-con-un-test-que-lleva
---

# El id de un criterio solo cuenta en el nombre de un test o en un comentario

## Objetivo

Hoy `criteria-tested` y la matriz de aceptación cuentan el id de un criterio en cualquier línea de un archivo de test, también en los datos de un fixture. En el repositorio de Specty, AC1 salía con 45 líneas, casi todas de specs de ejemplo, y un criterio sin test pasaba por probado. Con este cambio, el id solo cuenta en el nombre de un test o en un comentario, y la matriz enseña como mucho 3 tests por criterio.

## Fuera de alcance

- Contar los casos de Ginkgo, `describe` o `t.Run` en `tests-removed`: `testCases` no cambia.
- Un id en un comentario al final de una línea de código, o en una anotación encima de la que declara el test (`@DisplayName` antes de `@Test`).
- Marcar `test: manual` en el criterio de documentación del cambio anterior, que ya está archivado.

## Supuestos

- A1: El nombre de un test está en la línea que lo declara a él o a su grupo: el catálogo de `testCases` (`it(`, `test(`, `def test_`, `func Test`, `@Test`, `[Fact]`, `#[test]`…), más `describe`, `context` y `suite`, los nodos de Ginkgo (`It`, `Describe`, `Entry`…), los subtests de Go (`t.Run("…"`) y `test "…"` de Elixir.
  - impacto: alto
- A2: Si la línea que declara el test es una anotación (empieza por `@`, `[` o `#[`), el nombre está en las anotaciones que la siguen y en la primera línea que no lo es, la firma: `@Test` y luego `void addsAC1()`.
- A3: Un comentario es una línea entera de comentario, como las que `testCases` ya no cuenta como casos (`//`, `/*`, `*`, `#`, `--`).
- A4: Con 3 tests se ve que un criterio está probado; del resto basta con saber cuántos son.

## Criterios de aceptación

- AC1: CUANDO una línea de test lleva el id de un criterio en el nombre de un test o de su grupo, en una anotación o firma tras una declaración que es una anotación, o en un comentario ENTONCES `criterionMarks` la cuenta, y `criteria-tested` y la matriz la ven en cada stack de los ejemplos de `specty check`.
- AC2: CUANDO el id solo aparece en otra línea de un test, como los datos de un fixture o el cuerpo de un test ENTONCES ni `criteria-tested` ni la matriz de aceptación lo cuentan.
- AC3: CUANDO un criterio tiene más de 3 tests ENTONCES la matriz de aceptación enseña los 3 primeros, por archivo y línea, y cuántos más hay.
- AC4: CUANDO se leen docs/checks.md, docs/checks.en.md, docs/formats.md y docs/ARCHITECTURE.md ENTONCES dicen dónde cuenta el id de un criterio y que la matriz enseña como mucho 3 tests por criterio.
  - test: manual

## Diseño

- `criterionMarks` en `checks/markers.ts` solo mira las líneas que nombran un test o son un comentario. Esas líneas las da un recorrido por el texto con el catálogo `CASES` de `testCases` más el de los grupos y subtests (`NAMED`). Tras una declaración que es una anotación, también nombran el test las anotaciones siguientes y la firma.
- `criteriaTestLines` en `cards/criteria.ts` enseña los 3 primeros tests de cada criterio y «y N más» / «and N more».

## Archivos

- modificar packages/core/src/checks/markers.ts — `criterionMarks` solo en nombres y comentarios
- modificar packages/core/src/cards/criteria.ts — como mucho 3 tests por criterio
- modificar docs/checks.md — dónde cuenta el id
- modificar docs/checks.en.md — dónde cuenta el id
- modificar docs/formats.md — dónde cuenta el id en `criteria-tested`
- modificar docs/ARCHITECTURE.md — §13: dónde cuenta el id y el límite de la matriz

## Tareas

- [x] T1: El id solo cuenta en el nombre de un test o en un comentario
  - files: packages/core/src/checks/markers.ts
  - ac: AC1, AC2, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/checks/markers.test.ts && pnpm --filter @baquia-dev/specty exec vitest run test/criteria-tests.test.ts test/check-examples-ts.test.ts test/check-examples-flutter.test.ts test/check-examples-jvm.test.ts test/check-examples-native.test.ts test/check-examples-scripting.test.ts
  - type: fix
  - notes: actualiza la regla en docs/checks.md, docs/checks.en.md, docs/formats.md y ARCHITECTURE §13.
- [ ] T2: La matriz enseña como mucho 3 tests por criterio
  - files: packages/core/src/cards/criteria.ts
  - ac: AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards
  - type: fix
  - notes: documenta el límite en ARCHITECTURE §13.

## Riesgos

- R1: Un test cuyo nombre no está en ninguna de esas líneas deja de contar y da un aviso. Mitigación: es solo un aviso, el id en un comentario siempre cuenta, y la tarjeta pide el id en el nombre del test.
- R2: Una línea de datos justo después de una anotación que declara un test cuenta como su firma. Mitigación: solo pasa con anotaciones (`@`, `[`, `#[`), y lo habitual es que la firma esté justo ahí.
