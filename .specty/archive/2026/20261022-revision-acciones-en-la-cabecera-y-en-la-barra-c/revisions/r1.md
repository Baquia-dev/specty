---
kind: standard
follows:
  - 20261022-revision-diff-mas-claro
---

# Revisión: acciones en la cabecera y en la barra compacta

## Objetivo

"Pedir cambios" y "Aprobar" dejan la barra fija del pie y pasan a la cabecera de la página del cambio, a la derecha del título, con el motivo del bloqueo debajo; al desplazarse, reaparecen en la barra compacta fija. La página ya no tiene barra inferior, como en la maqueta "Specty · Oscuro mate y diff".

## Fuera de alcance

- Otras acciones de otras fases (aceptar, cerrar, decidir alcance): llegan con sus pantallas.
- Los patrones de página del sistema de diseño y la Bandeja: cambios siguientes.

## Supuestos

- A1: Las acciones aparecen en cualquier pestaña mientras el cambio está en revisión, porque deciden sobre la spec y no sobre la pestaña abierta.
  - impacto: alto
- A2: En la barra compacta, los botones son pequeños y el motivo del bloqueo va solo en el tooltip (con `aria-disabled`); en la cabecera, además, como texto visible debajo de los botones.
- A3: En pantallas estrechas, la barra compacta oculta el resumen (supuestos y comentarios) para dejar sitio a los botones.

## Criterios de aceptación

- AC1: CUANDO un cambio está en revisión ENTONCES la cabecera de la página muestra "Pedir cambios" y "Aprobar rN" a la derecha del título, con el motivo del bloqueo como texto debajo cuando "Aprobar" está deshabilitado, y la página no tiene barra de acción inferior.
- AC2: CUANDO la cabecera sale de la vista ENTONCES la barra compacta muestra también "Pedir cambios" y "Aprobar rN", con el mismo comportamiento (deshabilitado con su motivo, aviso al terminar) que los de la cabecera; mientras está oculta no se pueden enfocar.
- AC3: CUANDO el cambio no está en revisión ENTONCES no se muestra ninguna de las dos acciones.

## Diseño

- **Acciones** (`review/review-actions.ts`): `sp-review-actions` deja de ser una barra fija medida; es un grupo en línea (`role="group"`) con `[compact]`: en la cabecera, botones normales y el motivo debajo; en la barra compacta, botones pequeños y el motivo solo en el tooltip. La lógica (bloqueo, pedir cambios, aprobar) no cambia.
- **Página del cambio** (`change/change-page.ts`): las acciones en la fila del título de la cabecera y al final de la barra compacta, solo en revisión.
- **Revisión** (`review/spec-review.ts`): sin la barra del pie ni su margen; `scrollParent` vuelve a la revisión, que es quien lo usa.

## Archivos

- modificar packages/ui/src/review/review-actions.ts — acciones en línea, normales o compactas
- modificar packages/ui/src/review/review-actions.test.ts — tests de las dos variantes
- modificar packages/ui/src/review/spec-review.ts — sin barra de acción inferior
- modificar packages/ui/src/review/spec-review.test.ts — aprobar y pedir cambios desde la cabecera
- modificar packages/ui/src/review/spec-review-modes.test.ts — sin barra en la revisión
- modificar packages/ui/src/change/change-page.ts — acciones en la cabecera y en la barra compacta
- modificar packages/ui/src/change/change-page.test.ts — tests de las acciones en las dos cabeceras
- modificar docs/ui.md — acciones arriba, sin barra inferior

## Tareas

- [ ] T1: Acciones en línea y sin barra inferior
  - files: packages/ui/src/review/review-actions.ts, packages/ui/src/review/review-actions.test.ts, packages/ui/src/review/spec-review.ts, packages/ui/src/review/spec-review-modes.test.ts
  - ac: AC1, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/review/review-actions.test.ts --include src/review/spec-review-modes.test.ts
- [ ] T2: Acciones en la cabecera y en la barra compacta
  - files: packages/ui/src/change/change-page.ts, packages/ui/src/change/change-page.test.ts, packages/ui/src/review/spec-review.test.ts, docs/ui.md
  - ac: AC1, AC2, AC3
  - verify: pnpm check
  - notes: Comprobar en el navegador, en claro y en oscuro, la cabecera con las acciones y la barra compacta al desplazarse; y que no queda barra en el pie.
