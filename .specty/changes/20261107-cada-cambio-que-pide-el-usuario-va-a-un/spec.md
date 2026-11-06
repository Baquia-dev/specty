---
kind: standard
---

# Cada cambio que pide el usuario va a un subagente cuando la herramienta puede

## Objetivo

Hoy solo los cortes de una épica van a subagentes. Una feature suelta se hace en la propia sesión, que va acumulando el contexto de todos los cambios, y para limpiarlo el cierre aconseja abrir una sesión nueva. Con este cambio, cuando la herramienta reparte trabajo en subagentes (columna «Cortes en subagentes» de ARCHITECTURE §10) y `subagents` no está en `false`, la tarjeta de `next` sin cambio activo pide lanzar un subagente por cada cambio que pidió el usuario, con un encargo que lo lleva de su spec a su cierre. Varios cambios pedidos a la vez avanzan en paralelo, en una misma sesión, y cada uno arranca con un contexto limpio, como en una sesión nueva.

## Fuera de alcance

- La épica no cambia: la sesión principal la redacta con el usuario y, aprobada, su tarjeta sigue repartiendo los cortes como hoy.
- El esqueleto de un proyecto nuevo y los cambios sin spec (retro) siguen como hoy, en la propia sesión.
- Los cambios huérfanos de «CAMBIOS SIN CONVERSACIÓN» siguen diciendo cómo retomarlos en su carpeta; un encargo para retomarlos con un subagente queda para otro cambio.
- El aviso de sesión nueva del cierre no cambia.
- No se renombra la capacidad `subagentSlices` ni su columna «Cortes en subagentes».
- No hay evals nuevas: `changes` y `changes-subagent` ya miden un subagente por cambio (ARCHITECTURE §16).

## Supuestos

- A1: Esto revierte la decisión del 2026-11-04 («los subagentes son solo para features dentro de una épica») y la conclusión de ARCHITECTURE §16 («Specty no instala el subagente ni pide delegar»): en una sesión corta, un subagente por cambio costó 1,8 veces más (0,78 frente a 0,43 USD por tres cambios), y en las sesiones largas de este repositorio, donde un cambio empezaba con unos 515.000 tokens de contexto, ahorra; se cambia coste por tiempo y por un contexto principal pequeño, y `subagents: false` vuelve al flujo de hoy.
  - impacto: alto
- A2: El subagente hace el cambio entero, desde `new` hasta su cierre, como lo haría una sesión nueva, y no solo la implementación: en Claude Code, la sesión principal no puede redactar la spec en la carpeta del cambio sin entrar en ella con `EnterWorktree`, y eso aislaría a los subagentes que ya trabajan en otras carpetas.
  - impacto: alto
- A3: El encargo sigue el de un corte: `specty new "<título>" --request "<petición literal del usuario>" --subagent` (con `--type <tipo>` cuando `git.flow` nombra las ramas por tipo), `specty enter <id>`, el `cd` al principio de cada comando, `next` hasta cerrarlo con `specty wait` cuando espera a la persona, y la respuesta en tres líneas. Añade un paso: si para la spec le falta una respuesta del usuario, no la supone, se detiene y responde con la pregunta.
  - impacto: medio
- A4: El `SIGUIENTE:` pide a la sesión principal un subagente por cada cambio pedido, en paralelo en un solo mensaje si son varios, con el título y la petición literal de cada uno en lugar de los marcadores y `--kind quick` cuando cabe; que no entre en sus carpetas; que una épica la cree ella misma, sin subagente; que, si uno vuelve con una pregunta, se la haga al usuario y le pase la respuesta (en Claude Code, con `SendMessage`); y que, cuando terminen, vuelva a ejecutar `specty next` allí. En Antigravity añade el `Workspace: "inherit"` de los cortes.
  - impacto: medio
- A5: Un subagente que ejecuta `next` sin cambio activo ve la misma tarjeta, porque la CLI no distingue sus comandos de los de su sesión (en Claude Code, `CLAUDE_CODE_SESSION_ID` es el de la sesión principal); el encargo ya le dice que no lance otros subagentes y que empiece por `new`.
  - impacto: bajo
- A6: Las piezas que el encargo de un corte y el de un cambio comparten (si la herramienta reparte en subagentes, cómo los lanza en Antigravity, los pasos en su carpeta y la numeración) salen de `cards/epic.ts` a un módulo propio, `cards/subagents.ts`, sin cambiar sus textos.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO el agente ejecuta `specty next` sin cambio activo, en un proyecto con código, con una herramienta que reparte en subagentes (Claude Code, Codex, OpenCode, Cursor o Antigravity) y sin `subagents: false` ENTONCES la tarjeta trae un encargo con `specty new "<título>" --request "<petición literal del usuario>" --subagent`, `specty enter <id>`, el `cd` a la carpeta del cambio, `next` hasta cerrarlo con `specty wait` y la pregunta al usuario cuando falte una respuesta, y su `SIGUIENTE:` pide lanzar un subagente por cada cambio pedido, en paralelo, sin entrar en sus carpetas, con la épica en la propia sesión.
- AC2: CUANDO `subagents` está en `false`, o la herramienta no reparte en subagentes (Gemini CLI, Copilot, Devin o ninguna detectada) ENTONCES la tarjeta sin cambio activo es la de hoy: sin encargo y con `specty new` en la propia sesión.
- AC3: CUANDO `git.flow` nombra las ramas por tipo ENTONCES el `new` del encargo lleva `--type <tipo>` y el `SIGUIENTE:` dice los tipos de commit.
- AC4: CUANDO la herramienta es Antigravity ENTONCES el `SIGUIENTE:` pide lanzar cada encargo con `invoke_subagent` y `Workspace: "inherit"`.
- AC5: CUANDO es un proyecto nuevo, o hay código cambiado sin spec ENTONCES la tarjeta es la de hoy, aunque la herramienta reparta en subagentes.
- AC6: CUANDO sale el encargo ENTONCES sale en español y en inglés, y la tarjeta de una épica que reparte sus cortes no cambia.

