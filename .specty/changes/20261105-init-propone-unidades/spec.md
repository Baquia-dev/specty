---
kind: standard
---

# init propone las unidades de verificación de un workspace

## Objetivo

La verificación completa solo salta lo que no cambió si `.specty/config.yaml` da `verify.units`, y hoy la persona las escribe a mano, con los `paths` de cada paquete y de los paquetes de los que depende. En un workspace de JavaScript o TypeScript, Specty ya detecta los paquetes (la línea «Paquetes» de AGENTS.md). Con este cambio, `specty init` propone en su tarjeta las unidades de un workspace de pnpm, npm o yarn: una con las comprobaciones estáticas detectadas y una por paquete con tests, con sus `paths`. No cambia la configuración: la persona revisa la propuesta y la añade.

## Fuera de alcance

- Escribir las unidades en `.specty/config.yaml`: `verify.full` suele ser un script (`check`) que Specty no sabe descomponer, y las unidades lo reemplazan.
- Otros workspaces (Cargo, `go.work`, melos, Gradle, uv): cada uno con su forma de nombrar sus paquetes y ejecutar sus tests.
- Proponerlas desde `doctor` o con un comando propio.

## Supuestos

- A1: Un workspace de pnpm (`pnpm-workspace.yaml`), o de npm o yarn (`workspaces` en el `package.json` de la raíz), con al menos dos paquetes cuyo `package.json` tiene el script `test`, recibe la propuesta. El gestor es pnpm con `pnpm-workspace.yaml`, yarn con `yarn.lock` y, si no, npm. La unidad de un paquete ejecuta sus tests con `pnpm --filter <nombre> test`, `yarn workspace <nombre> test` o `npm test --workspace=<nombre>`.
  - impacto: alto
- A2: Los `paths` de un paquete son su carpeta, las carpetas de los paquetes del workspace de los que depende, directa o indirectamente (en `dependencies`, `devDependencies`, `peerDependencies` u `optionalDependencies`), y los archivos de la raíz que existan de `package.json`, su lockfile, `pnpm-workspace.yaml`, `tsconfig.json` y `tsconfig.base.json`.
  - impacto: alto
- A3: Si se detectan los comandos de lint o de tipos, va primero una unidad con ellos (`static` en inglés, `estático` en español) y `paths: ["**"]`, porque leen todo el repositorio. Las de los paquetes siguen, de los que dependen de menos paquetes a los que dependen de más, y con el mismo número, por carpeta. Cada unidad se llama como la última parte de la carpeta de su paquete, o como la carpeta entera si dos coinciden.
- A4: La propuesta sale solo si la configuración aún no tiene `verify.units`. Va como un bloque de YAML listo para pegar bajo `verify:`, con una línea que dice que la persona la añade tras comprobar que entre todas ejecutan lo mismo que `verify.full`, porque las unidades lo reemplazan.

## Criterios de aceptación

- AC1: CUANDO se ejecuta `specty init` en un workspace de pnpm, npm o yarn con al menos dos paquetes con script `test` y la configuración no tiene `verify.units` ENTONCES la tarjeta propone una unidad con las comprobaciones estáticas detectadas y una por paquete, con el comando de sus tests y sus `paths`, también los de los paquetes de los que depende.
- AC2: CUANDO la configuración ya tiene `verify.units`, o el repositorio no es un workspace con al menos dos paquetes con tests ENTONCES `init` no propone unidades.
- AC3: CUANDO `init` propone unidades ENTONCES no las escribe en `.specty/config.yaml`, y la tarjeta dice que la persona las añade tras comprobar que entre todas ejecutan lo mismo que `verify.full`.
- AC4: CUANDO sale la propuesta ENTONCES su título y su línea salen en español y en inglés, y su YAML es una lista válida de `verify.units`.

## Diseño

- Core, `units-proposal.ts` (nuevo): `proposeUnits(facts)` da las unidades de A1–A3 a partir de los paquetes (carpeta, nombre, si tiene tests y de qué paquetes del workspace depende), el gestor, los archivos de la raíz que comparten y los comandos estáticos, o nada con menos de dos paquetes con tests; `unitsYaml(units)` las escribe como las líneas de `units:` bajo `verify:`. En la lista de `index.ts`.
- Core, `cards/init.ts`: `InitView` admite `units` (las líneas de YAML), y `initCard` las pone en su propio bloque con la línea de A4.
- CLI, `detect/workspace-units.ts` (nuevo): `proposedUnits(root, detection, lang)` lee los `package.json` de los paquetes detectados y de la raíz, el gestor y los archivos de la raíz, y devuelve las líneas de la propuesta.
- CLI, `commands/init.ts`: pasa la propuesta a la tarjeta cuando la configuración no tiene `verify.units`.
- Docs: formats.md §6 (`verify.units`: `init` las propone) y ARCHITECTURE (lo que hace `init`).

## Archivos

- crear packages/core/src/units-proposal.ts — las unidades que se proponen para un workspace
- modificar packages/core/src/index.ts — exportar la propuesta
- crear packages/core/test/units-proposal.test.ts — las unidades propuestas y su YAML
- modificar packages/core/src/cards/init.ts — el bloque de la propuesta en la tarjeta de `init`
- crear packages/core/test/cards/init-units.test.ts — el bloque en español y en inglés
- crear packages/cli/src/detect/workspace-units.ts — leer el workspace para proponer
- modificar packages/cli/src/commands/init.ts — la propuesta en la tarjeta
- crear packages/cli/test/init-units.test.ts — `init` en workspaces de pnpm, npm y yarn
- modificar docs/formats.md — `init` propone las unidades
- modificar docs/ARCHITECTURE.md — lo que hace `init`

## Tareas

- [x] T1: Las unidades que se proponen para un workspace, y su bloque en la tarjeta de init
  - files: packages/core/src/units-proposal.ts, packages/core/src/index.ts, packages/core/test/units-proposal.test.ts, packages/core/src/cards/init.ts, packages/core/test/cards/init-units.test.ts
  - ac: AC1, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/units-proposal.test.ts test/cards/init-units.test.ts
  - type: feat
- [x] T2: init propone las unidades de un workspace de pnpm, npm o yarn
  - files: packages/cli/src/detect/workspace-units.ts, packages/cli/src/commands/init.ts, packages/cli/test/init-units.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/init-units.test.ts test/setup.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: feat
- [ ] T3: La documentación de la propuesta de unidades
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: Una propuesta con `paths` cortos saltaría tests — la persona la revisa antes de añadirla, y los tests que leen archivos de fuera de su paquete no se ven en los `package.json`; la línea de la tarjeta lo pide.
