---
kind: standard
---

# init toma del CI los comandos que no deduce del proyecto

## Objetivo

La detección de `init` saca los comandos del proyecto (tests, lint y tipos) de su pila: los scripts de `package.json` o los de cada lenguaje que Specty conoce. Un proyecto en un lenguaje que Specty no conoce, o que no tiene alguno de esos comandos en su pila, se queda sin ellos, aunque su CI los ejecute en cada push. Desde este cambio, la detección también lee los comandos del CI del proyecto y con ellos rellena lo que la pila no da. Es lo que ARCHITECTURE §17 deja pendiente («Falta leer los comandos del CI»).

## Fuera de alcance

- Que el CI sustituya un comando que la pila ya da: los proyectos que ya tienen sus comandos siguen igual.
- Los comandos de build y de check del CI, porque esas palabras significan cosas distintas según la herramienta (`docker build`, `cargo check`).
- Interpretar expresiones o variables del CI (`${{ matrix.node }}`, `$CI_JOB`) y los pasos `uses:`.
- Cambiar una configuración que ya existe: `init` solo escribe `verify` al crearla, como hoy.

## Supuestos

- A1: Los comandos del CI se reconocen por palabras genéricas, sin conocer cada herramienta: tests si una palabra es `test` o `tests` o termina en `test` (`pytest`, `ctest`, `unittest`); lint si es `lint`, `analyze` o `analyse`; tipos si es `typecheck` o `type-check`. Una palabra con `:` cuenta por cada parte (`test:unit`).
  - impacto: alto
- A2: Los comandos están en los valores de las claves `run`, `script` y `command`, en cualquier nivel del YAML: ahí los ponen GitHub Actions, GitLab CI, CircleCI, Bitbucket Pipelines y Azure Pipelines. Un bloque de varias líneas cuenta línea a línea, y una línea con `&&` o `;`, por cada comando.
  - impacto: alto
- A3: No cuentan los comandos que no se ejecutan igual en local o que preparan el entorno: los que tienen `$`, una palabra `install`, `add` o `uses`, los comentarios y las líneas que siguen en la siguiente (`\` al final).
- A4: Los archivos se leen por nombre, y cada uno en el orden de su YAML; gana el primer comando de cada categoría.

## Criterios de aceptación

- AC1: CUANDO un proyecto sin una pila que Specty conozca tiene un workflow de GitHub Actions que ejecuta sus tests y su lint ENTONCES la detección da esos comandos, y con ellos `verify.default` y `verify.full`.
- AC2: CUANDO la pila ya da un comando de una categoría ENTONCES se queda el de la pila, y el CI solo rellena las categorías que faltan.
- AC3: CUANDO el CI es de GitLab, CircleCI, Bitbucket o Azure ENTONCES sus `script` y `command` cuentan igual que los `run` de GitHub.
- AC4: CUANDO un comando del CI usa una variable o una expresión, instala dependencias o sigue en la línea siguiente ENTONCES no cuenta.

## Diseño

- `detect/ci.ts`: `ciCommands(root)` lee `.github/workflows/*.yml` y `*.yaml`, `.gitlab-ci.yml`, `.circleci/config.yml`, `bitbucket-pipelines.yml` y `azure-pipelines.yml`, recoge sus comandos (A2, A3) y los clasifica en `Commands` (`test`, `lint` y `typecheck`; A1, A4).
- `detectProject` mezcla los dos con la pila por encima: `{ ...ci, ...pila }`.
- Lo usa todo lo que ya usa la detección: `verify` y los hechos de AGENTS.md en `init`, `doctor` y los comandos de `specty check`.

## Archivos

- crear packages/cli/src/detect/ci.ts — los comandos del CI del proyecto
- modificar packages/cli/src/detect/project.ts — la pila por encima del CI
- crear packages/cli/test/detect-ci.test.ts — AC1–AC4 con repositorios de prueba
- modificar docs/ARCHITECTURE.md — §7 (hechos del proyecto) y §17 (lo portado del legacy)

## Tareas

- [x] T1: init toma del CI los comandos que no deduce del proyecto
  - files: packages/cli/src/detect/ci.ts, packages/cli/src/detect/project.ts, packages/cli/test/detect-ci.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm typecheck && pnpm lint && pnpm knip && pnpm --filter @baquia-dev/specty exec vitest run test/detect-ci.test.ts test/detect-quality.test.ts
  - type: feat

## Riesgos

- R1: Una palabra genérica clasifica mal un comando, por ejemplo un script `lint-staged` o un `run: ./scripts/test-e2e.sh` lento como tests. Mitigación: la pila sigue por encima, solo se rellena lo que falta, y la persona ve y puede cambiar `verify` en `config.yaml`.
