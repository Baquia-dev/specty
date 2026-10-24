---
kind: standard
---

# Presupuesto de la tarjeta de tarea

## Objetivo

ARCHITECTURE §7 promete una tarjeta de tarea de unos 1.500 tokens, pero ningún código la mide. Lo que la hace crecer son los resúmenes de las tareas hechas y los hallazgos, que se repiten en cada tarjeta siguiente y hoy no tienen límite. En los cambios archivados, el bloque HECHO de la última tarjeta llega a unos 940 tokens, con resúmenes de casi 1.000 caracteres. Este cambio sostiene el presupuesto y corrige lo que §7 dice del Mapa y las Convenciones de AGENTS.md, que no genera la detección.

## Fuera de alcance

- Contar tokens en `propose`: aún no existen los resúmenes ni los hallazgos que hacen crecer la tarjeta, y cada modelo tokeniza distinto.
- Acortar los resúmenes ya archivados.
- Que `doctor` avise de un Mapa o unas Convenciones vacíos.

## Supuestos

- A1: 300 caracteres bastan para un resumen o un hallazgo, una o dos frases. El detalle ya está en el commit, en el diff y, si hace falta, en la spec.
- A2: Para un presupuesto aproximado basta con estimar los tokens como caracteres ÷ 4. Specty no depende de ningún modelo, y cada uno tokeniza distinto.

## Criterios de aceptación

- AC1: CUANDO el agente ejecuta `task done` con un resumen o un hallazgo de más de 300 caracteres ENTONCES Specty lo rechaza antes de verificar, dice cuántos caracteres tiene y pide decirlo en una frase. Con 300 o menos, todo sigue como siempre.
- AC2: CUANDO se construye la tarjeta de tarea más grande razonable ENTONCES cabe en unos 1.500 tokens, estimados como caracteres ÷ 4. Esa tarjeta tiene 8 tareas, 5 archivos, 3 criterios largos, 4 hallazgos y resúmenes al máximo. Si los textos de la tarjeta crecen, el test falla.
- AC3: CUANDO alguien lee ARCHITECTURE §7 ENTONCES encuentra cómo se sostiene el presupuesto, y que el Mapa y las Convenciones los completa la persona.
- AC4: CUANDO alguien lee `formats.md` ENTONCES encuentra el límite del resumen y de los hallazgos de `task.completed`.

## Diseño

- Core, `cards/work.ts`: `NOTE_MAX = 300`, junto a la tarjeta que repite los resúmenes y los hallazgos; se exporta para la CLI.
- CLI, `task.ts`: al comprobar que el resumen y los hallazgos no estén vacíos, comprueba también que no pasen de `NOTE_MAX`. Así se rechaza antes de verificar y el reintento es barato.
- Core, `test/cards/budget.test.ts`: la tarjeta más grande razonable, con los resúmenes y los hallazgos al máximo, y su estimación de tokens.

## Archivos

- modificar packages/core/src/cards/work.ts — `NOTE_MAX`
- modificar packages/core/src/index.ts — exportar `NOTE_MAX`
- modificar packages/cli/src/commands/task.ts — rechazar resúmenes y hallazgos largos
- modificar packages/cli/test/findings.test.ts — tests del rechazo
- crear packages/core/test/cards/budget.test.ts — el presupuesto de la tarjeta
- modificar docs/ARCHITECTURE.md — §7: el presupuesto y lo que genera la detección
- modificar docs/formats.md — §4: el límite del resumen y de los hallazgos

## Tareas

- [x] T1: Resúmenes y hallazgos de 300 caracteres como máximo
  - files: packages/core/src/cards/work.ts, packages/core/src/index.ts, packages/cli/src/commands/task.ts, packages/cli/test/findings.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/findings.test.ts
- [x] T2: El test del presupuesto de la tarjeta
  - files: packages/core/test/cards/budget.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/budget.test.ts
  - type: test
- [x] T3: Documentar el presupuesto y lo que genera la detección
  - files: docs/ARCHITECTURE.md, docs/formats.md
  - ac: AC3, AC4
  - verify: pnpm check
  - type: docs
