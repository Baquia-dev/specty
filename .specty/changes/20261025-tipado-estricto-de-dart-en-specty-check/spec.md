---
kind: standard
follows:
  - 20261024-codigo-generado-al-dia
---

# Tipado estricto de Dart en specty check

## Objetivo

En un proyecto Dart o Flutter, `specty check` falla si el analizador no está en modo estricto (`strict-casts`, `strict-inference` y `strict-raw-types` en `analysis_options.yaml`, propios o traídos por sus `include`) o si el cambio añade un `// ignore:` o un `// ignore_for_file:`, que apagan el analizador. Así el modo estricto no depende de que el agente lo respete.

## Fuera de alcance

- Escribir o corregir `analysis_options.yaml`: es de la instalación con diff y confirmación (corte 6); la verificación dice qué falta.
- Las opciones de los paquetes de un monorepo de Dart: solo se mira el `analysis_options.yaml` de la raíz.
- El escáner de imports de Dart para `layers`: es el cambio siguiente.

## Supuestos

- A1: Los modos estrictos van en `analyzer.language` con valor `true`; `include` es un URI o una lista, `package:<paquete>/<ruta>` o una ruta relativa al archivo que lo incluye, y lo propio pisa lo incluido, según la documentación de Dart.
  - impacto: alto
- A2: Un `package:` se resuelve con `.dart_tool/package_config.json`: el `rootUri` del paquete (absoluto o relativo a `.dart_tool/`) más su `packageUri` (`lib/` por defecto) más la ruta; sin ese archivo (falta `dart pub get`) no se puede saber qué trae.
  - impacto: alto
- A3: Un comentario apaga el analizador si empieza por `ignore:` o `ignore_for_file:`, como `// ignore: invalid_assignment` o `// ignore_for_file: type=lint`.

## Criterios de aceptación

- AC1: CUANDO falta `analysis_options.yaml`, o le falta alguno de los tres modos, o alguno está en `false` ENTONCES `specty check` sale con 1 y muestra `FALLA dart-strict` con `analysis_options.yaml` y qué modos faltan.
- AC2: CUANDO los tres modos están en `true`, en el archivo o en un `include` que se resuelve (un `package:` por `.dart_tool/package_config.json` o una ruta relativa) ENTONCES pasa; lo propio pisa lo incluido.
- AC3: CUANDO un `include` no se resuelve y los modos no aparecen en lo que sí se lee ENTONCES `dart-strict` solo avisa, diciendo qué no encuentra y que falta `dart pub get`.
- AC4: CUANDO el cambio añade `// ignore:` o `// ignore_for_file:` en un archivo `.dart` ENTONCES muestra `ruta:línea` con que apaga el analizador en esa línea o en el archivo; uno que ya estaba no cuenta con `--changed`.
- AC5: CUANDO el repositorio no tiene stack Dart ENTONCES `dart-strict` no aparece; el idioma inglés da los mensajes en inglés.

## Diseño

- `core/src/checks/dart.ts`, puro: `analyzerIgnores(texto)` da `{ line, scope }` por cada comentario que apaga el analizador, con `splitCode`.
- `cli/src/check/dart.ts`: `dartProvider` con `dart-strict`. Resuelve la cadena de `include` (como mucho cinco niveles y sin ciclos), aplica lo propio sobre lo incluido y suma los comentarios de las líneas añadidas.
- `commands/check.ts` añade el proveedor de Dart junto al de TypeScript.

## Archivos

- crear packages/core/src/checks/dart.ts — los comentarios que apagan el analizador de Dart
- modificar packages/core/src/index.ts — exportarlos
- crear packages/core/test/checks/dart.test.ts — sus formas
- crear packages/cli/src/check/dart.ts — el proveedor de Dart y `dart-strict`
- modificar packages/cli/src/commands/check.ts — añadir el proveedor de Dart
- crear packages/cli/test/check-dart.test.ts — la verificación de punta a punta
- modificar docs/formats.md — la verificación `dart-strict`
- modificar docs/ARCHITECTURE.md — lo que trae hoy `specty check`

## Tareas

- [x] T1: Los comentarios que apagan el analizador
  - files: packages/core/src/checks/dart.ts, packages/core/src/index.ts, packages/core/test/checks/dart.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/checks/dart.test.ts
- [ ] T2: La verificación `dart-strict`
  - files: packages/cli/src/check/dart.ts, packages/cli/src/commands/check.ts, packages/cli/test/check-dart.test.ts
  - ac: AC1, AC2, AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-dart.test.ts
- [ ] T3: La documentación
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC1
  - verify: pnpm check

## Riesgos

- R1: Un paquete de opciones conocido cambia de forma (`very_good_analysis`, `flutter_lints`) — se lee lo que trae de verdad, por su `package_config.json`, no una lista de paquetes que se suponen estrictos.
