---
kind: standard
follows:
  - 20261025-tipado-estricto-de-dart-en-specty-check
---

# Capas en Dart con un escáner de imports

## Objetivo

La verificación `layers` funciona también en Dart y Flutter, sin herramientas externas: un escáner propio lee los `import` y `export` de cada archivo `.dart` y la regla de capas del core decide, con las mismas `checks.layers` que en TypeScript. Un dominio que importa `package:flutter/…`, la infraestructura o la UI falla igual que en un proyecto Angular o NestJS.

## Fuera de alcance

- Los `part` y `part of`: son la misma biblioteca, no un import.
- Resolver los paquetes de un workspace de varios `pubspec.yaml`: un `package:` de otro paquete del repositorio cuenta como paquete, no como archivo.
- Los ciclos entre bibliotecas.

## Supuestos

- A1: Un import de Dart es una directiva `import` o `export` al principio de una línea de código (fuera de comentarios), con su URI entre comillas simples o dobles en esa línea; en un import condicional cuenta el URI principal.
  - impacto: alto
- A2: `package:<nombre>/<ruta>` con el `name` del `pubspec.yaml` de la raíz es el archivo `lib/<ruta>`; con otro nombre, el paquete `<nombre>`; `dart:io` es el paquete `dart:io`; y una ruta relativa se resuelve desde la carpeta del archivo.
  - impacto: alto
- A3: En un repositorio solo de Dart, `layers` no necesita dependency-cruiser; en uno con TypeScript y Dart, dependency-cruiser solo hace falta para los archivos TypeScript o JavaScript.

## Criterios de aceptación

- AC1: CUANDO en un proyecto Dart con `checks.layers` un archivo del dominio importa uno de la infraestructura (por `package:` del propio paquete o por ruta relativa) ENTONCES `specty check` sale con 1 y muestra `FALLA layers` con `ruta:línea` y `` `domain` no puede importar `infrastructure` (lib/…) ``.
- AC2: CUANDO importa un paquete de sus `forbiddenPackages` (`flutter`, `dart:io`) ENTONCES lo muestra como paquete; un import comentado, uno dentro de la misma capa o un `part` no cuentan.
- AC3: CUANDO un repositorio solo de Dart no tiene dependency-cruiser ENTONCES `layers` corre igual; con `--changed` solo cuentan los imports de líneas añadidas, y con `--all`, todos.
- AC4: CUANDO el idioma es inglés ENTONCES los mensajes están en inglés.

## Diseño

- `core/src/checks/dart.ts` gana `dartImports(ruta, texto, paquete)`, que da los imports ya resueltos (`{ from, specifier, target }` o `{ from, specifier, package }`) para `layerViolations`.
- `cli/src/check/layers.ts` se aplica también a un stack Dart: reparte los archivos de la ejecución entre los de Dart, que lee con el escáner, y los de TypeScript o JavaScript, que siguen yendo a dependency-cruiser; el nombre del paquete sale del `pubspec.yaml`.

## Archivos

- modificar packages/core/src/checks/dart.ts — el escáner de imports de Dart
- modificar packages/core/src/index.ts — exportarlo
- modificar packages/core/test/checks/dart.test.ts — sus formas de import
- modificar packages/cli/src/check/layers.ts — las capas también en Dart
- crear packages/cli/test/check-layers-dart.test.ts — las capas de Dart de punta a punta
- modificar docs/formats.md — `layers` en Dart
- modificar docs/ARCHITECTURE.md — lo que trae hoy `specty check`

## Tareas

- [x] T1: El escáner de imports de Dart
  - files: packages/core/src/checks/dart.ts, packages/core/src/index.ts, packages/core/test/checks/dart.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/checks/dart.test.ts
- [x] T2: `layers` en Dart
  - files: packages/cli/src/check/layers.ts, packages/cli/test/check-layers-dart.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-layers-dart.test.ts test/check-layers.test.ts
- [x] T3: La documentación
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC3
  - verify: pnpm check

## Riesgos

- R1: Una directiva escrita en varias líneas con el URI en la segunda no se ve — el formateador de Dart deja el URI en la línea de `import`, y `dart format` corre en la misma ejecución.
