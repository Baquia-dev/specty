---
kind: quick
---

# El paquete npm lleva LICENSE y NOTICE

## Objetivo

Specty es Apache-2.0, y la licencia pide entregar con cada distribución una copia de la licencia y el archivo NOTICE. Pero el paquete `@baquia-dev/specty` solo publica `dist` (`files: ["dist"]`), y LICENSE y NOTICE están en la raíz del repositorio, así que el paquete saldría sin ellos. Ahora cada build del CLI copia LICENSE y NOTICE de la raíz a su carpeta, y el paquete los lleva.

## Archivos

- modificar packages/cli/build.mjs — copiar LICENSE y NOTICE a la carpeta del bundle
- modificar packages/cli/test/bundle.test.ts — el bundle los lleva, iguales a los de la raíz
- modificar docs/ARCHITECTURE.md — §16: el paquete los lleva

## Tareas

- [ ] T1: Cada build copia LICENSE y NOTICE junto al bundle
  - files: packages/cli/build.mjs, packages/cli/test/bundle.test.ts, docs/ARCHITECTURE.md
  - verify: pnpm check
  - type: fix
