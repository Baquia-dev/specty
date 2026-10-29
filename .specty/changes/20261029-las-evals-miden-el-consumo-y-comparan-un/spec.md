---
kind: standard
---

# Las evals miden el consumo y comparan un subagente por cambio

## Objetivo

Segundo punto acordado para el consumo de tokens: un experimento, medido con la suite de agentes reales, de un subagente por cambio. Es la única forma de limpiar el contexto sin que la persona haga nada.

Claude Code no deja que un hook ni el agente ejecuten `/clear`, pero un subagente empieza cada encargo con su propio contexto y solo devuelve su informe. Simulado sobre las sesiones de este repositorio, hacer cada cambio con un subagente costaría la mitad.

Antes de llevarlo al producto hay que medirlo con agentes de verdad. Para eso la suite:
- guarda el coste de cada ejecución de Claude Code y el mayor contexto de su hilo principal;
- tiene dos experimentos, que solo corren si se nombran, con tres cambios quick seguidos en modo delegado: uno hecho por el agente y otro con el subagente `specty-change`.

## Fuera de alcance

- Que Specty instale el subagente o pida delegar: depende de lo que mida el experimento.
- El consumo de otros agentes: hoy solo Claude Code da su coste en su `stream-json`.

## Supuestos

- A1: El último mensaje del `stream-json` de Claude Code (`type: result`) trae `total_cost_usd`, con lo que gastaron sus subagentes, y los mensajes de un subagente llevan `parent_tool_use_id`.
- A2: En modo `-p`, Claude Code usa los subagentes de `.claude/agents/` del proyecto con la herramienta `Agent`, si está entre las permitidas.

## Criterios de aceptación

- AC1: CUANDO termina una ejecución de Claude Code ENTONCES la suite guarda su coste (`total_cost_usd`) y el mayor contexto que leyó su hilo principal, sin sus subagentes. El informe los muestra en su sección «Consumo», con la media por agente y experimento.
- AC2: CUANDO se nombra el experimento `changes` ENTONCES el repositorio desechable tiene el modo delegado y tres archivos que arreglar, y se pide al agente hacer tres cambios quick seguidos. Cumple si los tres quedan arreglados y hay tres cambios cerrados, viola si un archivo cambió sin ningún cambio, y si no, queda sin avance.
- AC3: CUANDO se nombra `changes-subagent` ENTONCES el repositorio tiene además el subagente `specty-change` de Claude Code y el encargo pide hacer cada cambio con él; se juzga igual.
- AC4: CUANDO `SPECTY_EVALS_SCENARIOS` no los nombra ENTONCES `pnpm evals` no ejecuta los experimentos, que tienen 150 turnos y 30 minutos en lugar de los 30 turnos y 10 minutos de un escenario.

## Diseño

- `src/agents.ts`:
  - `consumptionOf(id, transcript)` da `{ cost, context }` del `stream-json` de Claude Code: el coste del mensaje `result`, y el mayor contexto (entrada y caché) de los mensajes del asistente sin `parent_tool_use_id`. Para otros agentes, nada.
  - `command(binary, prompt, turns)` pasa los turnos a `--max-turns`.
  - Claude Code puede usar además la herramienta `Agent`.
- `src/report.ts`:
  - `Run` admite `cost` y `context`, y `scenario` admite el id de un experimento.
  - `summarize` añade `usage`: por agente y experimento, las ejecuciones con consumo y sus medias.
  - El Markdown añade la sección «Consumo» si hay alguna; las filas y la tabla de cumplimiento no cambian.
- `src/experiments.ts`:
  - los dos experimentos, con `turns` y `minutes`;
  - el subagente `specty-change`: sigue `specty next` hasta cerrar el cambio y responde en tres líneas;
  - el juicio lee los cambios archivados y los tres archivos.
- `src/repo.ts`: `specty(..., { person: true, choose: "yes" })`, para activar el modo delegado como lo haría una persona.
- `run/compliance.eval.ts`: los experimentos solo si `SPECTY_EVALS_SCENARIOS` los nombra; turnos y tiempo de cada uno; coste y contexto en cada ejecución.
- ARCHITECTURE §16: los experimentos y sus resultados.

## Archivos

- crear evals/test/consumption.test.ts — AC1
- crear evals/test/experiments.test.ts — AC2, AC3 y AC4
- modificar evals/src/agents.ts — `consumptionOf`, los turnos y la herramienta `Agent`
- modificar evals/src/report.ts — el consumo en el resumen y en el informe
- crear evals/src/experiments.ts — los dos experimentos y el subagente
- modificar evals/src/repo.ts — una persona que elige una opción
- modificar evals/run/compliance.eval.ts — los experimentos, sus límites y su consumo
- modificar docs/ARCHITECTURE.md — §16, los experimentos y sus resultados

## Tareas

- [x] T1: La suite mide el consumo y tiene los experimentos de varios cambios
  - files: evals/test/consumption.test.ts, evals/test/experiments.test.ts, evals/src/agents.ts, evals/src/report.ts, evals/src/experiments.ts, evals/src/repo.ts, evals/run/compliance.eval.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-evals exec vitest run test/consumption.test.ts test/experiments.test.ts test/report.test.ts test/scenarios.test.ts && pnpm --filter @baquia-dev/specty-evals typecheck && pnpm lint && pnpm knip
- [ ] T2: Los resultados del experimento con Claude Code
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: El experimento gasta cupo de la persona: dos ejecuciones de unos minutos. Mitigación: una ejecución por variante, y solo cuando se nombra.
- R2: Tres cambios pequeños no muestran el ahorro de una sesión larga. Mitigación: se mide además el mayor contexto del hilo principal, que con el subagente debe quedarse quieto y sin él crecer con cada cambio, y el ahorro se extrapola con la simulación.
