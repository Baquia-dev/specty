---
kind: standard
---

# init ofrece instalar ccusage para medir el consumo de cada cambio

## Objetivo

Specty mide lo que consume cada cambio al cerrarlo, pero solo si encuentra ccusage, y hoy hay que instalarlo a mano. No viaja con Specty: es un binario nativo por plataforma, y descargarlo con `npx` escribiría en la carpeta del usuario.

La primera vez que una persona ejecuta `specty init`:
- en un proyecto de Node, le pregunta si quiere medir el consumo y, si acepta, añade ccusage como dependencia de desarrollo con el gestor del proyecto;
- si no es de Node, o lo ejecuta un agente, explica cómo instalarlo.

## Fuera de alcance

- Instalar ccusage de forma global: lo hace la persona si quiere.
- Que `specty doctor` avise de que falta.

## Supuestos

- A1: La versión que Specty conoce es ccusage 20.0.45; se fija para que su JSON sea el que Specty lee.
- A2: En la raíz de un workspace de pnpm, `pnpm add` necesita `-w`.

## Criterios de aceptación

- AC1: CUANDO una persona ejecuta `specty init` por primera vez en un proyecto de Node (pnpm, npm, yarn o bun) que no tiene ccusage ENTONCES le pregunta si medir el consumo de cada cambio. Si acepta, lo añade como dependencia de desarrollo con su gestor (`pnpm add -D ccusage@20.0.45`, con `-w` en un workspace de pnpm), lo dice, y el commit de init lleva su `package.json`.
- AC2: CUANDO la persona no acepta ENTONCES no se instala nada; CUANDO el comando falla ENTONCES un aviso da el comando para ejecutarlo después.
- AC3: CUANDO quien ejecuta init es un agente, o el proyecto no es de Node ENTONCES no pregunta ni instala: un aviso dice cómo instalarlo, con el comando de su gestor o, fuera de Node, `npm i -g ccusage@20.0.45`.
- AC4: CUANDO el proyecto ya tiene ccusage, la configuración ya existía o es `--dry-run` ENTONCES no pregunta ni avisa.

## Diseño

- Core, `cards/usage.ts`: la pregunta, la línea de lo hecho, el aviso de fallo y el que explica cómo instalarlo, en español y en inglés.
- CLI, `install/usage.ts`:
  - `usageTool(setup)` da lo hecho, lo escrito y los avisos.
  - Busca un stack de TypeScript o JavaScript con `pnpm`, `npm`, `yarn` o `bun`.
  - Mira si `package.json` ya tiene ccusage.
  - Pregunta solo a una persona y solo si la configuración se acaba de crear.
  - Ejecuta el comando del gestor sin shell. Lo escrito es `package.json` y el lockfile que exista.
- `install/install.ts` junta este paso con los hooks y el servidor MCP.
- ARCHITECTURE §13 y §14: el ofrecimiento de init.

## Archivos

- crear packages/core/test/cards/ccusage.test.ts — los textos
- modificar packages/core/src/cards/usage.ts — los textos de init
- modificar packages/core/src/cards/index.ts — los exporta
- crear packages/cli/test/init-usage.test.ts — AC1 a AC4 con un gestor falso
- crear packages/cli/src/install/usage.ts — el paso de init
- modificar packages/cli/src/install/install.ts — lo llama
- modificar docs/ARCHITECTURE.md — §13 y §14

## Tareas

- [x] T1: Los textos del ofrecimiento de ccusage
  - files: packages/core/test/cards/ccusage.test.ts, packages/core/src/cards/usage.ts, packages/core/src/cards/index.ts
  - ac: AC1, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/ccusage.test.ts test/cards/usage.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint
- [ ] T2: init ofrece instalar ccusage o explica cómo
  - files: packages/cli/test/init-usage.test.ts, packages/cli/src/install/usage.ts, packages/cli/src/install/install.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/init-usage.test.ts test/setup.test.ts && pnpm --filter @baquia-dev/specty typecheck && pnpm lint && pnpm knip
- [ ] T3: ARCHITECTURE cuenta el ofrecimiento
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: Sin red, el gestor falla y init se alarga. Mitigación: init sigue y deja el aviso con el comando (AC2).
- R2: Otra versión de ccusage cambia su JSON. Mitigación: init fija la versión, y Specty, si no entiende la respuesta, cierra sin consumo.
