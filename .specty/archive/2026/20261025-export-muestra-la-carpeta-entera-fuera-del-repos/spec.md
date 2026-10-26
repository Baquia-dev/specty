---
kind: quick
---

# export muestra la carpeta entera fuera del repositorio

## Objetivo

`specty export` dice en qué carpeta escribió, relativa a la raíz del repositorio. Con `--out` fuera del repositorio, eso da una ruta como `../../../../private/tmp/…`, difícil de leer y de copiar. Ahora, si la carpeta está fuera del repositorio, la salida la muestra entera; dentro, sigue relativa.

## Archivos

- modificar packages/cli/src/commands/export.ts — la carpeta entera cuando está fuera
- modificar packages/cli/test/export.test.ts — la carpeta, dentro y fuera del repositorio

## Tareas

- [x] T1: La carpeta entera cuando está fuera del repositorio
  - files: packages/cli/src/commands/export.ts, packages/cli/test/export.test.ts
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/export.test.ts
  - type: fix

## Cierre

### Resumen

export muestra la carpeta relativa a la raíz cuando está dentro del repositorio y entera cuando está fuera, en vez de un ../../… largo; el test cubre los dos casos.
