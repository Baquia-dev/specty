---
kind: standard
---

# Un subagente cuyo cambio sale del tamaño de una épica se la deja a la sesión principal

## Objetivo

Un subagente que lleva un cambio pedido por el usuario y cuya spec sale demasiado grande para un cambio ya no la convierte en épica: se detiene y lo dice, y la sesión principal, cuando terminan los subagentes, entra en ese cambio y lo convierte allí en la épica. Así nadie recibe la tarjeta de una épica, que pide lanzar subagentes, con un encargo que se lo prohíbe (R2 de 20261107-cada-cambio-que-pide-el-usuario-va-a-un, P255).

## Fuera de alcance

- Guardar en el estado que un subagente creó el cambio, o cambiar el mensaje de tamaño de `propose` (`split-required`).
- El encargo de un corte de una épica: un corte demasiado grande ya recibe `slice-split-required`, que pide estrecharlo y ajustar la épica.
- Cancelar el cambio del subagente o crear otro para la épica.

## Supuestos

- A1: Basta un paso más en el encargo y otra frase en el `SIGUIENTE:` de la sesión principal, sin tocar el estado ni la validación: `new --subagent` no queda en `state.json` (solo cambia la tarjeta de `new`), así que un mensaje de tamaño propio del subagente exigiría un campo nuevo del estado en formats.md, que la validación lo leyera y un diagnóstico nuevo con sus dos textos. El encargo es la instrucción del subagente durante todo su trabajo, y el tamaño solo para a `propose` en el borrador, antes de aprobar nada, así que el paso del encargo cierra el hueco con solo texto.
  - impacto: alto
- A2: La sesión principal hace la épica en el mismo cambio del subagente, entrando en él con `specty enter <id>` y convirtiéndolo allí (`kind: epic` con sus cortes), y no en un cambio nuevo: conserva el borrador, la petición literal y lo que resuelve, y no deja un borrador duplicado que solo la persona podría cancelar (`cancel` es suyo). Entra cuando terminan todos los subagentes, porque en Claude Code entrar en una worktree mientras trabajan los aislaría.
  - impacto: alto
- A3: El subagente se detiene sin cambiar su spec y responde con lo que dijo `propose` en su respuesta de tres líneas; lo que falta es la épica.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO el agente ejecuta `specty next` sin cambio activo, en un proyecto con código, con una herramienta que reparte en subagentes y sin `subagents: false` ENTONCES el encargo trae, entre la pregunta al usuario y la respuesta en tres líneas, el paso «Si `propose` dice que el cambio es demasiado grande y pide dividirlo en una épica, no lo conviertas tú: detente y responde con eso, que la épica la hace la sesión principal en tu cambio.».
- AC2: CUANDO sale esa tarjeta ENTONCES su `SIGUIENTE:` pide que, cuando terminen los subagentes, si uno volvió porque su cambio es demasiado grande, la sesión entre en él (`specty enter <id>`) y lo convierta allí en la épica, y si no, vuelva a ejecutar `specty next` allí.
- AC3: CUANDO la tarjeta sale en inglés ENTONCES el paso y el `SIGUIENTE:` salen en inglés, y el encargo de un corte de una épica no trae el paso.

## Diseño

- `packages/core/src/cards/idle.ts`: `changeBrief` añade el paso del tamaño a los pasos extra de `inItsFolder`, tras la pregunta al usuario; `subagentsNext` cambia su última frase. `subagents.ts` y `epic.ts` no cambian.
- Tests: `packages/core/test/cards/idle-epic-size.test.ts` (nuevo) con AC1–AC3; `packages/core/test/cards/idle-subagents.test.ts` comprueba el texto entero del encargo y del `SIGUIENTE:`, así que sus textos esperados cambian (un paso más, renumerado, y la frase final).

## Archivos

- modificar packages/core/src/cards/idle.ts — el paso del tamaño en el encargo y la épica del subagente en el `SIGUIENTE:`
- crear packages/core/test/cards/idle-epic-size.test.ts — tests del paso y del `SIGUIENTE:` en los dos idiomas
- modificar packages/core/test/cards/idle-subagents.test.ts — el texto entero del encargo y del `SIGUIENTE:` cambia
- modificar docs/ARCHITECTURE.md — la tarjeta sin cambio activo con el paso del tamaño (§7)

## Tareas

- [x] T1: El encargo de un cambio deja la épica a la sesión principal
  - files: packages/core/src/cards/idle.ts, packages/core/test/cards/idle-epic-size.test.ts, packages/core/test/cards/idle-subagents.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/idle-epic-size.test.ts test/cards/idle-subagents.test.ts test/cards/epic.test.ts test/cards/rejoin.test.ts && pnpm typecheck && pnpm lint
  - type: feat
- [x] T2: La arquitectura cuenta el paso del tamaño del encargo
  - files: docs/ARCHITECTURE.md
  - ac: AC1, AC2
  - verify: grep -q 'en 7 pasos' docs/ARCHITECTURE.md && grep -q 'la convierte allí en la épica' docs/ARCHITECTURE.md && pnpm lint
  - type: docs

## Riesgos

- R1: El subagente podría seguir el mensaje de `propose`, que pide dividir el cambio en una épica, en lugar del encargo. Mitigación: el paso del encargo nombra ese mensaje y dice qué hacer en su lugar.
