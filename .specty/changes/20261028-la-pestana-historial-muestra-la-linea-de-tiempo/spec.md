---
kind: standard
---

# La pestaña Historial muestra la línea de tiempo del cambio con filtros

## Objetivo

La pestaña Historial de un cambio solo dice «El historial y la trazabilidad llegan en la fase 3», aunque los datos ya existen: `data/history.ts` convierte `audit.jsonl` en eventos con su título, sus detalles y su tipo. La pestaña pasa a mostrar la línea de tiempo que pide docs/ui.md: los eventos por día, cada uno con su hora, quién lo hizo y su tipo, y filtros por actor y por tipo.

## Fuera de alcance

- Exportar el historial o la spec (Markdown, JSON, OpenSpec, Spec Kit, Kiro) desde la UI.
- La vista de trazabilidad con un margen tipo blame.
- Cambiar cómo se cuentan los eventos (`data/history.ts`).

## Supuestos

- A1: Los eventos van en orden de tiempo, del primero al último, como los cuenta `specty audit`, agrupados por día en la hora local de quien mira.
  - impacto: medio
- A2: El actor se filtra con un control segmentado (Todos, Persona, Agente, Specty) y el tipo con un desplegable (todos y los siete tipos de `HistoryType`), porque son pocas opciones en el primer caso y muchas en el segundo.
- A3: El agente se muestra con la herramienta que declaró, cuando la hay, como contexto y no como prueba.

## Criterios de aceptación

- AC1: CUANDO se abre la pestaña Historial de un cambio con eventos ENTONCES los muestra en orden de tiempo y agrupados por día, cada uno con su hora, quién lo hizo (la persona, el agente con su herramienta o Specty), su tipo, su título y sus detalles.
- AC2: CUANDO se elige un actor o un tipo de evento ENTONCES la lista muestra solo los eventos que coinciden y dice cuántos son de cuántos; si ninguno coincide, lo dice y ofrece quitar los filtros.
- AC3: CUANDO un cambio aún no tiene eventos ENTONCES la pestaña muestra un estado vacío que lo dice.

## Diseño

- `history/history-tab.ts` (`sp-history-tab`) recibe los eventos del cambio (`ChangeView.history`).
- Guarda el actor y el tipo elegidos en señales, filtra y agrupa por día.
- Cada evento es una fila de documento: la hora en un `<time>`, quién, el tipo y el título, con los detalles debajo.
- Usa los componentes del sistema de diseño: `SectionDivider` para cada día, `sp-segmented`, `sp-select`, `sp-empty-state` y `sp-button`.
- `change-page.ts` pone `sp-history-tab` en el panel Historial, en lugar del aviso.

## Archivos

- crear packages/ui/src/history/history-tab.ts — la línea de tiempo y sus filtros
- crear packages/ui/src/history/history-tab.test.ts — los eventos, los filtros, el estado vacío y la pestaña en la página
- modificar packages/ui/src/change/change-page.ts — la pestaña Historial
- modificar docs/ui.md — el historial hecho y lo que falta

## Tareas

- [x] T1: La línea de tiempo con filtros en la pestaña Historial
  - files: packages/ui/src/history/history-tab.ts, packages/ui/src/history/history-tab.test.ts, packages/ui/src/change/change-page.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/history/history-tab.test.ts && pnpm --filter @baquia-dev/specty-ui typecheck && pnpm lint
- [x] T2: Documentar el historial
  - files: docs/ui.md
  - ac: —
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/history/history-tab.test.ts
  - type: docs
