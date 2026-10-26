---
kind: standard
epic: 20261026-todos-los-agentes-al-nivel-de-claude-code
slice: C3
---

# Codex trae la tarjeta tras compactar y nombra su esfuerzo

## Objetivo

Cuando Codex compacta la conversación, el agente pierde la tarjeta de la tarea, y hoy solo Claude Code la recupera. Codex pasa a recuperarla igual: `init` le instala `SessionStart` con el matcher `^compact$`, y el guard responde con lo que imprime `specty next`, que Codex añade al contexto. Además, las tarjetas nombran el esfuerzo recomendado con los niveles de Codex. En la tabla de capacidades, la tarjeta tras compactar de Codex pasa a «sí».

## Fuera de alcance

- La prueba de Codex con un modelo simulado, que es C4.
- El nivel `minimal` de Codex: Specty no lo recomienda nunca.
- Cambiar lo que Codex recibe antes o después de cada acción.

## Supuestos

- A1: Según su documentación (revisada el 2026-10-26), Codex lanza `SessionStart` con `source: "compact"` tras compactar una sesión principal, antes de la siguiente petición al modelo. Su `matcher` es una expresión regular sobre `source`, y el texto plano de stdout se añade como contexto de desarrollador, hasta unos 2.500 tokens: de sobra para la tarjeta.
  - impacto: alto
- A2: Codex salta un hook nuevo o cambiado hasta que la persona lo revisa con `/hooks`; el aviso de confianza que ya imprime `init` se lo pide, así que no hace falta otro.
- A3: Los niveles de razonamiento de Codex son `minimal`, `low`, `medium`, `high` y `xhigh`, y el nivel neutro `max` de Specty corresponde a `xhigh`.

## Criterios de aceptación

- AC1: CUANDO Codex compacta la conversación en un repositorio con Specty ENTONCES el guard responde a su `SessionStart` con `source: "compact"` con lo mismo que imprime `specty next`, en stdout y con salida 0.
- AC2: CUANDO Codex empieza, reanuda, limpia o bifurca una sesión, o compacta fuera de un repositorio con Specty ENTONCES el guard no imprime nada.
- AC3: CUANDO `specty init` instala el guard de Codex ENTONCES `.codex/hooks.json` incluye `SessionStart` con el matcher `^compact$`, y `doctor` avisa cuando el guard está pero falta ese hook.
- AC4: CUANDO una tarjeta recomienda un esfuerzo y el agente es Codex ENTONCES lo nombra con los niveles de Codex: `low`, `medium`, `high` o `xhigh`.
- AC5: CUANDO se lee la tabla de capacidades de ARCHITECTURE §10 ENTONCES la tarjeta tras compactar de Codex es «sí».

## Diseño

- `agents/codex.ts`: sus eventos suman `SessionStart: "^compact$"`, y `kind` devuelve `compact` para un `SessionStart` con `source: "compact"`. El guard también mira `source`, por si una versión de Codex no filtra con el matcher: cualquier otro `SessionStart` es una acción sin más, que se deja pasar sin texto.
- La tarjeta en stdout pasa a `agents/adapter.ts` como `textCard`, porque Claude Code y Codex la reciben igual.
- `doctor`: con el guard instalado y sin el hook de `SessionStart`, la línea nueva `codex-compact` pide ejecutar `init`.
- `EFFORT_NAMES`, en `core/src/agents.ts`, suma Codex: `low`, `medium`, `high` y `xhigh`.

## Archivos

- modificar packages/cli/src/agents/codex.ts — `SessionStart` tras compactar: su evento, su tarjeta y su comprobación en `doctor`
- modificar packages/cli/src/agents/adapter.ts — `textCard`, la tarjeta en stdout que comparten Claude Code y Codex
- modificar packages/cli/src/agents/claude-code.ts — usa `textCard`
- modificar packages/core/src/cards/doctor.ts — la línea `codex-compact`, en español y en inglés
- modificar packages/core/src/agents.ts — los nombres de esfuerzo de Codex
- modificar packages/core/src/capabilities.ts — la tarjeta tras compactar de Codex pasa a «sí»
- modificar packages/cli/test/session-start.test.ts — la tarjeta tras compactar también en Codex, y nada en otro `SessionStart` (AC1, AC2)
- modificar packages/cli/test/codex.test.ts — `init` instala `SessionStart` y `doctor` avisa si falta (AC3)
- modificar packages/cli/test/agents.test.ts — Codex ya tiene tarjeta y reconoce su `SessionStart`: cambian las expectativas de su módulo
- modificar packages/core/test/cards.test.ts — el esfuerzo con los niveles de Codex (AC4)
- modificar packages/core/test/capabilities.test.ts — la fila de Codex cambia con su tarjeta (AC5)
- modificar docs/ARCHITECTURE.md — la tarjeta tras compactar en Codex (§7 y §10), sus nombres de esfuerzo (§11) y la tabla de capacidades

## Tareas

- [ ] T1: Codex trae la tarjeta tras compactar
  - files: packages/cli/src/agents/codex.ts, packages/cli/src/agents/adapter.ts, packages/cli/src/agents/claude-code.ts, packages/core/src/cards/doctor.ts, packages/cli/test/session-start.test.ts, packages/cli/test/codex.test.ts, packages/cli/test/agents.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/session-start.test.ts test/codex.test.ts test/agents.test.ts test/setup.test.ts
- [ ] T2: Las tarjetas nombran el esfuerzo de Codex
  - files: packages/core/src/agents.ts, packages/core/test/cards.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards.test.ts
- [ ] T3: La tabla de capacidades y ARCHITECTURE lo cuentan
  - files: packages/core/src/capabilities.ts, packages/core/test/capabilities.test.ts, docs/ARCHITECTURE.md
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/capabilities.test.ts

## Riesgos

- R1: Una instalación de Codex anterior a este cambio no tiene el hook de `SessionStart`, y su tarjeta no vuelve. Mitigación: `doctor` lo avisa (AC3) y `init` lo añade sin tocar el resto de hooks.