## Diseño

- `packages/core/src/cards/subagents.ts` (nuevo): `toSubagents(ctx)`, `launchedWith(ctx)`, `inItsFolder(folder, ctx)` y `numbered(steps)`, que salen de `epic.ts` sin cambios. `inItsFolder` admite pasos extra antes de la respuesta en tres líneas, para la pregunta del encargo de un cambio.
- `packages/core/src/cards/idle.ts`: `idleCard`, con `toSubagents(ctx)`, añade la sección «ENCARGO» («BRIEF») tras sus líneas de siempre y cambia el `SIGUIENTE:`. El `new` del encargo reutiliza el marcador de `--type` de `typedNewNext`, y el `SIGUIENTE:` la pista de `--kind quick` (`quickHint`). `skeletonCard` y `withoutSpecCard` no cambian.
- Comentarios de `subagents` en `cards/view.ts`, `schema/config.ts` y `packages/cli/src/session.ts`: ya no es solo de la épica.
- Tests: `packages/core/test/cards/idle-subagents.test.ts` (nuevo), sobre `nextCard({ dirty: [] }, ctx)` con cada herramienta, `subagents: false`, `branchTypes`, `fresh` y `dirty`, en los dos idiomas. `epic.test.ts` y `rejoin.test.ts` cubren que la tarjeta de la épica no cambia.

## Archivos

- crear packages/core/src/cards/subagents.ts — las piezas de los encargos que comparten la épica y la tarjeta sin cambio activo
- modificar packages/core/src/cards/epic.ts — usa esas piezas desde su módulo
- modificar packages/core/src/cards/idle.ts — sin cambio activo, el encargo de un cambio para un subagente
- modificar packages/core/src/cards/view.ts — el comentario de `subagents` vale para todo cambio
- modificar packages/core/src/schema/config.ts — el comentario de `subagents` vale para todo cambio
- modificar packages/cli/src/session.ts — el comentario de `subagents` vale para todo cambio
- crear packages/core/test/cards/idle-subagents.test.ts — tests de la tarjeta sin cambio activo con subagentes
- modificar docs/formats.md — `subagents` también reparte cada cambio que pide el usuario
- modificar docs/ARCHITECTURE.md — la tarjeta sin cambio activo con su encargo (§7), la tabla de `epic` y la conclusión de §16

## Tareas

- [x] T1: Las piezas de los encargos salen de la tarjeta de la épica a su propio módulo
  - files: packages/core/src/cards/subagents.ts, packages/core/src/cards/epic.ts
  - ac: —
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/epic.test.ts test/cards/rejoin.test.ts && pnpm lint
  - type: refactor
- [x] T2: Sin cambio activo, la tarjeta pide un subagente por cada cambio con su encargo
  - files: packages/core/src/cards/idle.ts, packages/core/src/cards/subagents.ts, packages/core/test/cards/idle-subagents.test.ts
  - ac: AC1, AC2, AC3, AC4, AC5, AC6
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/idle-subagents.test.ts test/cards/bootstrap.test.ts test/cards.test.ts test/cards/epic.test.ts test/cards/rejoin.test.ts && pnpm typecheck && pnpm lint
  - type: feat
- [ ] T3: La documentación y los comentarios de `subagents` cuentan que cada cambio va a un subagente
  - files: docs/formats.md, docs/ARCHITECTURE.md, packages/core/src/cards/view.ts, packages/core/src/schema/config.ts, packages/cli/src/session.ts
  - ac: AC1, AC2
  - verify: grep -q 'cada cambio que pide el usuario' docs/formats.md && grep -q 'Tarjeta sin cambio activo' docs/ARCHITECTURE.md && pnpm lint
  - type: docs

## Riesgos

- R1: Un cambio corto en una sesión corta cuesta más con un subagente (unos 0,12 USD de arranque por cambio, §16). Mitigación: es el precio de la petición (tiempo y contexto limpio), §16 lo dice y `subagents: false` lo apaga.
- R2: Un subagente cuya spec sale del tamaño de una épica recibiría la tarjeta de la épica, que pide lanzar subagentes, y su encargo se lo prohíbe. Mitigación: el `SIGUIENTE:` pide a la sesión principal crear ella misma las épicas, y el subagente responde con lo que falta.
- R3: Las preguntas al usuario pasan por la sesión principal y cuestan una ronda más. Mitigación: el encargo pide no suponerlas, y la sesión principal le pasa la respuesta al mismo subagente cuando su herramienta puede.
