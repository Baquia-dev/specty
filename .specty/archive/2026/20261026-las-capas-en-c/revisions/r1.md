---
kind: standard
follows:
  - 20261026-las-capas-en-java-kotlin-y-php
---

# Las capas en C#

## Objetivo

La verificación `layers` vigila también los `using` de C#, con un escáner propio del core y sin herramientas. Así quedan cubiertos los nueve stacks del plan. Es la tercera y última parte del quinto corte del plan para los stacks más populares.

## Fuera de alcance

- Los nombres totalmente cualificados escritos en el código sin `using`.
- F# y Visual Basic.
- Las capas por proyecto de la solución (`.csproj`): `layers` sigue decidiendo por las rutas de los archivos.

## Supuestos

- A1: Cuentan `using A.B;`, `global using`, `using static A.B.C;` y los alias `using X = A.B.C;`, en cualquier línea del archivo. No cuentan las declaraciones `using var x = …;` ni las sentencias `using (…)`.
  - impacto: alto
- A2: Los namespaces del proyecto salen de las declaraciones `namespace A.B` (con llaves o de archivo) de sus archivos `.cs`. Un `using` cuyo nombre, o el nombre sin su último tramo (un tipo de `using static` o de un alias), es uno de ellos va a `<carpeta>/*.cs`, la carpeta del primer archivo que lo declara. Cualquier otro es el paquete con su nombre completo (`Microsoft.EntityFrameworkCore`), que `Microsoft.EntityFrameworkCore*` cubre.
  - impacto: alto

## Criterios de aceptación

- AC1: CUANDO un archivo de C# de una capa importa con `using` otra capa que no está en su `may`, o un paquete de sus `forbiddenPackages` ENTONCES `layers` falla con su ruta y la línea del `using`.
- AC2: CUANDO el `using` va a la misma capa, a un namespace sin capa o a un paquete permitido, ya estaba antes del cambio, o es una declaración `using var` ENTONCES no falla.
- AC3: CUANDO se leen las guías ENTONCES `layers` dice cómo se leen los `using` de C# y cómo se nombran sus paquetes.

## Archivos

- crear packages/core/src/checks/imports-csharp.ts — el escáner de C# y el índice de namespaces
- modificar packages/core/src/index.ts — exportarlo
- modificar packages/core/test/checks/imports.test.ts — su caso
- modificar packages/cli/src/check/layer-scanners.ts — su escáner, con los namespaces de los archivos `.cs`
- modificar packages/cli/src/check/layers.ts — C# entre los lenguajes de la verificación
- modificar packages/cli/test/check-layers-scanned.test.ts — la verificación en C#
- modificar docs/checks.md — `layers` en C#
- modificar docs/checks.en.md — lo mismo, en inglés
- modificar docs/formats.md — su escáner

## Tareas

- [ ] T1: El escáner de C# en el core
  - files: packages/core/src/checks/imports-csharp.ts, packages/core/src/index.ts, packages/core/test/checks/imports.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/checks/imports.test.ts
- [ ] T2: La verificación con su escáner
  - files: packages/cli/src/check/layer-scanners.ts, packages/cli/src/check/layers.ts, packages/cli/test/check-layers-scanned.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-layers-scanned.test.ts test/check-layers.test.ts test/check-layers-dart.test.ts
- [ ] T3: C# en las guías y en formats
  - files: docs/checks.md, docs/checks.en.md, docs/formats.md
  - ac: AC3
  - verify: pnpm check
  - type: docs
