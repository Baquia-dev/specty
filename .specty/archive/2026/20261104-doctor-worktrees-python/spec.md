---
kind: standard
---

# doctor avisa de flake8, Pylint, isort y Black ante las worktrees

## Objetivo

El 2026-11-03 se midieron, con las versiones reales, las herramientas de otros lenguajes que faltaban ante un cambio en `.worktrees/`. Django, `dotnet watch`, `dotnet test`, `dotnet format`, Spring Boot con devtools, Pyright y RuboCop no la ven. Desde la carpeta principal sí la ven:

- flake8, Pylint e isort, que revisan los archivos del cambio;
- Black, cuando el proyecto fija su propio `exclude`;
- los recargadores de Flask y Uvicorn, que reinician el servidor con los archivos del cambio.

`doctor` pasa a decir qué añadir y dónde a las cuatro herramientas que se configuran en un archivo. El ADR 0018 recoge la medición y, para Flask y Uvicorn, que se configuran en la línea de comandos, la opción que funciona desde la carpeta principal y dentro del cambio.

## Fuera de alcance

- Avisar de Flask y Uvicorn: se configuran en la línea de comandos, que `doctor` no ve; quedan en el ADR.
- PHP, Elixir y las versiones actuales de RuboCop: sin medir (no están instalados, y Ruby es la 2.6 del sistema).
- Editar las configuraciones: `doctor` solo avisa (ADR 0018).

## Supuestos

- A1: Cada herramienta se reconoce por su archivo de configuración en la raíz, como en `detect/quality.ts`, o por su nombre en los requisitos de Python (`requirements.txt`, `pyproject.toml`, `Pipfile`); Black solo cuando su sección de `pyproject.toml` fija `exclude`.
- A2: Las exclusiones son relativas a la raíz: flake8, Pylint e isort comparan el nombre de la carpeta y Black una expresión desde la raíz del proyecto. Medido: funcionan desde la carpeta principal y dentro del cambio, también en una carpeta con paréntesis, corchetes y llaves.

## Criterios de aceptación

- AC1: CUANDO existe `.worktrees/` y flake8 se configura en `.flake8` (o en la sección `[flake8]` de `setup.cfg` o `tox.ini`) sin nombrarla ENTONCES `specty doctor` pide `.worktrees` en `extend-exclude` de esa sección y sale con 1; CUANDO la nombra ENTONCES dice que flake8 la excluye.
- AC2: CUANDO existe `.worktrees/` y Pylint se configura en `pyproject.toml` (`[tool.pylint`), en `.pylintrc` o `pylintrc`, o figura en los requisitos, sin nombrarla, ENTONCES `doctor` pide `"CVS", ".worktrees"` en `ignore` de `[tool.pylint.main]` de `pyproject.toml`, o `CVS,.worktrees` en `ignore` de `[MAIN]` de su archivo, y sale con 1; CUANDO la nombra ENTONCES dice que Pylint la excluye.
- AC3: CUANDO existe `.worktrees/` e isort se configura en `pyproject.toml` (`[tool.isort]`), en `.isort.cfg` o en la sección `[isort]` de `setup.cfg`, o figura en los requisitos, sin nombrarla, ENTONCES `doctor` pide `".worktrees"` en `extend_skip` de `[tool.isort]`, o `.worktrees` en `extend_skip` de la sección de su archivo, y sale con 1; CUANDO la nombra ENTONCES dice que isort la excluye.
- AC4: CUANDO existe `.worktrees/` y la sección `[tool.black]` de `pyproject.toml` fija `exclude` sin nombrarla ENTONCES `doctor` pide `'^/\.worktrees/'` en su `extend-exclude` y sale con 1; CUANDO esa sección no fija `exclude` ENTONCES no nombra a Black.

## Diseño

- `detect/worktree-python.ts` (nuevo): `pythonExclusions(root, entries)` devuelve las exclusiones de flake8, Pylint, isort y Black con la forma de las demás (`name`, `path`, `file`, `add`, `excluded`). Lee la sección de cada archivo INI o TOML hasta la cabecera siguiente.
- `detect/worktree-tools.ts`: `worktreeExclusions` añade las de Python a las de JavaScript; `doctor` no cambia.
- `detect/quality.ts`: exporta `requirement`, que ya reconoce un requisito de Python en los tres archivos.
- Documentación: ADR 0018 (tabla, el resultado, que ya no es solo de JavaScript, la decisión y las opciones de Flask y Uvicorn) y ARCHITECTURE (la lista de `doctor`).

## Archivos

- crear packages/cli/src/detect/worktree-python.ts — flake8, Pylint, isort y Black
- modificar packages/cli/src/detect/worktree-tools.ts — añadir las exclusiones de Python
- modificar packages/cli/src/detect/quality.ts — exportar `requirement`
- crear packages/cli/test/doctor-worktrees-python.test.ts — los avisos de las cuatro, con y sin exclusión
- modificar docs/decisions/0018-worktrees-dentro-del-repositorio.md — la medición de Python, .NET, Spring y RuboCop, el resultado y las opciones de Flask y Uvicorn
- modificar docs/ARCHITECTURE.md — lo que comprueba `doctor` ante `.worktrees/`

## Tareas

- [x] T1: `doctor` avisa de flake8, Pylint, isort y Black, y la documentación
  - files: packages/cli/src/detect/worktree-python.ts, packages/cli/src/detect/worktree-tools.ts, packages/cli/src/detect/quality.ts, packages/cli/test/doctor-worktrees-python.test.ts, docs/decisions/0018-worktrees-dentro-del-repositorio.md, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/doctor-worktrees-python.test.ts

## Riesgos

- R1: Una sección que excluye la carpeta de otra forma (por ejemplo, con un patrón más amplio) recibe el aviso igual. El aviso no bloquea nada fuera de `doctor`.

## Cierre

### Resumen

`specty doctor`, una vez que hay cambios en `.worktrees/`, avisa también de las herramientas de Python que revisan la carpeta desde la principal y dice qué añadir y dónde, en el archivo y la sección que cada una lee primero: flake8 (`extend-exclude = .worktrees` en `[flake8]` de `.flake8`, `setup.cfg` o `tox.ini`), Pylint (`ignore` en `pylintrc`, `.pylintrc` o `[tool.pylint.main]`, también si solo figura en los requisitos), isort (`extend_skip` en `.isort.cfg`, `[tool.isort]`, `setup.cfg` o `tox.ini`, también si solo figura en los requisitos) y Black cuando su sección fija un `exclude` propio (`extend-exclude = '^/\.worktrees/'`). Las exclusiones se midieron con las versiones reales desde la carpeta principal y dentro del cambio, también en una carpeta con paréntesis, corchetes y llaves. El ADR 0018 recoge la medición de Python (Django, Flask, Uvicorn, flake8, Black, Pyright, Pylint, isort), .NET, Spring Boot y RuboCop, y las opciones de línea de comandos de Flask y Uvicorn que funcionan en las dos carpetas; ARCHITECTURE, la lista de `doctor`.

### Desviaciones

- Ninguna.

### Decisiones

- Flask y Uvicorn no tienen aviso: su exclusión va en la línea de comandos, que `doctor` no ve, y un aviso sin forma de comprobarlo saldría siempre.
- `requirement` de `detect/quality.ts` se exporta para reconocer Pylint e isort por los requisitos, en vez de repetir su expresión.

### Pendientes

- Metro con Watchman, las herramientas de PHP y las versiones actuales de RuboCop, sin medir.
