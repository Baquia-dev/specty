---
kind: quick
---

# La regla de las 300 líneas avisa y cuenta solo código

## Objetivo

`pnpm sources` deja de fallar al pasar de 300 líneas físicas, porque esa regla dura empuja a partir archivos por el número: hoy hay seis archivos con 300 líneas exactas. Ahora cuenta solo líneas de código, sin líneas en blanco ni comentarios. Avisa a partir de 300 y falla a partir de 500; los tests, a partir de 400 y 600. No mide lo que no se escribe a mano ni los datos: código generado, migraciones, textos de i18n, mocks y datos de ejemplo (`sample-*`). AGENTS.md lo redacta como criterio: si un archivo pasa de unas 300 líneas de código, el agente propone cómo dividirlo por responsabilidad antes de seguir, y nunca lo parte solo para cumplir el número. La cabecera SPDX sigue siendo obligatoria.

## Archivos

- modificar scripts/check-sources.mjs — contar solo código, avisar y fallar con dos umbrales, y no medir lo generado ni los datos
- crear packages/cli/test/sources.test.ts — los umbrales, el recuento sin comentarios, los tests y las exclusiones
- modificar AGENTS.md — la regla como criterio y no como número mágico

## Tareas

- [x] T1: Avisar a las 300 líneas de código y fallar a las 500
  - files: scripts/check-sources.mjs, packages/cli/test/sources.test.ts, AGENTS.md
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/sources.test.ts && pnpm sources
  - type: build

## Cierre

### Resumen

check-sources.mjs cuenta solo líneas de código, avisa a partir de 300 (tests 400) y falla a partir de 500 (tests 600), sin medir generados, migraciones, i18n, mocks ni sample-*; la cabecera SPDX sigue obligatoria. AGENTS.md lo redacta como criterio: proponer la división por responsabilidad, nunca partir por el número
