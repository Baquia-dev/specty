---
kind: quick
---

# La medición de una épica con subagentes tras salir de su carpeta

## Objetivo

ARCHITECTURE §16 termina diciendo que el reparto de una épica entre subagentes no funcionaba con Claude Code y que solo el flujo en orden se había medido funcionando. Tras el arreglo de P101 (la sesión sale de la worktree de la épica antes de lanzar los encargos), se repitieron `epic` y `epic-subagent` con dos ejecuciones de cada uno. §16 pasa a dar las cifras nuevas y su conclusión.

## Archivos

- modificar docs/ARCHITECTURE.md — la medición de `epic` y `epic-subagent` del 2026-11-05 en §16 y su conclusión

## Tareas

- [x] T1: §16 da la medición de la épica con subagentes tras el arreglo de P101
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-docs.test.ts
  - type: docs

## Cierre

### Resumen

ARCHITECTURE §16 da la medición del 2026-11-05 de epic y epic-subagent tras el arreglo de P101 (2 de 2 en los dos; reparto 27 % más rápido y 25 % más caro) y su conclusión.
