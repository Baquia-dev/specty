---
kind: standard
---

# Al cerrar, Specty avisa de empezar una sesión nueva si el contexto es grande

## Objetivo

Segunda parte del primer punto acordado para el consumo de tokens. En las sesiones medidas de este repositorio, cada cambio empezaba con una mediana de 515.000 tokens de contexto de trabajo anterior, y cada llamada los vuelve a leer.

Empezar una sesión nueva al terminar un cambio, cuando la sesión pasa de 150.000 tokens, habría ahorrado la mitad del coste total. La calidad no cambió de forma medible en los cambios que empezaron en frío: las mismas llamadas por cambio y casi los mismos errores.

Claude Code no deja que un hook ni el agente limpien la sesión. Por eso:
- al cerrar un cambio, o al aceptar uno quick, la salida lo aconseja cuando la sesión del agente supera ese tamaño;
- tras un `/clear`, la tarjeta de Specty vuelve sola, como ya hace tras compactar, para que reiniciar en mitad de un cambio no cueste nada.

## Fuera de alcance

- Limpiar la sesión de forma automática: ni Claude Code ni otros agentes lo permiten a un hook o al agente.
- El aviso en otros agentes: solo Claude Code deja leer el tamaño de su contexto.
- Que `specty doctor` avise a una instalación anterior sin `clear`: `specty init` la actualiza.

## Supuestos

- A1: La última respuesta del asistente en el transcript de Claude Code lleva el uso de su llamada (`input_tokens`, `cache_creation_input_tokens` y `cache_read_input_tokens`), y su suma es el contexto que leyó; con esa suma se midió este repositorio.
- A2: Claude Code añade al contexto la salida del `SessionStart` con `source: clear`, como con `compact`: es el mismo evento con otro origen.

## Criterios de aceptación

- AC1: CUANDO se cierra un cambio, o se acepta uno quick, y la última sesión de Claude Code que nombra su auditoría leyó más de 150.000 tokens en su última respuesta ENTONCES la salida aconseja una sesión nueva para el siguiente cambio (`/clear` en Claude Code), con ese contexto redondeado a miles.
- AC2: CUANDO esa sesión leyó 150.000 tokens o menos, su transcript no aparece o la auditoría no nombra ninguna sesión de Claude Code ENTONCES no hay aviso.
- AC3: CUANDO `specty init` instala el guard de Claude Code ENTONCES su `SessionStart` escucha `compact|clear`, y tras un `/clear` el guard devuelve la tarjeta de `specty next`, como tras compactar.

## Diseño

- `agents/run.ts`:
  - `sessionContext(session, env)` lee la cola del transcript de la sesión, la misma que ya se lee para el modelo.
  - De la última respuesta del asistente suma `input_tokens`, `cache_creation_input_tokens` y `cache_read_input_tokens`.
  - Con el mismo nombre de sesión validado.
- `flow/usage.ts`: `measureUsage` añade el aviso tras la línea del consumo. El umbral es `FRESH_SESSION = 150_000`, y la sesión, la de la última línea de Claude Code de la auditoría.
- Core, `cards/usage.ts`: `freshSessionLine(context, lang)`, con el contexto en miles agrupados.
- `agents/claude-code.ts`: `SessionStart` con `compact|clear`; el guard ya devuelve la tarjeta con cualquier `SessionStart` de Claude Code.
- `.claude/settings.json` de este repositorio, con el matcher nuevo.
- ARCHITECTURE: la tarjeta tras compactar o limpiar, la fila de Claude Code y el aviso al cerrar.

## Archivos

- crear packages/core/test/cards/fresh-session.test.ts — AC1, el texto
- modificar packages/core/src/cards/usage.ts — `freshSessionLine`
- modificar packages/core/src/cards/index.ts — la exporta
- crear packages/cli/test/fresh-session.test.ts — AC1 y AC2 al cerrar, y la tarjeta tras `/clear` (AC3)
- modificar packages/cli/src/agents/run.ts — `sessionContext`
- modificar packages/cli/src/flow/usage.ts — el aviso al cerrar
- modificar packages/cli/test/setup.test.ts — el matcher `compact|clear` (AC3)
- modificar packages/cli/src/agents/claude-code.ts — el matcher
- modificar .claude/settings.json — el matcher en este repositorio
- modificar docs/ARCHITECTURE.md — tras limpiar, la fila de Claude Code y el aviso

## Tareas

- [x] T1: El texto del aviso de sesión nueva
  - files: packages/core/test/cards/fresh-session.test.ts, packages/core/src/cards/usage.ts, packages/core/src/cards/index.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/fresh-session.test.ts test/cards/usage.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint
- [ ] T2: Al cerrar, Specty avisa si la sesión del agente es grande
  - files: packages/cli/test/fresh-session.test.ts, packages/cli/src/agents/run.ts, packages/cli/src/flow/usage.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/fresh-session.test.ts test/usage.test.ts test/audit-who.test.ts && pnpm --filter @baquia-dev/specty typecheck && pnpm lint
- [ ] T3: La tarjeta de Specty vuelve tras `/clear`
  - files: packages/cli/test/setup.test.ts, packages/cli/src/agents/claude-code.ts, .claude/settings.json, docs/ARCHITECTURE.md
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/setup.test.ts test/session-start.test.ts test/agents.test.ts && pnpm --filter @baquia-dev/specty typecheck && pnpm lint

## Riesgos

- R1: Una respuesta larga deja la última línea del asistente fuera de los 64 KB que se leen. Mitigación: sin línea no hay aviso (AC2). El cierre es el mismo.
- R2: El aviso molesta a quien prefiere seguir en la misma sesión. Mitigación: solo aparece por encima de 150.000 tokens y no bloquea nada.
