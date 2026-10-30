---
kind: quick
---

# La regla de AGENTS.md pide juntar las lecturas independientes

## Objetivo

En las sesiones medidas, el 40 % de las llamadas al modelo hacían una sola lectura, y 1.968 de ellas seguían a otra lectura de la que no dependían. Cada llamada vuelve a leer todo el contexto, así que pedirlas juntas habría ahorrado unos 198 USD, alrededor del 9 % del gasto. El bloque de reglas de Specty en AGENTS.md gana una regla, justo después de la de localizar el código: las lecturas y búsquedas que no dependen entre sí se piden juntas, en la misma respuesta, y no una por respuesta.

## Archivos

- modificar packages/core/src/agents-md.ts — la regla nueva, en español y en inglés
- modificar packages/core/test/cards.test.ts — el texto de la regla en los dos idiomas
- modificar AGENTS.md — el bloque de Specty de este repositorio, con la regla nueva
- modificar docs/formats.md — el bloque de ejemplo, con la regla nueva

## Tareas

- [x] T1: Las lecturas independientes se piden juntas
  - files: packages/core/src/agents-md.ts, packages/core/test/cards.test.ts, AGENTS.md, docs/formats.md
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards.test.ts && pnpm lint

## Cierre

### Resumen

La regla de localizar el código pide además juntar en la misma respuesta las lecturas y búsquedas que no dependen entre sí (español e inglés), como segunda mitad de esa línea para no pasar de las 15 líneas del bloque que ya exige su test; AGENTS.md y formats.md la reproducen.
