---
kind: standard
---

# doctor avisa del plugin de OpenCode sin el fin de turno de 2.2

## Objetivo

Desde 1917f17, el plugin de Specty para OpenCode toma como fin de turno `session.execution.succeeded`, el evento de OpenCode 2.2, que ya no publica `session.idle`. Un plugin instalado antes solo escucha `session.idle`, así que con OpenCode 2.2 su fin de turno (la comprobación de `specty check --changed` y la red de seguridad de la memoria) no se dispara nunca, y `specty doctor` no lo dice (P201). Con este cambio, `doctor` lo avisa, como ya hace con el plugin sin la tarjeta tras compactar, y pide `specty init --tools opencode`.

## Fuera de alcance

- Reescribir el plugin por su cuenta: lo hace `specty init --tools opencode`.
- Mirar qué versión de OpenCode tiene la persona: el aviso sale por el plugin, con cualquier versión.

## Supuestos

- A1: Un plugin es de antes de este fin de turno si tiene el guard pero no nombra `session.execution.succeeded`, como el aviso de la compactación mira `session.compacted`.
- A2: El aviso es un problema, como el de la compactación: `doctor` sale con 1.

## Criterios de aceptación

- AC1: CUANDO el plugin de OpenCode del proyecto tiene el guard pero no escucha `session.execution.succeeded` ENTONCES `specty doctor` sale con 1 y dice que su fin de turno no se dispara con OpenCode 2.2 y que se arregla con `specty init --tools opencode`; con el plugin que escribe `init`, no lo dice.
- AC2: CUANDO sale ese aviso ENTONCES sale en español y en inglés.

## Diseño

- Core: el código `opencode-turn-end` en `DoctorLine` (`cards/doctor.ts`) y su texto en `cards/doctor-agents.ts`.
- CLI: el `doctor` de `agents/opencode.ts` lo añade, como `opencode-compact`, cuando el plugin tiene el guard y no incluye `session.execution.succeeded`.

## Archivos

- modificar packages/core/src/cards/doctor.ts — el código del aviso
- modificar packages/core/src/cards/doctor-agents.ts — su texto en español e inglés
- crear packages/core/test/cards/doctor-opencode-turn-end.test.ts — el texto en los dos idiomas
- modificar packages/cli/src/agents/opencode.ts — `doctor` mira el fin de turno del plugin
- modificar packages/cli/test/opencode-install.test.ts — `doctor` con un plugin sin el fin de turno de 2.2
- modificar docs/ARCHITECTURE.md — el fin de turno de OpenCode cuenta el aviso de `doctor`

## Tareas

- [ ] T1: El texto del aviso del fin de turno de OpenCode 2.2
  - files: packages/core/src/cards/doctor.ts, packages/core/src/cards/doctor-agents.ts, packages/core/test/cards/doctor-opencode-turn-end.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/doctor-opencode-turn-end.test.ts && pnpm lint
  - type: feat
- [ ] T2: doctor avisa del plugin sin el fin de turno de OpenCode 2.2
  - files: packages/cli/src/agents/opencode.ts, packages/cli/test/opencode-install.test.ts, docs/ARCHITECTURE.md
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/opencode-install.test.ts test/opencode.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: feat
