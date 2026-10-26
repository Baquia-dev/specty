---
kind: standard
follows:
  - 20261026-las-capas-en-c
---

# Los tests de Maven, Gradle y SwiftPM cuentan junto a su código

## Objetivo

Los tests de la estructura estándar de Maven y Gradle (`src/test/<lenguaje>/…`) cuentan como tests del código de `src/main/<lenguaje>/…`, y los de SwiftPM (`Tests/<Módulo>Tests/…`) como tests de `Sources/<Módulo>/…`. Así una tarea de Java, Kotlin o Swift puede tocar sus tests sin pedir alcance, y `fix-tests` reconoce el test de una tarea `fix`. Lo destapó el montaje de los ejemplos por stack del plan.

## Fuera de alcance

- Los proyectos de test aparte de .NET (`tests/Shop.Tests/…` frente a `src/Shop/…`): el nombre del proyecto no sigue una regla fija.
- Cambiar qué es un archivo de test: solo cambia de qué carpetas puede serlo.

## Supuestos

- A1: Una carpeta de test espejo (`test`, `tests`…) se refleja también en `main`, como en `src/test/java/com/acme/app` → `src/main/java/com/acme/app`, además de en `lib`, `src`, `app` y la raíz, como hasta ahora.
  - impacto: alto
- A2: Un test bajo `Tests/<Módulo>Tests/` se refleja en `Sources/<Módulo>/`, con el resto de su ruta. Es la convención de SwiftPM, y no afecta a otros lenguajes porque exige las dos carpetas con esos nombres.
  - impacto: alto

## Criterios de aceptación

- AC1: CUANDO una tarea tiene `src/main/java/com/acme/app/Cart.java` en su alcance ENTONCES puede tocar `src/test/java/com/acme/app/CartTest.java` sin ampliación, y lo mismo con `kotlin`.
- AC2: CUANDO una tarea tiene `Sources/Shop/Cart.swift` en su alcance ENTONCES puede tocar `Tests/ShopTests/CartTests.swift` sin ampliación.
- AC3: CUANDO el test es de otra carpeta del espejo (`src/test/java/com/acme/other/…`) ENTONCES sigue fuera del alcance.

## Archivos

- modificar packages/core/src/scope/tests.ts — los espejos de Maven, Gradle y SwiftPM
- modificar packages/core/test/scope/scope.test.ts — sus casos
- modificar docs/ARCHITECTURE.md — los tests implícitos de cada convención

## Tareas

- [x] T1: Los espejos de Maven, Gradle y SwiftPM
  - files: packages/core/src/scope/tests.ts, packages/core/test/scope/scope.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/scope/scope.test.ts
- [x] T2: Los tests implícitos en ARCHITECTURE
  - files: docs/ARCHITECTURE.md
  - ac: AC1, AC2
  - verify: pnpm check
  - type: docs

## Cierre

### Resumen

Los tests de Maven y Gradle (`src/test/<lenguaje>/…`) cuentan como tests de `src/main/<lenguaje>/…`, y los de SwiftPM (`Tests/<Módulo>Tests/…`) como tests de `Sources/<Módulo>/…`, también dentro de un paquete. Un test de otra carpeta del espejo sigue fuera del alcance. ARCHITECTURE §8 describe cada espejo.

### Desviaciones

Ninguna.

### Decisiones

- `main` se suma a las raíces de código del espejo que ya había (`lib`, `src`, `app` y la raíz), así que el espejo de Maven y Gradle sale del mismo cálculo.
- El espejo de SwiftPM exige `Tests` seguido de una carpeta `<Módulo>Tests`, con mayúsculas, para no tocar a otros lenguajes.
- Cada espejo vive en su propia función, para que `subjectDirectories` siga dentro de los límites de función.

### Pendientes

Ninguno.
