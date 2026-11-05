---
kind: quick
---

# Un corte no compara con otros cambios la petición de su épica

## Objetivo

Resuelve P89. La sesión que lanza los cortes de una épica suele pasar a cada `specty new --epic <id> --slice <C>` la misma `--request` con la que creó la épica, la petición literal del usuario, que describe la épica y no el corte. Hoy el freno de duplicados ya salta la épica y sus otros cortes (83fa00fb), pero sigue comparando esa petición con la de los demás cambios abiertos, y frena el corte por un cambio ajeno a la épica que se creó con la misma petición genérica. Con este cambio, si la petición de un corte es la misma que la de su épica (la de su `change.created`), el freno no la compara; el título y `follows` se siguen comparando igual, y una petición distinta de la de la épica también. «La misma» es igual tras quitar los espacios del principio y del final, como `new` ya la guarda, y no `similarTexts`: la sesión que lanza los cortes copia la petición tal cual, y con `similarTexts` un corte cuya petición solo comparte palabras con la de la épica dejaría de compararse, y el freno perdería casos que hoy detecta bien.

## Archivos

- modificar packages/cli/src/flow/duplicates.ts — `duplicatesOf` no compara la petición de un corte que es la misma que la de su épica
- crear packages/cli/test/duplicates-slice.test.ts — un corte con la petición de su épica no se frena por otro cambio con esa petición; sí por una petición parecida pero distinta, o por un título parecido
- modificar docs/ARCHITECTURE.md — la regla del freno en la fila de `specty new`

## Tareas

- [x] T1: Un corte no compara con otros cambios la petición de su épica
  - files: packages/cli/src/flow/duplicates.ts, packages/cli/test/duplicates-slice.test.ts, docs/ARCHITECTURE.md
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/duplicates-slice.test.ts test/duplicates.test.ts test/duplicates-epic.test.ts test/epic.test.ts test/check-docs.test.ts && pnpm typecheck && pnpm lint
  - type: fix
