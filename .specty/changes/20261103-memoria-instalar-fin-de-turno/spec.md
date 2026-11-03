---
kind: standard
follows:
  - 20261103-memoria-fin-de-turno-c5
---

# init instala la red de la memoria en el fin de turno

## Objetivo

El corte C5 dejó listo `specty hook memory-stop <agente>`, que devuelve el turno al agente cuando su último mensaje lista pendientes sin anotar en la memoria de Specty, pero nadie lo instala. Con este cambio, `specty init` lo escribe en el fin de turno (`Stop`) de Claude Code y de Codex junto a su guard, `specty uninstall` lo quita y `specty doctor` avisa cuando una instalación anterior no lo tiene. Así la red llega a cada repositorio que use Specty. Resuelve la entrada P16 de la memoria.

## Fuera de alcance

- Instalar la red en los agentes cuyo fin de turno no trae el último mensaje.
- Cambiar `check --install`, que sigue instalando aparte `hook agent-stop`.
- Ejecutar `specty init` en este repositorio: lo decide la persona (P7).

## Supuestos

- A1: El hook va en el mismo archivo que el guard de cada agente (`.claude/settings.json` o `.claude/settings.local.json`; `.codex/hooks.json`), con el mismo comando de Specty que el guard, como `{ "hooks": [{ "type": "command", "command": "<specty> hook memory-stop <agente>" }] }` en la lista `Stop`. Si ya está, `init` no lo repite, y los `Stop` de la persona quedan como estaban.
  - impacto: alto
- A2: Al pasar el guard de Claude Code de un archivo al otro (portable o local), la red se va con él, como los demás hooks de Specty.
- A3: `doctor` solo avisa cuando el guard del agente está instalado y su fin de turno no tiene la red; es un problema, como el aviso del `SessionStart` de antes.
- A4: `uninstall` quita la red con la misma regla con la que ya quita `hook agent-stop`.

## Criterios de aceptación

- AC1: CUANDO `specty init` instala el guard de Claude Code o de Codex ENTONCES escribe también en su `Stop` el hook `specty hook memory-stop <agente>`, una sola vez aunque se ejecute de nuevo, sin tocar los `Stop` de la persona.
- AC2: CUANDO el guard de Claude Code o de Codex está instalado sin la red de la memoria ENTONCES `specty doctor` lo avisa y pide ejecutar `specty init`.
- AC3: CUANDO la persona ejecuta `specty uninstall` ENTONCES quita también la red de la memoria, y los `Stop` de la persona quedan.

## Diseño

- `install/agents.ts`:
  - `withMemoryStop(value, tool, command)` añade la red a `hooks.Stop` si no está, o la quita con `command` indefinido, sin tocar las demás entradas.
  - `memoryStopLines(texts, tool)` da la línea de `doctor` cuando algún archivo tiene el guard del agente y ninguno la red.
  - La limpieza de `uninstall` quita también las entradas de `hook memory-stop`.
- `agents/claude-code.ts` y `agents/codex.ts`: su `install` añade la red con el comando del guard (y Claude Code la quita del otro archivo), y su `doctor` suma `memoryStopLines`.
- Core: `DoctorLine` gana `{ code: "memory-stop", tool }`, con su texto en `cards/doctor-agents.ts`.

## Archivos

- modificar packages/cli/src/install/agents.ts — escribir, comprobar y quitar la red de la memoria en un archivo de hooks
- modificar packages/cli/src/agents/claude-code.ts — `init` y `doctor` de Claude Code
- modificar packages/cli/src/agents/codex.ts — `init` y `doctor` de Codex
- modificar packages/core/src/cards/doctor.ts — la línea `memory-stop`
- modificar packages/core/src/cards/doctor-agents.ts — su texto
- modificar packages/cli/test/codex.test.ts — el `Stop` que deja `init` lleva la red
- crear packages/cli/test/memory-stop-install.test.ts — `init`, `doctor` y `uninstall` con la red, en Claude Code y Codex
- modificar docs/ARCHITECTURE.md — quién instala la red de la memoria

## Tareas

- [x] T1: La línea de `doctor` de la red de la memoria
  - files: packages/core/src/cards/doctor.ts, packages/core/src/cards/doctor-agents.ts, packages/cli/test/memory-stop-install.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint
- [ ] T2: `init`, `doctor` y `uninstall` con la red, y la documentación
  - files: packages/cli/src/install/agents.ts, packages/cli/src/agents/claude-code.ts, packages/cli/src/agents/codex.ts, packages/cli/test/memory-stop-install.test.ts, packages/cli/test/codex.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/memory-stop-install.test.ts test/codex.test.ts test/uninstall.test.ts test/setup.test.ts src/agents/claude-code.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: Un repositorio con un `Stop` propio que también lee el último mensaje recibe dos devoluciones del turno — solo si su hook también bloquea; la red lo hace una vez por turno.
- R2: Las instalaciones anteriores quedan sin red hasta ejecutar `specty init` — `doctor` lo avisa.
