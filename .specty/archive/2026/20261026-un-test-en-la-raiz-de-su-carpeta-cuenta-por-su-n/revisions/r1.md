---
kind: standard
follows:
  - 20261026-mas-marcas-de-tests-enfocados-y-apagados
---

# Un test en la raíz de su carpeta cuenta por su nombre en fix-tests

## Objetivo

Hoy `fix-tests` da por buena una tarea `fix` con cualquier test de la carpeta que refleja la de su código. Un test justo en la raíz de la carpeta de tests (`tests/user.rs`, `test/legacy_test.dart`) refleja la raíz del código entero, así que cuenta como test de cualquier módulo de esa raíz, y una corrección pasa sin su test. En esa raíz, un test pasa a contar solo para el archivo de su mismo nombre.

## Fuera de alcance

- `scope` y la ampliación automática: tocar un test sigue estando permitido por carpeta.
- Los tests de carpetas más profundas, junto al código o en `__tests__`: siguen contando por carpeta.

## Supuestos

- A1: El nombre de un test es el de su archivo sin extensiones ni las marcas de test de su nombre (`test_`, `_test`, `.test`, `.spec`, `_spec`, `Test`, `Tests`, `Spec`, `IT`), sin distinguir mayúsculas: `tests/test_cart.py`, `test/cart_test.dart`, `tests/cart.rs` y `CartTests.swift` se llaman `cart`.
  - impacto: alto
- A2: La raíz de una carpeta de tests es la carpeta espejo sin subcarpetas (`tests/`, `packages/a/test/`) y, en SwiftPM, la del target de tests (`Tests/ShopTests/`).
  - impacto: alto
- A3: Un alcance con comodines (`src/**`) cubre una carpeta entera, así que cualquier test de su espejo sigue contando para él.

## Criterios de aceptación

- AC1: CUANDO una tarea `fix` tiene `src/cart.rs` y el diff solo trae `tests/user.rs` ENTONCES `fix-tests` falla.
- AC2: CUANDO el diff trae `tests/cart.rs`, `tests/test_cart.py` para `src/cart.py`, `test/cart_test.dart` para `lib/cart.dart` o `Tests/ShopTests/CartTests.swift` para `Sources/Shop/Cart.swift` ENTONCES `fix-tests` pasa.
- AC3: CUANDO el test está en una subcarpeta del espejo (`tests/domain/test_other.py` para `src/domain/user.py`), junto al código o el alcance es un comodín ENTONCES cuenta como antes, y `scope` sigue permitiendo cualquier test del espejo.
- AC4: CUANDO el ejemplo de Rust usa la estructura plana (`tests/user.rs`) y el cambio rompe el plan ENTONCES `fix-tests` falla, y el `specty check` del repositorio ya no marca el comentario del ejemplo nativo.
- AC5: CUANDO alguien lee `fix-tests` en la guía y en formats.md ENTONCES sabe que en la raíz de la carpeta de tests cuenta el nombre.

## Archivos

- modificar packages/core/src/scope/tests.ts — el test de una tarea, por su nombre en la raíz del espejo
- modificar packages/core/src/index.ts — exportarlo
- modificar packages/core/test/scope/scope.test.ts — sus casos
- modificar packages/cli/src/check/plan-tests.ts — `fix-tests` lo usa
- modificar packages/cli/test/check-examples-native.test.ts — Rust con la estructura plana y el comentario sin la marca
- modificar docs/checks.md — la regla de `fix-tests`
- modificar docs/checks.en.md — lo mismo en inglés
- modificar docs/formats.md — lo mismo en §6

## Tareas

- [ ] T1: El test de una tarea, por su nombre en la raíz del espejo
  - files: packages/core/src/scope/tests.ts, packages/core/src/index.ts, packages/core/test/scope/scope.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/scope/scope.test.ts
- [ ] T2: fix-tests lo usa, con el ejemplo de Rust plano
  - files: packages/cli/src/check/plan-tests.ts, packages/cli/test/check-examples-native.test.ts
  - ac: AC1, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-examples-native.test.ts test/check-plan.test.ts
- [ ] T3: La regla en la documentación
  - files: docs/checks.md, docs/checks.en.md, docs/formats.md
  - ac: AC5
  - verify: pnpm check
  - type: docs
