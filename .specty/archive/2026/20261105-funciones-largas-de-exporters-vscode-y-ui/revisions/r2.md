---
kind: standard
follows:
  - 20261104-complejidad-de-cli-y-core
---

# La función larga de la UI y las complejas de exporters y vscode, simplificadas

## Objetivo

Resuelve P60 y la deuda de `complexity` que queda (P109, que `specty check --all` volvió a anotar tras cerrarse P61 con el cambio anterior). `function-lines` (máximo 50) señala `asistenciaSample` de la UI (68 líneas), y `complexity` (máximo 10) señala `clausesOf` de exporters (11) y `changesView` de vscode (13). Este cambio las simplifica sacando a funciones con nombre lo que mezclan, sin cambiar lo que hacen.

## Fuera de alcance

- Los archivos largos (`max-lines`, P62): el cambio siguiente.
- Cambiar lo que hacen estas funciones: los tests que ya existen son el contrato y no cambian.

## Supuestos

- A1: Basta con extraer funciones dentro de cada archivo, sin archivos nuevos; los tests que ya existen cubren lo que se mueve (el importador de OpenSpec, la vista de la barra de estado y las pantallas de la UI con la muestra «Panel de asistencia por curso»).

## Criterios de aceptación

- AC1: CUANDO se ejecuta `specty check --all` con el CLI construido sobre este cambio ENTONCES `function-lines` y `complexity` pasan, sin señalar las tres funciones ni las nuevas.
  - test: manual
- AC2: CUANDO se ejecuta `pnpm check` ENTONCES pasa sin cambiar ningún test que ya existía.
  - test: manual

## Diseño

- `clausesOf`: recorrer las viñetas GIVEN/WHEN/THEN/AND y unir cada AND a la cláusula anterior sale a `clauseList(body)`; `clausesOf` solo elige la primera de cada clave y arma el texto.
- `changesView`: la barra del cambio de la carpeta (fase y si te espera) sale a `hereText(here, lang)`, y el recuento de cambios abiertos y de los que te esperan, a `countsOf(changes, lang)`.
- `asistenciaSample`: la auditoría de sus dos tareas sale a `asistenciaAudit(at)`, como `boletinesAudit(at)` en `sample-progress.ts`.

## Archivos

- modificar packages/exporters/src/import-openspec.ts — clauseList
- modificar packages/vscode/src/view.ts — hereText y countsOf
- modificar packages/ui/src/data/sample-acceptance.ts — asistenciaAudit

## Tareas

- [ ] T1: La función compleja de exporters, simplificada
  - files: packages/exporters/src/import-openspec.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-exporters exec vitest run test/import-openspec.test.ts && pnpm lint
  - type: refactor
- [ ] T2: La función compleja de vscode, simplificada
  - files: packages/vscode/src/view.ts
  - ac: AC1, AC2
  - verify: pnpm --filter specty-vscode exec vitest run test/view.test.ts && pnpm --filter specty-vscode typecheck && pnpm lint
  - type: refactor
- [ ] T3: La función larga de la UI, dividida
  - files: packages/ui/src/data/sample-acceptance.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/acceptance.test.ts --include src/acceptance/criterion-row.test.ts --include src/acceptance/changes-view.test.ts --include src/data/fixtures.test.ts && pnpm typecheck && pnpm lint
  - type: refactor
