---
kind: quick
---

# El CSV del panel usa punto y coma en español

## Objetivo

Hoy el CSV del panel (`GET /api/stats/export`, el que descarga «Exportar» del panel) separa siempre las celdas con comas y escribe los decimales con punto, y Excel con configuración regional española, que espera punto y coma y coma decimal, lo abre todo en una columna (P346). Con este cambio, el CSV en español (`lang=es`) separa las celdas con punto y coma y escribe el ciclo en horas y el coste con coma decimal («1,25»), así que Excel en español lo abre en columnas y lee esas cifras como números; una celda va entre comillas cuando lleva el separador de su idioma, comillas o un salto de línea. El CSV en inglés no cambia (comas y punto decimal), ni el JSON. Supuesto: el separador y la coma decimal van por el idioma del CSV (el de la UI, o el del repositorio si no lo pide), sin una opción aparte; las fechas siguen como `AAAA-MM-DD HH:MM`, que Excel en español también lee como fecha, y no se añade la línea `sep=;`, que hace que Excel ignore el BOM y pierda los acentos.

## Archivos

- modificar packages/core/src/stats/export.ts — el separador y la coma decimal del CSV según su idioma, y las comillas por el separador
- modificar packages/core/test/stats/export.test.ts — el CSV en español con punto y coma y coma decimal; el inglés, igual que antes
- modificar packages/cli/test/server/stats-export.test.ts — el CSV en español del servidor, con punto y coma y coma decimal
- modificar docs/ARCHITECTURE.md — §15, `GET /api/stats/export`: el separador y los decimales por idioma
- modificar docs/ui.md — «Exportar»: el CSV en español se abre en Excel en español sin pasos extra

## Tareas

- [ ] T1: El CSV del panel en español separa con punto y coma y escribe los decimales con coma
  - files: packages/core/src/stats/export.ts, packages/core/test/stats/export.test.ts, packages/cli/test/server/stats-export.test.ts, docs/ARCHITECTURE.md, docs/ui.md
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/stats/export.test.ts && pnpm --filter @baquia-dev/specty exec vitest run test/server/stats-export.test.ts && pnpm typecheck
  - type: fix
