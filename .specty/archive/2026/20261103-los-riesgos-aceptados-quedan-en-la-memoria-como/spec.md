---
kind: standard
---

# Los riesgos aceptados quedan en la memoria como lecciones

## Objetivo

Primer corte de P31 (lo aplazado entra solo en la memoria): al aceptar un cambio, los patrones de riesgo que encontró `task done` (CWE-78 y los demás del catálogo) quedan en la memoria de Specty como lecciones de sus archivos, sin que el agente los anote. Hoy, una vez aceptados, solo quedan en el registro del cambio. Como lecciones, la tarjeta de la tarea los muestra a quien vuelva a tocar esos archivos.

## Fuera de alcance

- La deuda de `specty check --all` y los hallazgos de `specty review`: son los otros dos cortes de P31.
- Pedir a la persona que confirme cada riesgo por separado: aceptar el cambio ya es aceptarlos, como hoy.

## Supuestos

- A1: Cada riesgo es una lección (`lesson`) con la ruta de su archivo en `paths` y el cambio como origen, y no una entrada pendiente: muchos son llamadas que ya existían y solo se movieron, y como pendientes llenarían la lista de lo libre. Como lección, sale en las tarjetas de las tareas que tocan ese archivo.
  - impacto: alto
- A2: Una lección por archivo y patrón, sin la línea en el texto, que cambia con cada edición: «Riesgo aceptado en `<ruta>`: <patrón> (<CWE>). Revísalo antes de ampliarlo.». Si ya hay una lección abierta con ese mismo texto, no se repite, con la regla de los pendientes del cierre.
  - impacto: alto
- A3: Se anotan al aceptar, también en el carril rápido, donde aceptar cierra el cambio, y la salida de `accept` dice qué entradas anotó.

## Criterios de aceptación

- AC1: CUANDO se acepta un cambio cuyas tareas dejaron avisos de riesgo ENTONCES cada archivo y patrón queda en la memoria como una lección de ese archivo, con el cambio de origen, y la salida de `accept` dice qué entradas anotó.
- AC2: CUANDO el mismo riesgo del mismo archivo ya es una lección abierta de la memoria ENTONCES aceptar no la repite.

## Diseño

- Core, `cards/risk-lessons.ts`: `riskLessons(tasks, lang)`, el texto y la ruta de cada lección, una por archivo y patrón, y `riskLessonsLine(ids, lang)`, la línea de la salida de `accept`.
- CLI:
  - `commands/memory.ts`: `harvestEntries` recibe elementos con `text` y, opcionalmente, `paths`: con rutas, la entrada es una lección. Devuelve los ids que creó.
  - `flow/finish.ts` le pasa los pendientes del cierre como `{ text }`.
  - `commands/accept.ts`: tras la transición, anota las lecciones de los riesgos de las tareas y añade la línea a la tarjeta, también en el carril rápido.

## Archivos

- crear packages/core/src/cards/risk-lessons.ts — el texto de cada lección de riesgo y la línea de `accept`
- modificar packages/core/src/cards/index.ts — exporta sus funciones
- crear packages/core/test/cards/risk-lessons.test.ts — una lección por archivo y patrón, en español y en inglés
- modificar packages/cli/src/commands/memory.ts — `harvestEntries` anota también lecciones y devuelve los ids
- modificar packages/cli/src/flow/finish.ts — pasa los pendientes del cierre con la forma nueva
- modificar packages/cli/src/commands/accept.ts — anota los riesgos al aceptar y lo dice
- crear packages/cli/test/risk-lessons.test.ts — aceptar anota las lecciones y no repite una abierta
- modificar docs/ARCHITECTURE.md — los riesgos aceptados entran en la memoria

## Tareas

- [x] T1: Las lecciones de los riesgos
  - files: packages/core/src/cards/risk-lessons.ts, packages/core/src/cards/index.ts, packages/core/test/cards/risk-lessons.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/risk-lessons.test.ts && pnpm lint
- [x] T2: `accept` anota los riesgos en la memoria, y la documentación
  - files: packages/cli/src/commands/memory.ts, packages/cli/src/flow/finish.ts, packages/cli/src/commands/accept.ts, packages/cli/test/risk-lessons.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/risk-lessons.test.ts test/risk.test.ts test/memory-harvest.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: Lecciones de más con riesgos que son falsos positivos — una sola por archivo y patrón, y la persona puede descartarlas con `specty memory drop`.

## Cierre

### Resumen

Al aceptar un cambio, también en el carril rápido, cada archivo y patrón de riesgo que encontraron sus tareas queda en la memoria como una lección de ese archivo, con el cambio como origen, y la salida de `accept` nombra las entradas que anotó. Una lección abierta con el mismo texto no se repite. `harvestEntries` anota ahora pendientes o lecciones y devuelve los ids que creó.

### Desviaciones

Ninguna.

### Decisiones

- Las lecciones se anotan nada más pasar la transición, antes del commit del estado o del cierre del carril rápido: si el cierre rápido se niega, por ejemplo porque main no entra, la lección ya está, y volver a aceptar no la repite.

### Pendientes

- Quedan los otros dos cortes de P31: la deuda de `specty check --all` y los hallazgos de `specty review`.
