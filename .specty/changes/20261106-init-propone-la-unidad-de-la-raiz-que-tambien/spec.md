---
kind: standard
---

# init propone la unidad de la raíz que también es un paquete

## Objetivo

Hoy `specty init` no propone unidades de verificación en un workspace de Cargo cuyo `Cargo.toml` de la raíz es también un paquete (`[workspace]` con `[package]`, P170), ni en uno de uv cuyo `pyproject.toml` de la raíz es también un proyecto (`[project]`), algo habitual en uv: la carpeta de ese paquete es la raíz entera, y su unidad lo cubriría todo. Con este cambio, la raíz recibe su propia unidad, con por `paths` lo que hay en la raíz fuera de las carpetas de los miembros, además de una por miembro. De paso, los detectores de Cargo y de uv comparten un solo lector de TOML (P172).

## Fuera de alcance

- Los otros workspaces (`go.work`, Gradle, pub o melos) con la raíz como paquete: siguen sin propuesta; podrían usar después el mismo mecanismo.
- Escribir las unidades en `.specty/config.yaml`: `init` solo las propone.
- Afinar los `paths` de la raíz por lenguaje (las carpetas que Cargo descubre por convención, o los módulos de Python).

## Supuestos

- A1: Los `paths` de la unidad de la raíz son todas las entradas de la raíz que no son carpetas de miembros ni ocultas (las que empiezan por `.`), las carpetas con `/**`, más las carpetas de los miembros de los que depende y los archivos compartidos. Incluye de más, como `docs/**`, y entonces esa unidad corre sin hacer falta, pero nunca deja fuera algo que lean sus tests. Una carpeta ignorada como `target/` puede salir, sin efecto: la huella de una unidad solo lee los archivos que git no ignora.
  - impacto: alto
- A2: Una carpeta que contiene miembros sin serlo, como `crates/`, se recorre: entran sus otras entradas, no ella entera.
- A3: La raíz de uv se prueba con `uv run --package <nombre> pytest tests` cuando tiene una carpeta `tests`, y no con `pytest .`, que recogería los tests de todos los miembros. La raíz cuenta como uno de los dos paquetes que hacen falta.
  - impacto: alto
- A4: La unidad de la raíz se llama como su paquete (en uv, con el nombre normalizado), porque su carpeta no tiene nombre propio; si un miembro depende de la raíz, su unidad lleva los `paths` de la raíz y no `**`.

## Criterios de aceptación

- AC1: CUANDO un paquete del workspace trae sus propios `paths` ENTONCES su unidad lleva esos `paths` en lugar de `<carpeta>/**`, la de un paquete que depende de él también los lleva, ninguna repite una ruta, y la unidad del paquete de la raíz se llama como el paquete.
- AC2: CUANDO `specty init` corre en un workspace de Cargo cuyo `Cargo.toml` de la raíz tiene `[workspace]` y `[package]` ENTONCES propone, además de una unidad por miembro, una para la raíz con `cargo test -p <nombre>` y por `paths` las entradas de la raíz fuera de las carpetas de los miembros y de las ocultas, las carpetas de los miembros de los que depende y los archivos compartidos.
- AC3: CUANDO `specty init` corre en un workspace de uv cuyo `pyproject.toml` de la raíz tiene `[project]` y una carpeta `tests` ENTONCES propone, además de una unidad por miembro con tests, una para la raíz con `uv run --package <nombre> pytest tests` y los `paths` de AC2, también con un solo miembro con tests.

## Diseño

- Core (`units-proposal.ts`): `WorkspacePackage` gana `paths?`, lo que lee el paquete cuando su carpeta no es solo suya. `proposeUnits` usa `paths ?? ["<carpeta>/**"]` para el paquete y para los que usa, quita las rutas repetidas, y el nombre de la unidad del paquete en `.` es el del paquete.
- CLI: `detect/toml.ts` con `readToml(ruta)`, `table(valor)` y `strings(valor)`, que usan los dos detectores (P172). `detect/root-package.ts` con `rootPackagePaths(root, miembros)`: recorre la raíz con `readdir` y devuelve las rutas de A1 y A2, ordenadas. `units-cargo.ts` y `units-uv.ts` leen la raíz como un miembro más en `.` cuando es un paquete, con esos `paths`.

## Archivos

- crear packages/cli/src/detect/toml.ts — el lector de TOML que comparten Cargo y uv
- modificar packages/cli/src/detect/units-cargo.ts — usa el lector común y propone la raíz que es un paquete
- modificar packages/cli/src/detect/units-uv.ts — usa el lector común y propone la raíz que es un proyecto
- crear packages/cli/src/detect/root-package.ts — los `paths` de un paquete en la raíz del workspace
- modificar packages/core/src/units-proposal.ts — `paths` propios de un paquete y el nombre de la unidad de la raíz
- modificar packages/core/test/units-proposal.test.ts — los criterios de los `paths` propios
- modificar packages/cli/test/units-cargo.test.ts — la raíz que es un paquete; el caso de la raíz sale del test que esperaba que no hubiera workspace
- modificar packages/cli/test/units-uv.test.ts — la raíz que es un proyecto; su caso sale del test que esperaba que no hubiera propuesta
- modificar docs/formats.md — `verify.units`: la propuesta para la raíz de Cargo y de uv

## Tareas

- [ ] T1: Un paquete del workspace con sus propios paths
  - files: packages/core/src/units-proposal.ts, packages/core/test/units-proposal.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/units-proposal.test.ts && pnpm lint
  - type: feat
- [ ] T2: La raíz de Cargo que también es un paquete recibe su unidad
  - files: packages/cli/src/detect/root-package.ts, packages/cli/src/detect/units-cargo.ts, packages/cli/test/units-cargo.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/units-cargo.test.ts test/init-units-cargo.test.ts && pnpm lint
  - type: feat
- [ ] T3: La raíz de uv que también es un proyecto recibe su unidad
  - files: packages/cli/src/detect/units-uv.ts, packages/cli/test/units-uv.test.ts, docs/formats.md
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/units-uv.test.ts test/workspace-units.test.ts && pnpm lint
  - type: feat
- [ ] T4: Un solo lector de TOML para los detectores de Cargo y uv
  - files: packages/cli/src/detect/toml.ts, packages/cli/src/detect/units-cargo.ts, packages/cli/src/detect/units-uv.ts
  - ac: —
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/units-cargo.test.ts test/units-uv.test.ts test/init-units-cargo.test.ts test/workspace-units.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: refactor

## Riesgos

- R1: Los `paths` de la raíz incluyen de más y su unidad corre más de lo necesario — es una propuesta que la persona recorta antes de pegarla; la tarjeta ya pide comprobarla.
