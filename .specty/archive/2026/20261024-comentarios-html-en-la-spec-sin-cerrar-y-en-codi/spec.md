---
kind: standard
---

# Comentarios HTML en la spec: sin cerrar y en código

## Objetivo

Al leer una spec, Specty quita los comentarios HTML, que son las pistas de la plantilla. Hay dos fallos. Un comentario que se abre y no se cierra oculta todo lo que sigue, y `propose` solo dice que faltan secciones, sin señalar la línea. Y un comentario escrito como código en línea, entre comillas invertidas, también se quita: el texto del ítem pierde parte de lo que dice, y la forma canónica lo borra. La primera versión de esta misma spec no se podía proponer por eso: la apertura de un comentario, citada como código en un criterio, se tragaba hasta el cierre citado en el siguiente. Ahora el comentario sin cerrar es un error con su línea, y el código en línea se conserva tal cual.

## Fuera de alcance

- Código en línea que ocupa varias líneas: se mira cada línea por separado.
- Los comentarios dentro de bloques de código, que ya se conservan.

## Supuestos

- A1: Un tramo de código en línea empieza con una serie de comillas invertidas y termina con otra de la misma longitud en la misma línea, como en CommonMark. Una serie sin cierre en esa línea es texto normal.
- A2: Una spec abierta que ya cita un comentario HTML entre comillas invertidas cambia su hash: si estaba aprobada, `next` pedirá restaurarla o volver a proponerla. Es raro, y es justo el texto que se perdía.

## Criterios de aceptación

- AC1: CUANDO una spec abre un comentario HTML y no lo cierra ENTONCES `propose` la rechaza con un error que dice en qué línea empieza el comentario y que lo que sigue queda oculto.
- AC2: CUANDO un ítem o una sección cita un comentario HTML dentro de código en línea ENTONCES su texto lo conserva, y la forma canónica de la spec también.
- AC3: CUANDO hay comentarios fuera del código en línea, también en la misma línea que un tramo de código, ENTONCES se quitan como hasta ahora.
- AC4: CUANDO alguien lee formats.md §2 ENTONCES encuentra las dos reglas.

## Archivos

- modificar packages/core/src/spec/source.ts — el código en línea y la línea del comentario sin cerrar
- modificar packages/core/src/spec/parse.ts — el error `comment-unclosed`
- modificar packages/core/src/spec/diagnostics.ts — el código `comment-unclosed`
- modificar packages/core/src/spec/messages.es.ts — su mensaje
- modificar packages/core/src/spec/messages.en.ts — su mensaje
- modificar packages/core/test/spec/parse.test.ts — los comentarios sin cerrar y en código
- modificar packages/core/test/spec/roundtrip.test.ts — la forma canónica conserva el código en línea
- modificar docs/formats.md — §2

## Tareas

- [x] T1: El comentario sin cerrar es un error con su línea
  - files: packages/core/src/spec/source.ts, packages/core/src/spec/parse.ts, packages/core/src/spec/diagnostics.ts, packages/core/src/spec/messages.es.ts, packages/core/src/spec/messages.en.ts, packages/core/test/spec/parse.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/spec
  - type: fix
- [x] T2: El código en línea conserva sus comentarios
  - files: packages/core/src/spec/source.ts, packages/core/test/spec/parse.test.ts, packages/core/test/spec/roundtrip.test.ts, docs/formats.md
  - ac: AC2, AC3, AC4
  - verify: pnpm check
  - type: fix

## Cierre

### Resumen

Un comentario HTML que se abre y no se cierra es ahora el error `comment-unclosed`, que señala la línea donde empieza y avisa de que oculta todo lo que sigue. Y al quitar comentarios, `removeComments` salta el código en línea: entre series de comillas invertidas de la misma longitud, un comentario citado es texto, así que el ítem y la forma canónica lo conservan. Los demás comentarios se quitan como antes, también en una línea con código. formats.md §2 tiene las dos reglas.

### Desviaciones

- La primera versión de esta spec no se podía proponer, por el mismo fallo: se reescribió sin citar los marcadores de comentario.

### Decisiones

- El código en línea se mira en cada línea por separado; un tramo que cruza líneas no se reconoce, como quedó fuera de alcance.
- La línea del error es la del comentario abierto que llega al final, no la del primero de la spec.

### Pendientes

- Ninguno.
