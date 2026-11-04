---
kind: standard
---

# Un fallo solo de tipos no deja el cambio sin salida con contract

## Objetivo

Resuelve P6. Con `policy.tests: contract`, `task done` no ejecuta la comprobación de tipos del proyecto en una tarea con verificación propia, así que un error de tipos solo sale al aceptar, con la verificación completa. Entonces la tarjeta del ajuste lo clasifica como defecto y pide una tarea `fix`, que necesita un test en rojo que un fallo de tipos no tiene, y el cambio queda sin salida (pasó en `20261103-memoria-tarjeta-de-inicio`, que hubo que cancelar). Con este cambio, `propose` avisa cuando la última tarea de código no comprueba los tipos, y la tarjeta del ajuste manda un fallo solo de tipos, lint o formato a una tarea `refactor`, que no pasa por la fase de tests.

## Fuera de alcance

- Aceptar como rojo una comprobación de tipos que nombra el test nuevo (la otra idea de P6): ya funciona si la verificación de la tarea la ejecuta, y no sirve para un error de tipos del código, que no nombra ningún test.
- Que `task done` ejecute siempre la comprobación de tipos del proyecto: la verificación de la tarea es como la persona lo decide (formats.md §8).
- Avisar sin `contract`: sin la fase de tests, un ajuste corrige el fallo sin quedar sin salida.

## Supuestos

- A1: La comprobación de tipos del proyecto es la que ya usa `specty check` (`checks.commands.typecheck` o la que detecta del stack), y basta con buscar ese comando, o `verify.full`, como texto dentro de la verificación de la tarea, con `verify.quick` delante.
  - impacto: alto
- A2: Solo hace falta en la última tarea de código (`feat`, `fix`, `refactor` o `perf`, en el orden de la spec): con `contract` todos los tests se escriben antes, y en las primeras tareas la comprobación de tipos falla por los módulos que aún no existen.
  - impacto: alto
- A3: Un fallo solo de tipos, lint o formato no cambia lo que hace el código, así que su ajuste es un `refactor`: con `contract` no necesita un test nuevo, su contrato son los tests que ya existen.

## Criterios de aceptación

- AC1: CUANDO se valida, con `policy.tests: contract`, una spec standard o quick cuya última tarea de código tiene una verificación sin la comprobación de tipos del proyecto ENTONCES hay un aviso `task-no-typecheck` en esa tarea que nombra el comando; no lo hay si su verificación lo incluye o incluye `verify.full`, sin `contract` ni sin comando de tipos.
- AC2: CUANDO el agente ajusta un cambio ENTONCES la tarjeta de `next`, en «CÓMO CLASIFICARLA», manda un fallo solo de tipos, lint o formato a una tarea `type: refactor` con `ac: —` y el comando que falló en su `verify`, sin test en rojo, en español y en inglés.
- AC3: CUANDO el agente ejecuta `specty propose` en un proyecto con `contract` y un script `typecheck` en su `package.json` ENTONCES la salida avisa de que la última tarea de código no ejecuta `npm run typecheck`; con ese comando en su verificación no avisa.

## Diseño

- `ValidationContext` gana `typecheck?: string`, la comprobación de tipos del proyecto, que pasa el CLI. Core no la detecta: no lee el disco.
- `checkTypecheck` en `validate/quality.ts`: con `contract`, un cambio standard o quick, el comando definido y una fase distinta de `closing`, busca la última tarea de código y su verificación (`verify.quick` y luego su `verify` o `verify.default`, como `taskVerification`). Si no contiene el comando ni `verify.full`, da `task-no-typecheck` (aviso) con `id` y el comando en `value`, un parámetro que ya pinta el test de los mensajes. Va en `RULES` tras `checkTaskQuality`.
- `flow/analysis.ts` pasa `typecheck` solo con `contract`: detecta el stack (`detectStacks`) y toma el comando con `projectCommands` de `check/commands.ts`, que pasa a exportarse.
- `adjustingCard` en `cards/work.ts` añade la línea del fallo solo de tipos, lint o formato tras la del defecto.
- `docs/formats.md` §2 añade el aviso.

## Archivos

- modificar packages/core/src/validate/quality.ts — la regla checkTypecheck
- modificar packages/core/src/validate/index.ts — la regla en RULES
- modificar packages/core/src/validate/context.ts — typecheck en el contexto
- modificar packages/core/src/spec/diagnostics.ts — el código task-no-typecheck, aviso
- modificar packages/core/src/spec/messages.es.ts — el texto del aviso en español
- modificar packages/core/src/spec/messages.en.ts — el texto del aviso en inglés
- modificar packages/core/test/validate/quality.test.ts — AC1
- modificar packages/core/src/cards/work.ts — la línea del fallo solo de tipos en la tarjeta del ajuste
- crear packages/core/test/cards/adjusting.test.ts — AC2
- modificar packages/cli/src/flow/analysis.ts — pasa la comprobación de tipos del proyecto
- modificar packages/cli/src/check/commands.ts — exporta projectCommands
- crear packages/cli/test/typecheck-warning.test.ts — AC3
- modificar docs/formats.md — el aviso en la validación

## Tareas

- [ ] T1: La validación avisa de una última tarea de código sin comprobación de tipos
  - files: packages/core/src/validate/quality.ts, packages/core/src/validate/index.ts, packages/core/src/validate/context.ts, packages/core/src/spec/diagnostics.ts, packages/core/src/spec/messages.es.ts, packages/core/src/spec/messages.en.ts, packages/core/test/validate/quality.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/validate/quality.test.ts && pnpm typecheck && pnpm lint
- [ ] T2: La tarjeta del ajuste manda un fallo solo de tipos a un refactor
  - files: packages/core/src/cards/work.ts, packages/core/test/cards/adjusting.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/adjusting.test.ts && pnpm typecheck && pnpm lint && pnpm sources
- [ ] T3: propose avisa con la comprobación de tipos que detecta, y la documentación
  - files: packages/cli/src/flow/analysis.ts, packages/cli/src/check/commands.ts, packages/cli/test/typecheck-warning.test.ts, docs/formats.md
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/typecheck-warning.test.ts && pnpm typecheck && pnpm lint && pnpm knip

## Riesgos

- R1: Un aviso en falso cuando la verificación comprueba los tipos con otro comando (un script `check` que los incluye) — se acepta también `verify.full`, y es un aviso, que no bloquea.
- R2: Detectar el stack en cada `propose` lo frena — solo con `contract`, y `detectStacks` lee unos pocos archivos.
