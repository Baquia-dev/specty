---
kind: quick
---

# Biome no formatea los hooks del agente

## Objetivo

`pnpm check` vuelve a pasar en `main`. `specty init` escribe `.claude/settings.json` (y `.cursor/hooks.json`) con su propio formato JSON, y Biome pide otro: desde el retro 5841c05, el lint de `main` falla en `.claude/settings.json`, y con él la verificación de cada incorporación (dos cambios esperan por eso). Formatearlo a mano no basta, porque el siguiente `init` lo vuelve a escribir. Biome deja de formatear esos dos archivos, igual que ya deja `.specty/`.

## Archivos

- modificar biome.json — excluir `.claude/settings.json` y `.cursor/hooks.json`, que escribe `specty init`

## Tareas

- [x] T1: Excluir de Biome los archivos de hooks que escribe Specty
  - files: biome.json
  - verify: pnpm lint
  - type: fix

## Cierre

### Resumen

biome.json excluye .claude/settings.json y .cursor/hooks.json, que escribe specty init con su propio formato JSON: el lint de main volvía a fallar desde el retro 5841c05. pnpm lint y pnpm check completos en verde
