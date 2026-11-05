---
kind: standard
epic: 20261105-unidades-de-mas-workspaces
slice: C2
allowedDependencies:
  - smol-toml
---

# init propone las unidades de un workspace de Cargo

## Objetivo

Desde C1, `specty init` prueba en orden una lista de detectores de workspace, pero solo hay uno, el de pnpm, npm y yarn. Con este corte, un workspace de Cargo recibe también su propuesta de `verify.units`: una unidad con las comprobaciones estáticas detectadas y una por miembro, con `cargo test -p <nombre>`, su carpeta, las de los miembros de los que depende y los archivos de la raíz que comparten.

## Fuera de alcance

- Un workspace cuyo `Cargo.toml` de la raíz es también un paquete (`[package]` junto a `[workspace]`): la carpeta de ese paquete es la raíz entera, así que no recibe propuesta.
- Las dependencias entre miembros solo por versión, sin `path`: no cuentan, como las de un registro.
- Los detectores de Go, Gradle, uv y Dart, y la documentación de qué workspaces reciben la propuesta: son C3–C7.

## Supuestos

- A1: El detector de Cargo encuentra un workspace cuando el `Cargo.toml` de la raíz tiene la tabla `[workspace]` y no `[package]`. Sus miembros son las carpetas de `workspace.members`, con sus globs expandidos como los de pnpm, menos las de `workspace.exclude`, que tienen un `Cargo.toml` con `package.name`. Va después del de JavaScript en `DETECTORS`.
  - impacto: alto
- A2: Todos los miembros tienen tests y cada uno los ejecuta con `cargo test -p <nombre>`, como dice A3 de la épica.
- A3: Un miembro depende de otro cuando una de sus tablas `dependencies`, `dev-dependencies` o `build-dependencies`, también bajo `target.<cfg>`, tiene una entrada con `path` hacia la carpeta del otro, o con `workspace = true` y, en `workspace.dependencies` de la raíz, una entrada con `path` hacia ella. Se identifica por la carpeta, así que una dependencia renombrada con `package` cuenta igual.
- A4: Los archivos de la raíz que comparten son los que existen de `Cargo.toml`, `Cargo.lock`, `rust-toolchain.toml`, `rust-toolchain` y `.cargo/config.toml`.
- A5: `smol-toml` 1.9.1, que ya está en el lockfile como dependencia de knip, entra en las `devDependencies` de la CLI como sus otras dependencias, que esbuild empaqueta en `dist/specty.mjs`.
- A6: `expand` de `detect/project.ts`, que expande los patrones de un workspace de pnpm, se exporta para que el detector de Cargo expanda `members` igual, sin otra copia.

## Criterios de aceptación

- AC2: CUANDO se ejecuta `specty init` en un workspace de Cargo con al menos dos miembros ENTONCES propone una unidad por miembro con `cargo test -p <nombre>` y las carpetas de los miembros de los que depende.

## Diseño

- CLI, `detect/units-cargo.ts` (nuevo): `cargoWorkspace(root)` lee el `Cargo.toml` de la raíz con `smol-toml`, expande `members` con `expand`, quita `exclude` y lee el `Cargo.toml` de cada miembro. Devuelve sus paquetes con `tests: true`, `command: "cargo test -p <nombre>"` y los nombres de los miembros que usa, sin gestor, y los archivos de la raíz que existen. Un TOML que no se puede leer cuenta como ausente.
- CLI, `detect/workspace-units.ts`: `DETECTORS` pasa a ser `[jsWorkspace, cargoWorkspace]`.

## Archivos

- modificar packages/cli/package.json — `smol-toml` en `devDependencies`
- modificar pnpm-lock.yaml — la dependencia nueva de la CLI
- modificar packages/cli/src/detect/project.ts — exportar `expand`
- crear packages/cli/src/detect/units-cargo.ts — el detector de los workspaces de Cargo
- modificar packages/cli/src/detect/workspace-units.ts — el detector de Cargo, tras el de JavaScript
- crear packages/cli/test/units-cargo.test.ts — los casos del detector de Cargo e init en un workspace de Cargo

## Tareas

- [ ] T1: El detector lee los miembros de un workspace de Cargo
  - files: packages/cli/package.json, pnpm-lock.yaml, packages/cli/src/detect/project.ts, packages/cli/src/detect/units-cargo.ts, packages/cli/test/units-cargo.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/units-cargo.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: feat
- [ ] T2: init prueba el detector de Cargo tras el de JavaScript
  - files: packages/cli/src/detect/workspace-units.ts, packages/cli/test/units-cargo.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/units-cargo.test.ts test/workspace-units.test.ts test/init-units.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: feat

## Riesgos

- R1: Un repositorio que es a la vez un workspace de JavaScript y uno de Cargo, como una app de Tauri con varios paquetes de JavaScript, recibe la propuesta del de JavaScript, el primero de la lista — es la decisión de C1, y un test comprueba que el de Cargo va después.
