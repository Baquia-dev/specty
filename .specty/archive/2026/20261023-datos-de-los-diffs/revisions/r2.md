---
kind: standard
---

# Datos de los diffs

## Objetivo

La UI puede pedir a su fuente de datos el diff de una tarea o del cambio completo, y entenderlo: archivos, bloques, números de línea, qué líneas se emparejan para verlas lado a lado y qué palabras cambiaron dentro de una línea. Es la base del visor de diffs, que viene en el cambio siguiente. La fuente de ejemplo trae los diffs de «Panel de asistencia por curso».

## Fuera de alcance

- El visor y el resaltado de sintaxis: van en el cambio siguiente.
- La vista «Cambios» en la pestaña Aceptación.
- Que el servidor local produzca los diffs con git: el prototipo los simula en su fuente.

## Supuestos

- A1: La fuente entrega el diff como texto unificado, tal como lo escribe `git diff`, y la UI lo lee. Así la fuente no tiene que traducir nada y el formato es el de siempre. La acción es `diff(change, task?)`: sin tarea, el cambio completo (lo que la rama cambió desde que salió de la rama base); con tarea, lo que va de su commit de partida a su commit final. Por defecto la fuente no da diffs y lo dice.
  - impacto: alto
- A2: El lector de diffs entiende archivos nuevos, borrados, renombrados y binarios, los bloques con su contexto («@@ … @@ class AttendanceRepository {»), los números de línea de cada lado y «\ No newline at end of file». Una línea que no entiende la ignora en lugar de romperse.
  - impacto: alto
- A3: Para ver lado a lado, dentro de cada bloque cada tanda de líneas quitadas se empareja, en orden, con la tanda de añadidas que la sigue. Lo que sobra de una tanda queda con el otro lado vacío y el contexto va en los dos lados.
- A4: Las palabras que cambiaron se marcan solo en las líneas emparejadas que se parecen: si menos del 40 % de la línea se conserva, se ve la línea entera como quitada y añadida, sin marcar palabras. Para el código, las palabras se separan también por cualquier signo, no solo por espacios y puntuación; el diff por palabras gana un parámetro opcional para elegir cómo se trocea, y la revisión del delta sigue igual.
- A5: Cada tarea expone su commit de partida (`baseCommit` de `state.json`), para que el visor muestre el rango «5d2a7b0 → 3c9d1e2».
- A6: La muestra trae el diff de T1 (el repositorio y su test, modificados) y de T2 (el panel y su test, nuevos); el del cambio completo es la suma de los dos. Para los demás cambios la fuente de ejemplo responde un diff vacío.

## Criterios de aceptación

- AC1: CUANDO la UI pide el diff de una tarea o del cambio completo ENTONCES la fuente lo entrega como texto unificado, y una fuente sin diffs explica que no los da.
- AC2: CUANDO la UI lee un diff ENTONCES obtiene cada archivo con su estado (nuevo, modificado, borrado, renombrado o binario), sus líneas añadidas y quitadas, y sus bloques con los números de línea de cada lado.
- AC3: CUANDO un bloque tiene líneas quitadas y añadidas seguidas ENTONCES se emparejan para verlas lado a lado, y las que se parecen marcan las palabras que cambiaron.
- AC4: CUANDO el diff trae algo que el lector no entiende ENTONCES lo ignora y lee el resto.
- AC5: CUANDO la UI muestra una tarea ENTONCES conoce su commit de partida y su commit final.

## Diseño

- **Contrato** (`data/records.ts`): `SpectyData.diff(change, task?)`, que devuelve el texto del diff.
- **Lector** (`data/diff.ts`): `parseDiff(text)` → `DiffFile[]` (ruta, ruta anterior si se renombró, estado, binario, añadidas, quitadas y bloques con sus líneas y números); `splitRows(hunk)` empareja para el modo lado a lado; las palabras cambiadas van como rangos en cada línea emparejada.
- **Palabras** (`data/word-diff.ts`): `wordDiff(before, after, split?)`, con `codeTokens` para el código.
- **Progreso** (`data/progress.ts`): `TaskProgressView.baseCommit`.
- **Muestra** (`data/sample-diffs.ts`, `data/fixtures.ts`): los diffs de ejemplo y `diff` en la fuente de ejemplo.

## Archivos

- crear packages/ui/src/data/diff.ts — leer un diff unificado
- crear packages/ui/src/data/diff.test.ts — tests del lector y de la fuente
- modificar packages/ui/src/data/word-diff.ts — trocear también como código
- modificar packages/ui/src/data/records.ts — la acción diff
- modificar packages/ui/src/data/progress.ts — el commit de partida de cada tarea
- crear packages/ui/src/data/sample-diffs.ts — los diffs de ejemplo
- modificar packages/ui/src/data/fixtures.ts — diff en la fuente de ejemplo

## Tareas

- [x] T1: Leer un diff unificado
  - files: packages/ui/src/data/diff.ts, packages/ui/src/data/diff.test.ts, packages/ui/src/data/word-diff.ts
  - ac: AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/diff.test.ts --include src/data/word-diff.test.ts
- [x] T2: Los diffs en la fuente de datos
  - files: packages/ui/src/data/records.ts, packages/ui/src/data/progress.ts, packages/ui/src/data/sample-diffs.ts, packages/ui/src/data/fixtures.ts, packages/ui/src/data/diff.test.ts
  - ac: AC1, AC5
  - verify: pnpm check

## Cierre

### Resumen

La fuente de datos da diffs: `diff(change, task?)` devuelve el texto tal como lo escribe `git diff`, de una tarea o del cambio completo, y una fuente que no los tiene lo dice. `parseDiff` lo lee en archivos (nuevos, borrados, modificados, renombrados o binarios, con sus líneas añadidas y quitadas) y bloques con los números de cada lado. Ignora lo que no entiende y acepta CRLF, rutas entre comillas y «\ No newline at end of file». Empareja las líneas quitadas y añadidas para verlas lado a lado (`splitRows`) y marca las palabras que cambiaron en las que se parecen. Cada tarea expone su commit de partida, y la fuente de ejemplo trae los diffs de «Panel de asistencia por curso».

### Desviaciones

- **Aviso de Biome:** las cadenas de `sample-diffs.ts` llevan `${…}` del código Dart de ejemplo. Se desactivó solo en ese archivo, con su motivo, el aviso de plantillas dentro de cadenas.
- **Tests del diff por palabras:** se añadió uno para `codeTokens` en `word-diff.test.ts`, junto al archivo de la tarea.

### Decisiones

- **El texto de git como contrato:** la fuente no traduce nada, el servidor solo tendrá que ejecutar git y la UI lee el formato de siempre.
- **Los conteos mandan:** el lector sigue los conteos de cada cabecera `@@`, así una línea de código que empieza por «--- » o «+++ » no se confunde con una cabecera.
- **Palabras solo donde ayudan:** si una línea conserva menos del 40 %, se ve entera como quitada y añadida, sin marcar palabras.
- **Diffs de ejemplo construidos:** se escriben como líneas y un constructor calcula las cabeceras, así los conteos siempre cuadran.

### Pendientes

- **El visor de diffs con resaltado de sintaxis**, en el cambio siguiente.
- **La vista «Cambios» en Aceptación**, después.
- **El servidor local:** ejecutar git para cada tarea (de su commit de partida a su commit) y para el cambio completo (desde la rama base).
