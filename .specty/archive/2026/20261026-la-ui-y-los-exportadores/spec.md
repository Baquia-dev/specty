---
kind: standard
epic: 20261026-las-funciones-de-specty-dentro-de-sus-limites
slice: C9
---

# La UI y los exportadores

## Objetivo

Doce funciones de la UI y de los exportadores pasan de los límites de Specty: `openSpec` (56 líneas), `specKit` (56), el constructor de `Shell` (59), `parseDiff` (64, complejidad 35), `markWords` (12), `wordDiff` (19), `spansOf` (14), `deriveReview` (101, 20), `textOf` (13), la vista de cada tarea en `progressOf` (12), `closingOf` (11) y los datos de ejemplo `boletinesProgress` (79). Cada una se divide en las piezas o los documentos que ya produce, sin cambiar lo que muestra, exporta, registra o calcula.

## Fuera de alcance

- Cambiar una pantalla, un comando de la paleta, un atajo, un archivo exportado, un diff, un resaltado, una revisión o los datos de ejemplo.
- La aceptación de la épica, que llega cuando este corte cierra.

## Supuestos

- A1: Los tests de la UI y de los exportadores recorren el diff, el resaltado, la revisión, el delta, el progreso, el cierre, el shell y cada exportador, así que un cambio en lo que hacen los haría fallar.
  - impacto: alto
- A2: Las funciones que se llaman desde el constructor de `Shell` siguen en su contexto de inyección, porque Angular las ejecuta mientras construye el componente.
  - impacto: alto

## Criterios de aceptación

- AC1: CUANDO se miden `packages/ui/` y `packages/exporters/` con `specty check --all` ENTONCES ninguna función pasa de 50 líneas ni de complejidad 10.
- AC2: CUANDO se ejecutan los tests de la UI y de los exportadores ENTONCES pasan sin cambiar lo que comprueban.

## Archivos

- modificar packages/exporters/src/openspec.ts — la propuesta, el diseño y los requisitos, cada uno aparte
- modificar packages/exporters/src/speckit.ts — la especificación, el plan y las tareas, cada uno aparte
- modificar packages/ui/src/data/diff.ts — cada línea de un hunk, su apertura y las cabeceras de un archivo; el par de líneas cuyas palabras se marcan
- modificar packages/ui/src/data/word-diff.ts — la tabla de la subsecuencia común y su recorrido
- modificar packages/ui/src/highlight/highlight.ts — los cortes de cada trozo de una línea
- modificar packages/ui/src/data/review.ts — las suposiciones, los archivos, las tareas, los comentarios y el índice de secciones
- modificar packages/ui/src/data/delta.ts — una tabla con el texto de cada clase de unidad
- modificar packages/ui/src/data/progress.ts — la vista de cada tarea, sus tiempos y su última verificación
- modificar packages/ui/src/data/closing.ts — la valla de código abierta tras cada línea
- modificar packages/ui/src/data/sample-progress.ts — las tareas y la auditoría del ejemplo, aparte
- modificar packages/ui/src/app/shell.ts — la navegación, la vuelta atrás y los comandos de la paleta

## Tareas

- [x] T1: Los exportadores
  - files: packages/exporters/src/openspec.ts, packages/exporters/src/speckit.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-exporters exec vitest run
  - type: refactor
- [x] T2: El diff y su resaltado
  - files: packages/ui/src/data/diff.ts, packages/ui/src/data/word-diff.ts, packages/ui/src/highlight/highlight.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch
  - type: refactor
- [x] T3: La revisión y el delta
  - files: packages/ui/src/data/review.ts, packages/ui/src/data/delta.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch
  - type: refactor
- [x] T4: El progreso y el cierre
  - files: packages/ui/src/data/progress.ts, packages/ui/src/data/closing.ts, packages/ui/src/data/sample-progress.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch
  - type: refactor
- [x] T5: El shell
  - files: packages/ui/src/app/shell.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch
  - type: refactor

## Cierre

### Resumen

Las doce funciones de la UI y de los exportadores que pasaban de los límites se dividieron en sus piezas: cada exportador arma sus archivos por documento; el diff separa las líneas de un hunk, su apertura y las cabeceras (en una tabla), y el diff por palabras su tabla y su recorrido; el resaltado corta cada trozo aparte; la revisión junta suposiciones, archivos, tareas, comentarios e índice; el delta toma de una tabla el texto de cada clase de unidad; el progreso arma cada tarea con sus tiempos y su última verificación; el cierre separa la valla abierta; los datos de ejemplo separan tareas y auditoría; y el constructor de `Shell` llama a la navegación, la vuelta atrás y los comandos de la paleta. Ya no queda ninguna función de ningún paquete fuera de los límites; los tests y la verificación completa pasan.

### Desviaciones

- `parseDiff` quita el retorno de carro de cada línea con `replace(/\r$/, "")` en vez de un ternario: hace lo mismo, quitar un `\r` final.
- `deriveReview` también deja la vista de las tareas a `taskViews`: el estimador cuenta las ramas de los callbacks en línea dentro de la función que los contiene.

### Decisiones

- Las funciones del constructor de `Shell` se llaman de forma síncrona, así que siguen en el contexto de inyección de Angular (`inject` y `effect`).

### Pendientes

- La aceptación de la épica.
