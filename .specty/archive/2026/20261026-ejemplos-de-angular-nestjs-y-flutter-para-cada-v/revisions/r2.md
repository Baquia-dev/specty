---
kind: standard
follows:
  - 20261026-la-guia-de-las-verificaciones-en-espanol-e-ingle
---

# Ejemplos de Angular, NestJS y Flutter para cada verificación

## Objetivo

Los tests montan un repositorio de ejemplo de Angular, otro de NestJS y otro de Flutter, y comprueban cada verificación de su stack con un caso que pasa y otro que falla. Las que necesitan una herramienta que no está instalada (dependency-cruiser en TypeScript, Betterleaks o gitleaks) se esperan «sin ejecutar», como decidió el usuario. Es el último criterio de aceptación de la tarea de las verificaciones.

## Fuera de alcance

- Añadir dependencias a Specty: el usuario eligió usar las herramientas que haya instaladas.
- Ejecutar `ng`, `nest`, `flutter analyze` o `flutter test` reales, que necesitan instalar dependencias y red.
- Los proveedores de otros stacks.

## Supuestos

- A1: Los ejemplos se montan en un repositorio temporal desde los tests, no como carpetas del repositorio: sus fallos a propósito (`it.only`, un TODO sin issue, un `any`) harían fallar el `specty check` y el lint del propio Specty. Las marcas se escriben por partes, como en los demás tests.
  - impacto: alto
- A2: En Angular y NestJS, los comandos del proyecto son los scripts de su `package.json` (`format:check`, `lint`, `typecheck`, `test`), que Specty detecta y ejecuta con npm. Son pequeños programas de Node que imitan la salida de Prettier, ESLint, tsc y el runner de tests sobre el código del ejemplo, porque las herramientas reales necesitan `node_modules`. En Flutter, `checks.commands` apunta a programas así, porque `flutter analyze` y `flutter test` necesitan el SDK y `pub get`; Flutter no tiene `typecheck`.
  - impacto: alto
- A3: Cada ejemplo es un cambio aprobado, revisado con `specty check --changed --spec --json`. El caso que pasa cambia solo lo que permite el plan. El que falla deja a la vez un fallo de cada verificación: un archivo fuera del alcance, una dependencia no permitida, una tarea fix sin test, un test borrado, la spec editada tras aprobarla, etc.
- A4: El código generado se prueba con `checks.generators` (un generador de Node con `inputs` y `outputs`), porque Prisma y build_runner necesitan instalar dependencias; su detección ya tiene tests propios.
- A5: dependency-cruiser nunca está en el `node_modules` del ejemplo, así que `layers` en Angular y NestJS se espera «sin ejecutar»; en Flutter, el escáner propio la ejecuta siempre. `secrets` se espera «sin ejecutar» sin escáner en el PATH; con uno, debe fallar con un token de GitHub construido en el test y pasar sin él.

## Criterios de aceptación

- AC1: CUANDO se ejecuta `specty check --changed --spec` en el caso que falla del ejemplo de Angular, de NestJS o de Flutter ENTONCES cada verificación de su stack falla (`tests-removed` avisa), salvo las que no pueden correr sin su herramienta, que salen «sin ejecutar».
- AC2: CUANDO se ejecuta en el caso que pasa ENTONCES todas pasan, con las mismas excepciones.
- AC3: CUANDO hay un escáner de secretos en el PATH ENTONCES `secrets` falla en el caso que falla y pasa en el otro.

## Archivos

- crear packages/cli/test/stack-examples.ts — montar un ejemplo como cambio aprobado, leer el estado de cada verificación y los programas que imitan las herramientas
- crear packages/cli/test/check-examples-ts.test.ts — los ejemplos de Angular y NestJS
- crear packages/cli/test/check-examples-flutter.test.ts — el ejemplo de Flutter
- modificar docs/checks.md — dónde están los ejemplos
- modificar docs/checks.en.md — dónde están los ejemplos

## Tareas

- [x] T1: Los ejemplos de Angular y NestJS
  - files: packages/cli/test/stack-examples.ts, packages/cli/test/check-examples-ts.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-examples-ts.test.ts
  - type: test
- [x] T2: El ejemplo de Flutter
  - files: packages/cli/test/stack-examples.ts, packages/cli/test/check-examples-flutter.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-examples-flutter.test.ts
  - type: test
- [x] T3: Dónde están los ejemplos en las guías
  - files: docs/checks.md, docs/checks.en.md
  - ac: AC1
  - verify: pnpm check
  - type: docs

## Cierre

### Resumen

Los tests montan un repositorio de ejemplo de Angular, de NestJS y de Flutter, cada uno con un cambio aprobado, y ejecutan `specty check --changed --spec --json` en dos casos. En el que respeta el plan pasan todas las verificaciones de su stack. En el que rompe cada una a la vez fallan todas, y `tests-removed` avisa. `layers` en TypeScript sale «sin ejecutar» porque falta dependency-cruiser, y `secrets`, sin escáner en el PATH. Las guías dicen dónde están los ejemplos.

### Desviaciones

- `specty check` sobre este mismo cambio encontró una clave `skip: ".skip"` en las marcas del test, que parecía un `skip:` de Dart: se renombró a `skipped`.
- knip marcó el tipo `Files` exportado sin usar, y se corrigió en T3 con una ampliación de alcance.

### Decisiones

- En Angular y NestJS, Specty detecta y ejecuta con npm los scripts de su `package.json`, que son imitaciones de Prettier, ESLint, tsc y el runner con su formato de salida. En Flutter, `checks.commands` apunta a imitaciones de `dart format`, `flutter analyze` y `flutter test`.
- `analysis_options.yaml` no está en «Archivos»: como no es un manifiesto, sería un tercer módulo y obligaría a dividir la spec. El caso que falla lo cambia fuera del alcance.
- Los tests de las marcas de prueba están lejos de la tarea fix (en `src/domain/` o `test/domain/`), para que no cuenten como su test.
- Con un escáner en el PATH, `secrets` debe fallar con un token de GitHub construido en el test. Esa rama no se ha podido probar aquí, porque no hay ningún escáner instalado.

### Pendientes

- Probar los ejemplos con Betterleaks o gitleaks instalados, y `layers` con dependency-cruiser.
