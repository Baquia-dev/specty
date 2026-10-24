---
kind: standard
---

# Avisos de riesgo y aserciones en Aceptación

## Objetivo

La pestaña Aceptación muestra los avisos que `specty task done` anota de cada tarea: los riesgos según el contenido de lo que añadió (archivo, línea, regla y CWE) y las aserciones que quitó de tests que ya existían. Es el mismo bloque AVISOS que ve el agente en la terminal, para que la persona los revise antes de aceptar.

## Fuera de alcance

- Analizar el diff desde la UI: los avisos ya vienen calculados en la auditoría.
- Bloquear la aceptación por un aviso: son patrones conocidos, no fallos seguros.

## Supuestos

- A1: Los avisos de cada tarea están en su entrada `task.completed` (`risks` y `removedAssertions`), y cuenta la última de cada tarea, como en la CLI.

## Criterios de aceptación

- AC1: CUANDO una tarea anotó riesgos o aserciones quitadas al completarse ENTONCES la vista del cambio trae sus avisos, con el texto en los dos idiomas; los datos que no se reconocen se ignoran.
- AC2: CUANDO la persona abre la pestaña Aceptación de un cambio con avisos ENTONCES ve la sección «Avisos» con cada uno: la tarea, el archivo con su línea, lo que se encontró y su CWE, y que son patrones conocidos, no fallos seguros. Sin avisos, la sección no aparece.
- AC3: CUANDO la persona abre el prototipo ENTONCES el cambio en aceptación de ejemplo muestra un riesgo y una aserción quitada.
- AC4: CUANDO alguien lee el documento de la UI ENTONCES encuentra los avisos en Aceptación.

## Diseño

- `data/warnings.ts`: `warningsOf(audit)` toma la última entrada `task.completed` de cada tarea, valida sus riesgos con `isRiskRule` y escribe cada texto con `riskLabel` del core, en los dos idiomas. Ese texto se calcula en el worker, y el componente solo lo muestra. `deriveView` lo pone en `ChangeView.warnings` cuando hay alguno.
- `acceptance/acceptance-warnings.ts`: la sección «Avisos», con un divisor que los cuenta y filas de documento. `AcceptanceTab` la muestra antes de la verificación completa.
- `sample-acceptance.ts`: el cambio en aceptación de ejemplo anota un riesgo en T1 y una aserción quitada en T2.

## Archivos

- modificar packages/ui/src/data/records.ts — los avisos en la vista del cambio
- crear packages/ui/src/data/warnings.ts — los avisos de la auditoría
- crear packages/ui/src/data/warnings.test.ts — tests de los avisos
- modificar packages/ui/src/data/views.ts — los avisos en la vista
- modificar packages/ui/src/data/sample-acceptance.ts — avisos de ejemplo
- crear packages/ui/src/acceptance/acceptance-warnings.ts — la sección «Avisos»
- crear packages/ui/src/acceptance/acceptance-warnings.test.ts — tests de la sección
- modificar packages/ui/src/acceptance/acceptance-tab.ts — la sección en la pestaña
- modificar docs/ui.md — los avisos en Aceptación

## Tareas

- [x] T1: La vista trae los avisos de cada tarea
  - files: packages/ui/src/data/records.ts, packages/ui/src/data/warnings.ts, packages/ui/src/data/warnings.test.ts, packages/ui/src/data/views.ts, packages/ui/src/data/sample-acceptance.ts
  - ac: AC1, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data && pnpm sources
- [x] T2: Aceptación muestra los avisos
  - files: packages/ui/src/acceptance/acceptance-warnings.ts, packages/ui/src/acceptance/acceptance-warnings.test.ts, packages/ui/src/acceptance/acceptance-tab.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/acceptance && pnpm sources
- [x] T3: Documentar los avisos en Aceptación
  - files: docs/ui.md
  - ac: AC4
  - verify: pnpm check
  - type: docs

## Cierre

### Resumen

La pestaña Aceptación muestra la sección «Avisos» con lo que `specty task done` anotó de cada tarea: los riesgos según el contenido de lo que añadió (archivo, línea, lo encontrado y su CWE) y las aserciones que quitó de tests que ya existían. Es el mismo bloque AVISOS que ve el agente, con la nota de que son patrones conocidos, no fallos seguros. El cambio en aceptación de ejemplo trae un riesgo y una aserción quitada, así que también se ve en el prototipo.

### Desviaciones

- El test del orden de las secciones de `full-verification.test.ts` cambió: el ejemplo en aceptación ahora tiene avisos, que van antes de la verificación completa.

### Decisiones

- Los textos se calculan en el worker con `riskLabel` del core, en los dos idiomas, y el componente solo los muestra: así la pantalla no necesita el catálogo de reglas.
- Cuenta la última vez que se completó cada tarea, como en la CLI.

### Pendientes

- Ninguno.
