---
kind: standard
---

# Los cambios huérfanos traen un encargo para retomarlos con un subagente

## Objetivo

Sin cambio activo, el bloque «CAMBIOS SIN CONVERSACIÓN» de `specty next` pide retomar un huérfano en su carpeta (en Claude Code, con `EnterWorktree`), lo que aislaría a los subagentes que ya trabajan desde la sesión principal. Con este cambio, cuando la herramienta reparte en subagentes y `subagents` no está en `false`, el bloque trae un encargo para retomar el huérfano con un subagente, desde `specty enter <id>`, como el de un corte huérfano de una épica, y la sesión principal no entra en su carpeta.

## Fuera de alcance

- Sin subagentes (`subagents: false` o una herramienta que no los reparte), el bloque dice lo de hoy.
- Una épica huérfana no se distingue: se retoma con el mismo encargo.
- El bloque «CAMBIOS SIN CARPETA» (`specty restore`), la tarjeta «TU CAMBIO» de una conversación fuera de su carpeta y el `SIGUIENTE:` de la tarjeta sin cambio activo no cambian.
- La guía «Cómo retomarlo» de la UI no cambia.

## Supuestos

- A1: Hay un solo encargo para todos los huérfanos, con `<id>` por rellenar, y no uno por huérfano: la tarjeta sin cambio activo sale al empezar cada sesión, el usuario suele pedir seguir uno, y la sesión pone su id, que ya lee en la lista.
  - impacto: medio
- A2: El `cd` del encargo usa el marcador `<carpeta del cambio>`, como el encargo de un cambio nuevo, y no la carpeta de la lista: esa es relativa a donde se ejecuta `next`, y `specty enter` le dice al subagente la absoluta.
  - impacto: bajo
- A3: El encargo lleva, como el de un cambio nuevo, el paso de detenerse y responder con la pregunta cuando le falta una respuesta del usuario, porque un huérfano puede estar en borrador; ese paso pasa a `cards/subagents.ts` para que los dos encargos lo compartan sin cambiar su texto.
  - impacto: bajo
- A4: La indicación de lanzar el subagente va en la línea final del bloque, donde hoy dice cómo retomarlo, con el `invoke_subagent` de Antigravity (`launchedWith(ctx, "change")`), y el `SIGUIENTE:` de la tarjeta no cambia.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO el agente ejecuta `specty next` sin cambio activo, hay cambios huérfanos, la herramienta reparte en subagentes y `subagents` no está en `false` ENTONCES el bloque «CAMBIOS SIN CONVERSACIÓN» lista cada huérfano con su fase, su título y su carpeta, como hoy, y pide, si el usuario quiere seguir uno, lanzar un subagente con el encargo para retomarlo tal cual, con su id en lugar de `<id>`, sin crear otro cambio ni entrar en su carpeta; el bloque no nombra `EnterWorktree`.
- AC2: CUANDO sale ese bloque con subagentes ENTONCES lo sigue un encargo «ENCARGO PARA RETOMAR» con `specty enter <id>`, el `cd` a la carpeta del cambio al principio de cada comando, `specty next` hasta cerrarlo con `specty wait` cuando espera a la persona, la pregunta al usuario cuando falta una respuesta y la respuesta en tres líneas, sin lanzar otros subagentes.
- AC3: CUANDO `subagents` está en `false` o la herramienta no reparte en subagentes ENTONCES el bloque es el de hoy, sin encargo: `EnterWorktree` con `name` en Claude Code con los hooks de las worktrees, `specty enter <id>` en los agentes que entran así, o cambiar la carpeta de la sesión.
- AC4: CUANDO la herramienta es Antigravity ENTONCES la línea pide lanzar el encargo con `invoke_subagent` y `Workspace: "inherit"`.
- AC5: CUANDO sale el encargo ENTONCES sale en español y en inglés, y sin huérfanos no sale ni el bloque ni el encargo.

## Diseño

- `packages/core/src/cards/rejoin.ts`: `orphansBlock`, con `toSubagents(ctx)`, cambia su línea final por la del subagente y añade la sección «ENCARGO PARA RETOMAR» («BRIEF TO RESUME»), hecha con `numbered`, `specty enter <id>` e `inItsFolder("<carpeta del cambio>", ctx, [la pregunta])`. Sin subagentes, `resumeHow` como hoy.
- `packages/core/src/cards/subagents.ts`: exporta el paso de la pregunta al usuario, que hoy está en `changeBrief` de `idle.ts`, con el mismo texto.
- Tests: `packages/core/test/cards/orphans-subagents.test.ts` (nuevo), sobre `nextCard({ dirty: [], orphans }, ctx)` con Claude Code, Cursor, Antigravity, Gemini CLI, `subagents: false` y sin herramienta, en los dos idiomas. En `rejoin.test.ts`, los AC3 de los huérfanos que esperan el texto de hoy con Claude Code o Cursor pasan a `subagents: false`.

## Archivos

- modificar packages/core/src/cards/rejoin.ts — con subagentes, el bloque de huérfanos pide un subagente y trae su encargo
- modificar packages/core/src/cards/subagents.ts — el paso de la pregunta al usuario, compartido por los encargos
- modificar packages/core/src/cards/idle.ts — el encargo de un cambio usa ese paso compartido
- crear packages/core/test/cards/orphans-subagents.test.ts — tests del bloque de huérfanos con subagentes
- modificar packages/core/test/cards/rejoin.test.ts — sus AC3 de huérfanos con Claude Code y Cursor, sin subagentes
- modificar docs/ARCHITECTURE.md — §7, el encargo para retomar un huérfano
- modificar docs/formats.md — `subagents` también reparte los huérfanos de la tarjeta sin cambio activo
- modificar docs/dominio.md — «Encargo» nombra también el de retomar un huérfano

## Tareas

- [ ] T1: Con subagentes, el bloque de huérfanos trae un encargo para retomarlos
  - files: packages/core/src/cards/rejoin.ts, packages/core/src/cards/subagents.ts, packages/core/src/cards/idle.ts, packages/core/test/cards/orphans-subagents.test.ts, packages/core/test/cards/rejoin.test.ts
  - ac: AC1, AC2, AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/orphans-subagents.test.ts test/cards/rejoin.test.ts test/cards/idle-subagents.test.ts && pnpm typecheck && pnpm lint
  - type: feat
- [ ] T2: La documentación cuenta el encargo para retomar un huérfano
  - files: docs/ARCHITECTURE.md, docs/formats.md, docs/dominio.md
  - ac: AC1, AC3
  - verify: grep -q 'ENCARGO PARA RETOMAR' docs/ARCHITECTURE.md && grep -q 'huérfanos de la tarjeta sin cambio activo' docs/formats.md && pnpm lint
  - type: docs

## Riesgos

- R1: Un huérfano que es una épica aprobada iría a un subagente, cuya tarjeta le pediría lanzar otros subagentes, y su encargo se lo prohíbe. Mitigación: el subagente responde con lo que falta y la sesión principal la retoma; distinguirla queda como pendiente.
