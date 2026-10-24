---
kind: standard
follows:
  - 20261024-capas-de-clean-architecture-con-dependency-cruis
---

# Código generado al día

## Objetivo

Cuando el cambio toca lo que alimenta un generador de código, o lo que genera, `specty check` lo ejecuta y falla si lo que está en el repositorio no coincide con lo que produce, como un `git diff --exit-code` tras regenerar. Después deja los archivos como estaban: comprueba, no reescribe. Detecta el cliente de Prisma con su propia carpeta de salida y build_runner en Dart, y `checks.generators` añade los de cualquier otro stack.

## Fuera de alcance

- Regenerar y dejar el resultado: Specty solo comprueba; regenerar lo hace la persona o el agente con el comando que el hallazgo nombra.
- El cliente de Prisma en `node_modules` (`prisma-client-js` sin `output`): no está en el repositorio, así que no hay nada que comparar.
- Los generadores de otros stacks sin configurar (OpenAPI, protobuf, GraphQL…): se añaden en `checks.generators`.

## Supuestos

- A1: Prisma se detecta en un stack TypeScript o JavaScript con `prisma` entre sus dependencias, por los bloques `generator` de `prisma/schema.prisma`, `schema.prisma` o `prisma/schema/*.prisma` que tienen `output`, relativo al archivo del schema; se ejecuta con el gestor del proyecto (`npx prisma generate`, `pnpm exec prisma generate`, `yarn prisma generate` o `bunx prisma generate`).
  - impacto: alto
- A2: build_runner se detecta en un stack Dart con `build_runner` en el `pubspec.yaml`, y se ejecuta con `dart run build_runner build --delete-conflicting-outputs`; genera lo que dice `scope.generated` o, sin él, `*.g.dart`, `*.freezed.dart`, `*.gr.dart` y `*.mocks.dart`.
  - impacto: alto
- A3: Un generador corre con `--changed` o `--staged` si un archivo de la ejecución es uno de sus orígenes (el schema de Prisma; en Dart, un archivo que declara un `part` generado, o `pubspec.yaml` o `build.yaml`; los `inputs` de uno configurado, o cualquier archivo si no los tiene) o una de sus salidas; con `--all`, siempre.
- A4: Las salidas que cuentan son las que git ve (seguidas o nuevas sin ignorar), igual que `git diff --exit-code`; una salida ignorada no está en el repositorio. Se comparan byte a byte antes y después, y se restauran sus contenidos: las cambiadas y las borradas vuelven, y las nuevas se borran.

## Criterios de aceptación

- AC1: CUANDO el cambio toca un origen de un generador y este produce algo distinto de lo que hay ENTONCES `specty check` sale con 1 y muestra `FALLA generated` con cada ruta y si no coincide, falta o ya no se genera, nombrando el comando.
- AC2: CUANDO termina ENTONCES cada salida tiene el contenido que tenía antes de ejecutarlo, y no queda ninguna nueva.
- AC3: CUANDO el generador produce exactamente lo que hay ENTONCES pasa; CUANDO el cambio no toca ni orígenes ni salidas ENTONCES no lo ejecuta con `--changed`, y sí con `--all`.
- AC4: CUANDO el comando falla ENTONCES `generated` no corre y `--verbose` muestra el comando y su error.
- AC5: CUANDO el proyecto usa Prisma con `output` o build_runner ENTONCES detecta su comando y sus salidas sin configurarlo; sin ningún generador, `generated` no aparece.
- AC6: CUANDO `checks.generators` define uno con `command`, `outputs` y, si quiere, `inputs` ENTONCES lo usa además de los detectados; el idioma inglés da los mensajes en inglés.

## Diseño

- `core/src/schema/checks.ts`: `checks.generators`, una lista de `{ command, outputs, inputs? }`.
- `cli/src/check/generated.ts`: `detectGenerators(session, stacks)` da los generadores (configurados y detectados), cada uno con su comando, sus salidas y cuándo corre; `generatedProvider(generators)` trae la verificación `generated`, que por cada generador que toca guarda sus salidas, lo ejecuta con la shell en la raíz, compara y restaura.
- `commands/check.ts` detecta los generadores en cada ejecución y añade el proveedor.

## Archivos

- modificar packages/core/src/schema/checks.ts — `checks.generators`
- modificar packages/core/src/index.ts — exportar el tipo del generador
- crear packages/cli/src/check/generated.ts — detectar los generadores y la verificación `generated`
- modificar packages/cli/src/commands/check.ts — añadir el proveedor del código generado
- crear packages/cli/test/check-generated.test.ts — un generador configurado, Prisma y build_runner
- modificar docs/formats.md — `checks.generators` y la verificación
- modificar docs/ARCHITECTURE.md — lo que trae hoy `specty check`

## Tareas

- [ ] T1: La verificación `generated` y sus generadores
  - files: packages/core/src/schema/checks.ts, packages/core/src/index.ts, packages/cli/src/check/generated.ts, packages/cli/src/commands/check.ts, packages/cli/test/check-generated.test.ts
  - ac: AC1, AC2, AC3, AC4, AC5, AC6
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-generated.test.ts
- [ ] T2: La documentación
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC6
  - verify: pnpm check

## Riesgos

- R1: Un generador escribe también fuera de sus salidas (cachés, `.dart_tool`) — eso queda ignorado por git o fuera del repositorio, y solo se restaura lo que se compara.
- R2: build_runner tarda — solo corre cuando el cambio toca un archivo con un `part` generado, el `pubspec.yaml` o el `build.yaml`, y su nivel se baja en `checks.levels`.
