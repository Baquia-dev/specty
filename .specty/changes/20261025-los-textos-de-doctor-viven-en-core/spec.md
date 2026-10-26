---
kind: standard
follows:
  - 20261025-los-textos-de-los-hooks-y-del-commit-de-init-viv
---

# Los textos de doctor viven en core

## Objetivo

Octavo cambio de la serie que lleva a core los textos de la CLI. `doctor` arma en la CLI una línea por comprobación, con lo que está bien o lo que falta y cómo arreglarlo, sus avisos y su tarjeta. `program.ts` arma los dos rechazos de antes de abrir la sesión: fuera de un repositorio git o con un `config.yaml` no válido. La CLI pasa a decidir solo qué encontró cada comprobación (un código y sus datos), y los textos viven en `core/src/cards/doctor.ts` y, los dos rechazos, en `cards/refusals.ts`. La salida no cambia ni una letra.

## Fuera de alcance

- Qué comprueba `doctor`: solo cambia dónde viven sus textos.
- Los textos de `uninstall` y de los demás comandos, que llegan en los siguientes cambios de la serie.

## Supuestos

- A1: `supportsNode` se queda en `doctor.ts`, porque lo usa su test y decide, no escribe.

## Criterios de aceptación

- AC1: CUANDO `specty doctor` comprueba la configuración, los hooks de cada herramienta, gentle-ai, los formateadores, el comando, la verificación, Node y AGENTS.md ENTONCES cada línea, aviso, problema y SIGUIENTE es el mismo que antes y sale de `cards/doctor.ts` de core.
- AC2: CUANDO un comando se ejecuta fuera de un repositorio git o con un `.specty/config.yaml` no válido ENTONCES la tarjeta es la misma que antes y sale de core.
- AC3: CUANDO se ejecutan los tests de core ENTONCES cubren cada línea de `doctor`, su tarjeta en verde y en rojo, y los dos rechazos, en español y en inglés.

## Archivos

- crear packages/core/src/cards/doctor.ts — una línea por comprobación de doctor y su tarjeta
- modificar packages/core/src/cards/refusals.ts — los rechazos de antes de abrir la sesión
- modificar packages/core/src/cards/index.ts — exportarlos
- crear packages/core/test/cards/doctor.test.ts — tests de doctor.ts y de los rechazos
- modificar packages/cli/src/commands/doctor.ts — decidir qué encontró cada comprobación y pedir los textos a core
- modificar packages/cli/src/program.ts — los rechazos de antes de abrir la sesión, desde core

## Tareas

- [x] T1: Core tiene los textos de doctor y los rechazos de antes de abrir la sesión
  - files: packages/core/src/cards/doctor.ts, packages/core/src/cards/refusals.ts, packages/core/src/cards/index.ts, packages/core/test/cards/doctor.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-core typecheck && pnpm --filter @baquia-dev/specty-core test
  - type: refactor
- [x] T2: doctor y program piden sus textos a core
  - files: packages/cli/src/commands/doctor.ts, packages/cli/src/program.ts
  - ac: AC1, AC2
  - verify: pnpm check
  - type: refactor
