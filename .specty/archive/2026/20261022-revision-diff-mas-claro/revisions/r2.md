---
kind: standard
follows:
  - 20261022-revision-items-sin-lineas-y-supuestos-decididos
---

# Revisión: diff más claro

## Objetivo

El delta ("Qué cambió desde que aprobaste") se lee sin esfuerzo, como en la maqueta "Specty · Oscuro mate y diff": cada ítem muestra su texto final limpio, con lo nuevo resaltado con suavidad; lo quitado aparece aparte, en una línea «Antes», y solo si de verdad se quitó algo. Los ítems añadidos se leen como texto normal y los eliminados, atenuados y tachados; las tareas se muestran como en la revisión (título y chips de criterios y archivos), y unos filtros permiten ver solo lo añadido, lo modificado o lo eliminado.

## Fuera de alcance

- Mover "Pedir cambios" y "Aprobar" a la cabecera y a la barra compacta: siguiente cambio.
- Cambios en el core: `specDelta` sigue decidiendo qué cambió.
- La spec completa, salvo lo que comparte con el delta (la fila del supuesto).

## Supuestos

- A1: Para mostrar ítems como en la revisión, el delta deja de comparar el texto de la spec (`hashUnits`) y compara los campos de cada ítem: el texto de supuestos, criterios y riesgos, el título y los chips de las tareas, y el texto de las secciones. Lo que cambia sin texto propio (el impacto de un supuesto, la verificación o el tipo de una tarea) se cuenta en una línea aparte, en los dos idiomas.
  - impacto: alto
- A2: El diff separa la puntuación de las palabras, así "justificada." frente a "justificada y…" queda como texto añadido antes del punto.
- A3: En el ejemplo, A2 cambia también una frase (no solo añade palabras), para que se vea la línea «Antes».

## Criterios de aceptación

- AC1: CUANDO un ítem o una sección de texto se modificó ENTONCES se muestra su texto final con las palabras nuevas resaltadas con suavidad (fondo tenue y subrayado fino, no un bloque de color) y, solo si se quitaron palabras, una línea «Antes» atenuada con el texto aprobado y lo quitado tachado; los lectores de pantalla oyen qué se añadió y qué se quitó, y la puntuación no se mezcla con las palabras.
- AC2: CUANDO un ítem se añadió o se eliminó ENTONCES el añadido se lee como texto normal con su marca "Añadido", y el eliminado atenuado y tachado con su marca "Eliminado", sin bloques de color.
- AC3: CUANDO cambia una tarea ENTONCES se muestra con su título y chips de criterios y archivos, como en la revisión: los añadidos desde la aprobación se distinguen, los quitados aparecen tachados y el archivo que es posible alcance nuevo lleva el chip en ámbar con icono, además de su aviso; los cambios sin texto propio (impacto, verificación, tipo) se cuentan en una línea aparte.
- AC4: CUANDO la persona elige un filtro (Todo, Añadidos, Modificados, Eliminados, cada uno con su número) ENTONCES el delta muestra solo esos cambios, y una leyenda breve explica cómo leer el resaltado y la línea «Antes».

## Diseño

- **Contrato** (`data/records.ts`): `DeltaEntryView` pasa de `diff` a `text` (texto final, o el que tenía si se eliminó), `before?` (solo con palabras quitadas), `chips?` (criterios y archivos de una tarea, con su cambio y si son posible alcance nuevo) y `details` (cambios sin texto propio).
- **Derivación** (`data/delta.ts`): por cada entrada de `specDelta`, el texto sale del ítem aprobado y del actual; el diff por palabras separa la puntuación y se reparte en texto final y «Antes».
- **Vista** (`review/delta-review.ts`): filtros con su número, leyenda, marca de cambio a la derecha, texto, «Antes», chips, detalles y avisos. `sp-word-diff` resalta lo añadido con un fondo tenue y un subrayado fino; `sp-assumption-row` recibe también el «Antes».

## Archivos

- modificar packages/ui/src/data/records.ts — entradas del delta con texto final, «Antes», chips y detalles
- modificar packages/ui/src/data/delta.ts — comparar los campos de cada ítem y separar la puntuación
- modificar packages/ui/src/data/delta.test.ts — tests de la derivación
- modificar packages/ui/src/data/sample-revisions.ts — A2 cambia también una frase
- modificar packages/ui/src/review/spec-sections.ts — resalte suave de lo añadido
- modificar packages/ui/src/review/assumption-row.ts — «Antes» en el supuesto
- modificar packages/ui/src/review/delta-review.ts — filtros, leyenda, «Antes», chips y detalles
- modificar packages/ui/src/review/delta-review.test.ts — tests de la vista
- modificar docs/ui.md — cómo se lee el delta

## Tareas

- [x] T1: Delta por campos, con texto final y «Antes»
  - files: packages/ui/src/data/records.ts, packages/ui/src/data/delta.ts, packages/ui/src/data/delta.test.ts, packages/ui/src/data/sample-revisions.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui test
- [x] T2: Vista del delta más clara, con filtros
  - files: packages/ui/src/review/spec-sections.ts, packages/ui/src/review/assumption-row.ts, packages/ui/src/review/delta-review.ts, packages/ui/src/review/delta-review.test.ts, docs/ui.md
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm check
  - notes: Comprobar en el navegador, en claro y en oscuro, el delta del ejemplo: A2 con «Antes», AC2 sin la palabra repetida, T4 con el chip en ámbar y los filtros.

## Riesgos

- R1: Las tareas hechas aparecen en el delta solo si cambian, y no deberían cambiar en un ajuste. Mitigación: se muestran igual que cualquier tarea modificada; `propose` ya rechaza modificar tareas hechas.

## Cierre

### Resumen

- El delta muestra cada ítem con su texto final limpio y lo nuevo resaltado con suavidad; una línea «Antes» solo cuando se quitaron palabras; añadidos como texto normal y eliminados atenuados y tachados.
- Las tareas aparecen con título y chips (añadidos, quitados y posible alcance nuevo en ámbar con icono), y lo que cambia sin texto propio (impacto, verificación, tipo) en una línea aparte.
- Filtros Todo, Añadidos, Modificados y Eliminados con su número, y una leyenda breve.
- 170 tests en la UI; comprobado en Chrome sin interfaz, en claro y oscuro.

### Desviaciones

- S1 (T1): la vista del delta se adaptó a los campos nuevos ya en T1, porque sin ello no compilaba; el rediseño siguió en T2.
- S2 (T2): `delta.ts` pasó de 300 líneas y el diff por palabras salió a `data/word-diff.ts`, con sus tests.
- Los tests cazaron dos causas del diff caótico, no previstas en la spec: los tramos cambiados se partían en trozos (ahora se agrupan, lo quitado antes que lo añadido) y los espacios contaban como coincidencias (ahora solo puntúan palabras y puntuación).
- Las marcas de cambio reservan el hueco del botón «Comentar» para alinearse en todas las filas.

### Decisiones

- El delta compara los campos de cada ítem, no el texto de la spec; `specDelta` sigue decidiendo qué cambió.
- El chip de "posible alcance nuevo" se deduce del aviso de la regla del core (que nombra el archivo), para que la UI y el CLI coincidan.
- "Aceptado con la spec" y los supuestos con solo cambio de impacto se muestran con su detalle, sin «Antes».

### Pendientes

- Acciones de decisión en la cabecera y en la barra compacta, sin barra inferior.
- Patrones de página en el sistema de diseño y Bandeja con buscador, filtros, agrupar y ordenar.
