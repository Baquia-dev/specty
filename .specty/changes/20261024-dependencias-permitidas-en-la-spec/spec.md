---
kind: standard
follows:
  - 20261024-specty-check-spec-aprobacion-alcance-y-tests
---

# Dependencias permitidas en la spec

## Objetivo

Una spec puede nombrar en su frontmatter las dependencias que el cambio está autorizado a añadir (`allowedDependencies`), y `specty check --spec` falla con cada dependencia nueva de un manifiesto (`package.json`, `pubspec.yaml`) que no esté ahí. Como el frontmatter entra en el hash, la lista queda aprobada con la spec y el agente no puede ampliarla sin una nueva aprobación.

## Fuera de alcance

- Los manifiestos de otros ecosistemas (`requirements.txt`, `go.mod`, `Cargo.toml`, `Gemfile`, `composer.json`, `pom.xml`, `*.csproj`): el catálogo queda listo para añadirlos, y la guía para hacerlo llega con la documentación (corte 9).
- Vigilar los cambios de versión de una dependencia que ya estaba, o las que se quitan: solo cuentan las nuevas.
- Instalar dependencias o tocar los lockfiles.

## Supuestos

- A1: Una dependencia nueva es un nombre que aparece en el manifiesto y no estaba en él en el punto de partida de la ejecución (el merge-base con `--changed`, HEAD con `--staged`); en `package.json` cuentan `dependencies`, `devDependencies`, `peerDependencies` y `optionalDependencies`, y en `pubspec.yaml`, `dependencies` y `dev_dependencies` salvo las del SDK (`sdk: flutter`).
  - impacto: alto
- A2: Un manifiesto se reconoce por su nombre de archivo en cualquier carpeta, así que un monorepo con varios `package.json` queda cubierto.
- A3: `allowedDependencies` admite nombres exactos y globs (`@angular/*`), con la misma sintaxis que las rutas de Specty.
- A4: Un manifiesto que no se puede leer (JSON o YAML roto) no da dependencias: falla el lint o la instalación, no esta verificación.

## Criterios de aceptación

- AC1: CUANDO el frontmatter de una spec tiene `allowedDependencies: [zod, "@angular/*"]` ENTONCES `propose` la acepta, la escribe igual al serializar la spec y forma parte de su hash.
- AC2: CUANDO el diff añade a un `package.json` o un `pubspec.yaml` una dependencia que no está en `allowedDependencies` ENTONCES `specty check --spec` muestra `FALLA dependencies` con `ruta:línea dependencia nueva sin permiso en la spec: <nombre>`.
- AC3: CUANDO la dependencia nueva está en `allowedDependencies`, o casa con uno de sus globs, o solo cambia de versión, o es del SDK de Flutter ENTONCES no cuenta.
- AC4: CUANDO el idioma es inglés ENTONCES el hallazgo está en inglés.
- AC5: CUANDO el agente redacta una spec estándar o rápida ENTONCES la tarjeta le dice que nombre en `allowedDependencies` las dependencias que añadirá.

## Diseño

- `Frontmatter` gana `allowedDependencies` (opcional, una lista de textos), que `readFrontmatter` lee y `serializeFrontmatter` escribe solo si no está vacía.
- `core/src/checks/dependencies.ts`, puro: un catálogo de lectores por nombre de manifiesto y `addedDependencies(ruta, antes, ahora)`, que devuelve cada nombre nuevo con su línea.
- `cli/src/check/dependencies.ts` define la verificación `dependencies` del plan: por cada manifiesto de la ejecución compara el texto de partida (`before`) con el actual (`read`) y deja fuera lo permitido; `planProvider` la añade.

## Archivos

- modificar packages/core/src/spec/model.ts — `allowedDependencies` en el frontmatter
- modificar packages/core/src/spec/frontmatter.ts — leerlo y validarlo
- modificar packages/core/src/spec/serialize.ts — escribirlo
- modificar packages/core/test/spec/parse.test.ts — leer y escribir `allowedDependencies`
- modificar packages/core/test/spec/arbitraries.ts — el campo en el roundtrip de specs
- crear packages/core/src/checks/dependencies.ts — los lectores de manifiestos y las dependencias nuevas
- modificar packages/core/src/index.ts — exportar `addedDependencies`
- crear packages/core/test/checks/dependencies.test.ts — cada manifiesto y sus casos
- modificar packages/core/src/cards/text.ts — la línea de `allowedDependencies` al redactar
- crear packages/cli/src/check/dependencies.ts — la verificación `dependencies`
- modificar packages/cli/src/check/plan.ts — añadirla al proveedor del plan
- modificar packages/cli/test/check-plan.test.ts — la verificación de punta a punta
- modificar docs/formats.md — el campo del frontmatter y la verificación
- modificar docs/ARCHITECTURE.md — `dependencies` en la fila de `specty check`

## Tareas

- [x] T1: `allowedDependencies` en el frontmatter
  - files: packages/core/src/spec/model.ts, packages/core/src/spec/frontmatter.ts, packages/core/src/spec/serialize.ts, packages/core/test/spec/parse.test.ts, packages/core/test/spec/arbitraries.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/spec
- [x] T2: Las dependencias nuevas de un manifiesto
  - files: packages/core/src/checks/dependencies.ts, packages/core/src/index.ts, packages/core/test/checks/dependencies.test.ts, packages/core/src/cards/text.ts
  - ac: AC3, AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/checks/dependencies.test.ts
- [x] T3: La verificación `dependencies` de `--spec`
  - files: packages/cli/src/check/dependencies.ts, packages/cli/src/check/plan.ts, packages/cli/test/check-plan.test.ts
  - ac: AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-plan.test.ts
- [ ] T4: La documentación
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC1, AC2
  - verify: pnpm check

## Riesgos

- R1: Un manifiesto con una forma poco común (dependencias por `git:` o `path:` en `pubspec.yaml`, `workspace:` en `package.json`) — solo importan los nombres, que son las claves, sea cual sea su valor.
