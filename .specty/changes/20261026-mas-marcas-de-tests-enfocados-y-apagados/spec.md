---
kind: standard
follows:
  - 20261026-la-deuda-que-encuentra-specty-check-all
---

# Más marcas de tests enfocados y apagados

## Objetivo

`focused-tests` y `skipped-tests` reconocen las marcas declarativas de Ginkgo, Swift Testing y Pest que hoy se les escapan. Así un test enfocado o apagado en Go, Swift o PHP falla igual que en JavaScript, Dart, Ruby, Python o la JVM, y los ejemplos de esos stacks lo demuestran.

## Fuera de alcance

- Los saltos que decide el propio test (`Skip()` de Ginkgo, `->skip($condición)` de Pest, `.enabled(if:)` de Swift Testing): siguen sin contar.
- Las marcas de otros frameworks.

## Supuestos

- A1: Según la documentación vigente, Ginkgo tiene los prefijos `F`, `P` y `X` para `It`, `Specify`, `Describe`, `Context`, `When`, `DescribeTable`, `DescribeTableSubtree` y `Entry`, y los decoradores `Focus` y `Pending` como argumento de esos nodos; Swift Testing apaga sin condición con `.disabled()` y `.disabled("motivo")`; Pest enfoca con `->only()` y apaga sin condición con `->skip()` y `->skip('motivo')`.
  - impacto: alto
- A2: Solo cuentan las formas sin argumentos o con un texto como motivo: el `$request->only([...])` de Laravel, el `->skip(10)` de una consulta y el `.disabled(isLoading)` de SwiftUI llevan otros argumentos y no son tests.
  - impacto: alto
- A3: El ejemplo de PHP pasa a Pest y el de Swift a Swift Testing, que son hoy lo habitual en esos stacks; los saltos que no cuentan quedan descritos en la guía.

## Criterios de aceptación

- AC1: CUANDO un test de Go añade `FIt`, `FSpecify`, `FDescribeTableSubtree` o el decorador `Focus`, o uno de PHP añade `->only()` ENTONCES `focused-tests` lo marca.
- AC2: CUANDO un test añade `PIt`, `XIt`, `PDescribe` o el decorador `Pending` de Ginkgo, `.disabled()` o `.disabled("motivo")` de Swift Testing, o `->skip()` o `->skip('motivo')` de Pest ENTONCES `skipped-tests` lo marca.
- AC3: CUANDO un test usa `->only([...])`, `->skip(10)`, `->skip($condición, 'motivo')`, `.disabled(isLoading)` o `.enabled(if:)` ENTONCES no cuenta como enfocado ni apagado.
- AC4: CUANDO el cambio que lo rompe todo llega a los ejemplos de Go, PHP y Swift ENTONCES `skipped-tests` falla en los tres y `focused-tests` también en Go y PHP.
- AC5: CUANDO alguien lee la guía y formats.md ENTONCES encuentra las marcas nuevas y los ejemplos de PHP con Pest y de Swift con Swift Testing.

## Archivos

- modificar packages/core/src/checks/markers.ts — las marcas de Ginkgo, Swift Testing y Pest
- modificar packages/core/test/checks/markers.test.ts — sus casos
- modificar packages/cli/test/check-examples-scripting.test.ts — el ejemplo de PHP, con Pest
- modificar packages/cli/test/check-examples-native.test.ts — Go con sus marcas y el ejemplo de Swift, con Swift Testing
- modificar docs/checks.md — las marcas y los ejemplos
- modificar docs/checks.en.md — lo mismo en inglés
- modificar docs/formats.md — las marcas de `focused-tests`

## Tareas

- [x] T1: Las marcas en el catálogo
  - files: packages/core/src/checks/markers.ts, packages/core/test/checks/markers.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/checks/markers.test.ts
- [ ] T2: Los ejemplos de Go, PHP y Swift
  - files: packages/cli/test/check-examples-scripting.test.ts, packages/cli/test/check-examples-native.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-examples-scripting.test.ts test/check-examples-native.test.ts
  - type: test
- [ ] T3: Las marcas en la documentación
  - files: docs/checks.md, docs/checks.en.md, docs/formats.md
  - ac: AC5
  - verify: pnpm check
  - type: docs
