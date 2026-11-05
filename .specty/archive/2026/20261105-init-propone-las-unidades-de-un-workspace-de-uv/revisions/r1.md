---
kind: standard
epic: 20261105-unidades-de-mas-workspaces
slice: C5
allowedDependencies:
  - smol-toml
---

# init propone las unidades de un workspace de uv

## Objetivo

Desde C1, `proposedUnits` prueba en orden una lista de detectores de workspace, pero un monorepo de Python con un workspace de uv no recibe unidades. Con este corte, `specty init` en un workspace de uv con al menos dos miembros con tests propone, en su tarjeta, una unidad con las comprobaciones estáticas detectadas y una por miembro que ejecuta `uv run --package <nombre> pytest <carpeta>` con la carpeta del miembro, las de los miembros de los que depende y los archivos de la raíz que comparten.

## Fuera de alcance

- Un workspace cuyo `pyproject.toml` de la raíz es también un proyecto (`[project]` junto a `[tool.uv.workspace]`): la carpeta de ese miembro es la raíz entera, así que no recibe propuesta, como en Cargo y Go.
- Otros ejecutores de tests que no son pytest (`unittest`, `tox`, `nox`) y los workspaces de Poetry, PDM o Hatch.
- Los workspaces de Cargo, Gradle y Dart y la documentación de qué workspaces reciben la propuesta: son C2, C4, C6 y C7.

## Supuestos

- A1: El detector de uv encuentra un workspace cuando el `pyproject.toml` de la raíz tiene la tabla `[tool.uv.workspace]` y no `[project]`. Sus miembros son las carpetas de `members`, con sus globs expandidos con `expand` como los de pnpm, menos las de `exclude`, expandidas igual, que tienen un `pyproject.toml` con `project.name`. Con menos de dos miembros no encuentra workspace, para dejar el repositorio a un detector posterior.
  - impacto: alto
- A2: Un miembro tiene tests si tiene una carpeta `tests`, y su unidad ejecuta `uv run --package <nombre> pytest <carpeta>` desde la raíz, con el nombre que declara su `project.name`.
  - impacto: alto
- A3: Un miembro depende de otro cuando una de sus listas `project.dependencies`, `project.optional-dependencies`, `dependency-groups` o `tool.uv.dev-dependencies` tiene un requisito cuyo nombre, normalizado como en PEP 503 (minúsculas y cada tramo de `-`, `_` y `.` como un `-`), es el del otro; los demás requisitos no cuentan, y no hace falta que `tool.uv.sources` lo marque con `workspace = true`.
- A4: Los archivos de la raíz que comparten todos los miembros son los que existen de `pyproject.toml`, `uv.lock`, `.python-version`, `pytest.ini` y `conftest.py`.
- A5: `smol-toml` 1.9.1, que ya está en el lockfile como dependencia de knip, entra en las `devDependencies` de la CLI y `expand` de `detect/project.ts` se exporta, con las mismas líneas que C2, que hace lo mismo en paralelo; esbuild la empaqueta en `dist/specty.mjs`.
- A6: El detector de uv va en `DETECTORS` detrás de los de JavaScript y Go; un repositorio con varios workspaces recibe la propuesta del primero que encuentra uno.

## Criterios de aceptación

- AC1: CUANDO se ejecuta `specty init` en un workspace de uv con al menos dos miembros con tests ENTONCES propone una unidad por miembro con `uv run --package <nombre> pytest <carpeta>` y las carpetas de los miembros de los que depende, y no propone nada con menos de dos miembros con tests o con un proyecto en la raíz.

## Diseño

- CLI, `detect/units-uv.ts` (nuevo, como `units-go.ts`): `uvWorkspace(root)`, el detector, que lee el `pyproject.toml` de la raíz con `smol-toml`, expande `members` y `exclude` con `expand`, lee el `pyproject.toml` de cada miembro y devuelve sus paquetes como `WorkspacePackage` con el nombre normalizado, `tests` según su carpeta `tests`, su `command` y los nombres normalizados de los requisitos que son miembros, sin gestor, y los archivos compartidos que existen. Un TOML que no se puede leer cuenta como ausente.
- CLI, `detect/project.ts`: `expand` pasa a exportarse.
- CLI, `detect/workspace-units.ts`: `DETECTORS` pasa a `[jsWorkspace, goWorkspace, uvWorkspace]`.

## Archivos

- modificar packages/cli/package.json — `smol-toml` en `devDependencies`
- modificar pnpm-lock.yaml — la dependencia nueva de la CLI
- modificar packages/cli/src/detect/project.ts — exportar `expand`
- crear packages/cli/src/detect/units-uv.ts — el detector de los workspaces de uv
- modificar packages/cli/src/detect/workspace-units.ts — añadir el detector de uv a `DETECTORS`, tras el de Go
- crear packages/cli/test/units-uv.test.ts — la propuesta de `specty init` en un workspace de uv y lo que lee de sus archivos

## Tareas

- [ ] T1: init propone las unidades de un workspace de uv
  - files: packages/cli/package.json, pnpm-lock.yaml, packages/cli/src/detect/project.ts, packages/cli/src/detect/units-uv.ts, packages/cli/src/detect/workspace-units.ts, packages/cli/test/units-uv.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/units-uv.test.ts test/workspace-units.test.ts test/init-units.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: feat

## Riesgos

- R1: C2 añade `smol-toml`, exporta `expand` y cambia la línea de `DETECTORS` en paralelo — las dos primeras son las mismas líneas y git las une solas; la de `DETECTORS` se resuelve al incorporar main con todos los detectores tras el de JavaScript, y el lector de TOML de los dos detectores puede quedar en uno después.
