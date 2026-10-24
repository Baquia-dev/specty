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
- [x] T4: La documentación
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC1, AC2
  - verify: pnpm check

## Riesgos

- R1: Un manifiesto con una forma poco común (dependencias por `git:` o `path:` en `pubspec.yaml`, `workspace:` en `package.json`) — solo importan los nombres, que son las claves, sea cual sea su valor.

## Cierre

### Resumen

Las specs pueden nombrar en su frontmatter las dependencias que el cambio puede añadir: `allowedDependencies`, con nombres o globs. La lista entra en el hash, así que se aprueba con la spec. `specty check --spec` trae la verificación `dependencies`: compara cada `package.json` y `pubspec.yaml` del diff con su punto de partida y falla con cada nombre nuevo que la lista no permite, con su línea. Los paquetes del SDK de Flutter y los cambios de versión no cuentan. Además, la guía de redacción de las specs estándar y rápidas le pide al agente que nombre ahí las dependencias que añadirá.

### Desviaciones

- El lector se exporta como `readsDependencies` y no como `isManifest`, porque el core ya tenía un `isManifest` en `scope/lockfiles.ts` (cualquier manifiesto, para los lockfiles y el tamaño).
- La línea de la guía de redacción (AC5) se comprueba desde el CLI, en `check-plan.test.ts`, y no en un test del core.

### Decisiones

- Un manifiesto que no se puede leer, antes o después, no da dependencias: lo señalan sus propias herramientas, y así un JSON roto en el punto de partida no convierte todas las dependencias en nuevas.
- La línea de cada dependencia se busca después de la clave de su sección, para no confundirla con un script del mismo nombre.
- `allowedDependencies` usa la misma sintaxis de globs que las rutas (`matchesAny`).

### Pendientes

- Lectores para otros ecosistemas (`requirements.txt`, `go.mod`, `Cargo.toml`, `Gemfile`, `composer.json`, `pom.xml`, `*.csproj`), con la guía para añadirlos en la documentación (corte 9).
- El corte siguiente del ADR 0012: el proveedor de TypeScript, Angular y NestJS.
- Un comentario HTML sin cerrar en el cuerpo de una spec se traga el resto del archivo: `propose` solo dice que faltan secciones, sin señalar la línea.
- `execute` guarda solo los últimos 512 KB de stdout: un diff mayor pierde sus primeros archivos (que entonces cuentan enteros) y un archivo preparado mayor se leería cortado.
- `isTestFile` no reconoce los tests unitarios de Rust dentro de `src/` ni los `*.cy.ts` de Cypress.
- Arreglar el flujo de las épicas: su tarjeta en `implementing` y la regla de una sesión por worktree con sus cortes.
- `packages/cli/src/commands/init.ts` sigue con 307 líneas de código.
