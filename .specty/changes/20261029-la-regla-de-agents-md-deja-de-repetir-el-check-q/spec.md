---
kind: quick
---

# La regla de AGENTS.md deja de repetir el check que ya hace task done

## Objetivo

La primera regla del bloque de Specty en AGENTS.md pide ejecutar `specty check --changed --spec` antes de reportar una tarea, pero `task done` ya lo ejecuta como compuerta y, si la tarea tiene su verificación, deja fuera a propósito los comandos del proyecto para no correr los tests dos veces. Siguiendo la regla, el agente corría antes el check completo, con toda la suite: en las sesiones medidas, 220 veces con una mediana de 2 minutos, unas 7 horas. La regla pasa a decir que `task done` ya lo comprueba, que no hace falta repetirlo antes, y que se corrija lo que devuelva.

## Archivos

- modificar packages/core/src/agents-md.ts — la primera regla, en español y en inglés
- modificar packages/core/test/cards.test.ts — el texto nuevo de la regla en los dos idiomas
- modificar AGENTS.md — el bloque de Specty de este repositorio, con la regla nueva
- modificar docs/formats.md — el bloque de ejemplo, con la regla nueva

## Tareas

- [x] T1: La regla confía en la compuerta de task done
  - files: packages/core/src/agents-md.ts, packages/core/test/cards.test.ts, AGENTS.md, docs/formats.md
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards.test.ts && pnpm lint
