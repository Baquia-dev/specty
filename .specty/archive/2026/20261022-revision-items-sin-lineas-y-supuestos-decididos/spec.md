---
kind: standard
follows:
  - 20261022-sistema-de-diseno-modo-oscuro-mate
---

# Revisión: ítems sin líneas y supuestos decididos más discretos

## Objetivo

Los ítems de cada sección de la revisión (spec completa y delta) se leen como un documento: van con sangría bajo el título de su sección y sin líneas entre ellos; el ítem bajo el puntero o con el foco se ilumina con un fondo suave y muestra «Comentar» (la opción C elegida en la maqueta "Specty · Oscuro mate y diff"). El divisor de cada sección es la única línea. Además, un supuesto ya decidido deja de ofrecer "Confirmar" y "Rechazar…" y muestra un "Cambiar decisión" discreto.

## Fuera de alcance

- El diff nuevo del delta (texto final limpio, «Antes», filtros y tareas con chips): siguiente cambio.
- Mover "Pedir cambios" y "Aprobar" a la cabecera y a la barra compacta: cambio posterior.
- La Bandeja y el catálogo.

## Supuestos

- A1: El resalte usa el color del texto al 4 % sobre el fondo (`bg-text/[0.04]`), así sirve igual en claro y en oscuro sin un token nuevo, y no se anima con movimiento reducido.
- A2: "Cambiar decisión" vuelve a mostrar "Confirmar" y "Rechazar…" para ese supuesto; al decidir, vuelve a ocultarlos. Un supuesto pendiente los muestra siempre.
  - impacto: alto

## Criterios de aceptación

- AC1: CUANDO se ven los supuestos, criterios, archivos, tareas o riesgos de una sección (en la spec completa o en el delta) ENTONCES van con sangría bajo el título de la sección, sin líneas entre ellos ni al principio o al final de la lista, y el ítem bajo el puntero o con el foco dentro se ilumina con un fondo suave y muestra su botón «Comentar».
- AC2: CUANDO un supuesto ya está confirmado o rechazado ENTONCES no muestra "Confirmar" ni "Rechazar…", sino "Cambiar decisión", que los vuelve a mostrar; un supuesto pendiente los muestra siempre, y fuera de revisión no se muestra ninguno.

## Archivos

- modificar packages/ui/src/review/spec-sections.ts — filas sin líneas, con resalte, y listas con sangría
- modificar packages/ui/src/review/spec-sections.test.ts — tests de las filas y de los supuestos decididos
- modificar packages/ui/src/review/assumption-row.ts — "Cambiar decisión" en los supuestos decididos
- modificar packages/ui/src/review/spec-review.test.ts — las listas de la revisión ya no llevan línea
- modificar docs/ui.md — ítems sin líneas y supuestos decididos

## Tareas

- [x] T1: Ítems sin líneas, con sangría y resalte
  - files: packages/ui/src/review/spec-sections.ts, packages/ui/src/review/spec-sections.test.ts, packages/ui/src/review/spec-review.test.ts, docs/ui.md
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-ui test
- [x] T2: Supuestos decididos con "Cambiar decisión"
  - files: packages/ui/src/review/assumption-row.ts, packages/ui/src/review/spec-sections.test.ts
  - ac: AC2
  - verify: pnpm check
  - notes: Comprobar en el navegador, en claro y en oscuro, la spec completa y el delta: sin líneas entre ítems y con resalte al pasar el puntero.

## Cierre

### Resumen

- Los ítems de cada sección, en la spec completa y en el delta, van con sangría bajo el título de la sección y sin líneas; el ítem bajo el puntero o con el foco se ilumina con un fondo suave (el texto al 4 %) y muestra «Comentar». El divisor de la sección es la única línea.
- Un supuesto decidido muestra "Cambiar decisión" en lugar de Confirmar y Rechazar; al pulsarlo vuelven, con el foco en Confirmar, y se pliegan al decidir de nuevo.
- 162 tests en la UI; comprobado en Chrome sin interfaz, en claro y oscuro, con el puntero sobre un ítem.

### Desviaciones

- Ninguna respecto al plan. La clase del resalte usa la forma canónica de Tailwind (`bg-text/4`).

### Decisiones

- El resalte usa el color del texto con transparencia, sin token nuevo, para que valga en claro y en oscuro.
- "Aceptado con la spec" cuenta como decidido: también muestra "Cambiar decisión".
- La elección de cambiar una decisión se conserva en las actualizaciones en vivo con la misma decisión (`linkedSignal` con el valor anterior).

### Pendientes

- Cambio 2b: diff más claro en el delta (texto final limpio, «Antes», filtros, tareas con chips, puntuación separada).
- Acciones de decisión en la cabecera y en la barra compacta, sin barra inferior.
- Patrones de página y Bandeja con buscador, filtros, agrupar y ordenar.
