---
kind: standard
---

# El freno de duplicados salta la épica de lo que sigue

## Objetivo

El freno de duplicados de `specty new` (corte C4 de la épica «Memoria de Specty») compara un cambio que sigue con `--follows` a un corte con la propia épica de ese corte, y lo frena por la petición parecida, aunque seguir un corte es trabajar en esa épica. Con este cambio, la épica de cada cambio que sigue tampoco cuenta, como ya no cuentan los cambios que sigue ni la épica del corte que se crea.

## Fuera de alcance

- Cambiar cómo se decide que dos títulos o peticiones se parecen (`duplicateReason`).
- Saltar otros cortes de la misma épica: siguen frenando si se parecen.

## Supuestos

- A1: Un corte guarda su épica en el frontmatter de su spec (`epic`), abierto o archivado, y `findChange` lo encuentra en la carpeta, en otra worktree o en el archivo de la carpeta principal.
  - impacto: alto

## Criterios de aceptación

- AC1: CUANDO `specty new --follows <corte>` lleva una petición parecida a la de la épica abierta de ese corte ENTONCES crea el cambio sin frenarlo por la épica.
- AC2: CUANDO `specty new --follows <cambio>` lleva una petición parecida a la de otra épica abierta, que no es la de ningún cambio que sigue ENTONCES lo sigue frenando y la nombra.

## Diseño

- `flow/duplicates.ts`: `duplicatesOf` añade a los cambios que no cuenta la épica de cada cambio de `follows`, que lee con `findChange` y `parseSpec` (`frontmatter.epic`). Uno que no se encuentra no añade nada.

## Archivos

- modificar packages/cli/src/flow/duplicates.ts — saltar la épica de los cambios que sigue
- crear packages/cli/test/duplicates-epic.test.ts — seguir a un corte sin frenar por su épica, y frenar por otra

## Tareas

- [x] T1: El freno salta la épica de los cambios que sigue
  - files: packages/cli/src/flow/duplicates.ts, packages/cli/test/duplicates-epic.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/duplicates-epic.test.ts test/duplicates.test.ts test/epic.test.ts && pnpm typecheck && pnpm lint
  - type: fix

## Cierre

### Resumen

El freno de duplicados de `specty new` ya no compara un cambio con la épica de un cambio que sigue: `duplicatesOf` busca cada cambio de `--follows` con `findChange`, abierto o archivado, lee la `epic` del frontmatter de su spec y la añade a los que no cuentan, junto a los que sigue, la épica del corte que se crea y los de `--distinct-from`. Otra épica abierta con una petición parecida sigue frenándolo.

### Desviaciones

- La primera aceptación falló por un test del CLI intermitente con la máquina cargada; la suite entera del CLI pasó a mano (1010 tests) y la segunda aceptación pasó sin cambiar nada.

### Decisiones

- Un cambio de `--follows` que no se encuentra, o que no es un corte, no añade ninguna épica: el freno sigue como antes para él.

### Pendientes

Ninguno.
