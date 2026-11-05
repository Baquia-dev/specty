---
kind: standard
epic: 20261105-verificacion-por-unidades
slice: C3
---

# Este repositorio verifica por unidades

## Objetivo

Desde los cortes C1 y C2, la verificación completa ejecuta solo las unidades de `verify.units` que no pasaron ya con su huella. La persona ya escribió las de este repositorio en `.specty/config.yaml` (9ed6ce9): estático, core, exporters, vscode, ui y cli, cada una con su paquete, los paquetes de los que depende y los archivos de la raíz que leen sus tests. Con este cambio, un test vigila que esa configuración cumple lo que promete: un cambio que solo toca `packages/ui` no vuelve a ejecutar los tests del CLI, y entre todas las unidades ejecutan los pasos de `pnpm check`. AGENTS.md pide mantener sus `paths` al día. Es el corte C3 de la épica `20261105-verificacion-por-unidades` (AC9 de la épica).

## Fuera de alcance

- Cambiar `.specty/config.yaml`: lo gestiona Specty y lo edita la persona; los huecos que encuentre este cambio quedan como pendientes para ella.
- `checks.testTime` y los informes JUnit de Vitest: son el corte C5.
- `specty verify --fresh`: es el corte C4.
- El CI, que sigue ejecutando `pnpm check` entero.

## Supuestos

- A1: Las unidades de este repositorio ya están en `.specty/config.yaml` de main, escritas por la persona, y este cambio no las toca: el guard no deja al agente editar ese archivo. El test lee la configuración del repositorio con `loadConfig`, como la CLI.
  - impacto: alto
- A2: El test de AC1 ejecuta la aceptación de verdad en un repositorio temporal con las unidades de este repositorio (sus nombres, su orden y sus `paths`), pero con comandos que solo dejan una marca, porque ejecutar `pnpm check` dentro de un test tardaría minutos. Comprueba, con la huella real de `flow/units.ts`, que los `paths` de la unidad cli no casan con los archivos de `packages/ui`.
  - impacto: alto
- A3: Ejecutar los pasos de `pnpm check` quiere decir que cada paso del script `check` del `package.json` de la raíz, salvo `pnpm test`, está en el comando de alguna unidad, y que cada paquete de `packages/` con script `test` tiene una unidad con `pnpm --filter <su nombre> test`. evals queda fuera, como en `pnpm test`.
- A4: Si un test lee un archivo de fuera de su paquete que no está en los `paths` de su unidad, la verificación completa puede saltarlo. Ningún test lo detecta solo: AGENTS.md lo pide, y el CI lo ejecuta todo.

## Criterios de aceptación

- AC1: CUANDO se acepta en este repositorio un cambio que solo toca `packages/ui` y las unidades ya pasaron con el código de antes ENTONCES la verificación completa vuelve a ejecutar solo estático y ui, y no ejecuta los tests del CLI.
- AC2: CUANDO se leen las unidades de `.specty/config.yaml` ENTONCES entre todas ejecutan los pasos de `pnpm check`: lint, tipos, fuentes, knip y los tests de cada paquete de `packages/`.

## Diseño

- `packages/cli/test/repo-units.test.ts` (nuevo) lee `.specty/config.yaml` de la raíz del repositorio con `loadConfig(repoPaths(…))`. Para AC1, monta un repositorio temporal con un archivo en cada paquete y las unidades de la configuración, con comandos que anotan su nombre en `.git/marks`. Acepta un cambio quick que toca `packages/ui/src/main.ts` y luego otro que lo vuelve a tocar, como el AC2 de `accept-units.test.ts`. Para AC2, compara los comandos de las unidades con el script `check` del `package.json` de la raíz y con los `package.json` de `packages/*`.
- AGENTS.md, en Convenciones: la verificación completa va por las unidades de `verify.units`, y un test que lee un archivo de fuera de su paquete necesita esa ruta en los `paths` de su unidad, que añade la persona.

## Archivos

- crear packages/cli/test/repo-units.test.ts — las unidades de este repositorio: AC1 y AC2
- modificar AGENTS.md — mantener al día los `paths` de las unidades

## Tareas

- [x] T1: Un test vigila las unidades de este repositorio
  - files: packages/cli/test/repo-units.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/repo-units.test.ts && pnpm --filter @baquia-dev/specty typecheck && pnpm lint && pnpm knip
  - type: test
- [ ] T2: AGENTS.md pide mantener al día los paths de las unidades
  - files: AGENTS.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: La unidad cli no lleva `LICENSE` ni `NOTICE`, que lee `bundle.test.ts`, y estático no lleva `.agents/hooks.json`, que revisa Biome — quedan como pendiente para la persona; cambian muy poco, y el CI lo ejecuta todo.
