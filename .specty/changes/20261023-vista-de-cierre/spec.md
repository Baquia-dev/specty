---
kind: standard
follows:
  - 20261023-datos-del-cierre
---

# Vista de cierre

## Objetivo

En la pestaña Aceptación, un cambio en cierre muestra lo que redactó el agente (resumen, desviaciones, decisiones y pendientes), y la persona lo confirma con «Confirmar y archivar», en la cabecera y en la barra compacta, igual que acepta un resultado.

## Fuera de alcance

- La pestaña Historial.
- Proponer actualizaciones de documentos desde el cierre.
- Reabrir un cambio cerrado.

## Supuestos

- A1: El cierre va como sección «Cierre» en la pestaña Aceptación, en cierre y en terminado (ahí, solo para leer), bajo el resumen y encima de la verificación completa y de la vista elegida. Mientras el agente lo redacta, la sección lo dice en lugar de las partes; sustituye la nota de cierre que hoy va bajo el resumen. Un cambio terminado sin cierre (un cambio rápido) no la muestra.
  - impacto: alto
- A2: Cada parte va bajo su subtítulo (Resumen, Desviaciones, Decisiones, Pendientes) con su texto en markdown; las vacías no aparecen, y el texto que no encaja va al final, sin título.
- A3: «Confirmar y archivar» aparece en la cabecera y en la barra compacta solo con el cierre enviado, y abre un diálogo que dice lo que pasa (el cambio termina y se archiva, sin vuelta atrás) con «Cancelar» y «Confirmar y archivar». Si la fuente no puede, un aviso lo explica y el diálogo sigue abierto, como al aceptar.
  - impacto: alto
- A4: Al confirmar, el cambio pasa a terminado: un aviso lo dice, la cabecera muestra la fase «Terminado», las acciones desaparecen y el cierre sigue a la vista.

## Criterios de aceptación

- AC1: CUANDO un cambio espera la confirmación de su cierre ENTONCES la pestaña Aceptación muestra el resumen, las desviaciones, las decisiones y los pendientes.
- AC2: CUANDO el agente aún redacta el cierre ENTONCES la sección lo dice y no hay acción de confirmar.
- AC3: CUANDO la persona confirma en el diálogo ENTONCES el cambio pasa a terminado y el cierre sigue a la vista, sin acciones.
- AC4: CUANDO la fuente no puede confirmar ENTONCES un aviso explica por qué y el diálogo sigue abierto.

## Diseño

- **Sección** (`acceptance/closing-view.ts`, `sp-closing-view`): las partes del cierre con su divisor y `sp-markdown`, o el aviso de que el agente lo redacta.
- **Acción** (`acceptance/closing-actions.ts`): `sp-closing-actions`, con el botón (normal o compacto) y su diálogo, que confirma con `SpectyData.confirmClosing`.
- **Pestaña** (`acceptance/acceptance-tab.ts`): la sección en cierre y terminado, sin la nota de hoy.
- **Cabecera y barra** (`change/change-page.ts`, `change/change-bar.ts`): la acción cuando el cambio espera la confirmación del cierre, como las acciones de aceptación.

## Archivos

- crear packages/ui/src/acceptance/closing-view.ts — la sección Cierre
- crear packages/ui/src/acceptance/closing-view.test.ts — tests de la sección
- crear packages/ui/src/acceptance/closing-actions.ts — «Confirmar y archivar» y su diálogo
- crear packages/ui/src/acceptance/closing-actions.test.ts — tests de la acción y del diálogo
- modificar packages/ui/src/acceptance/acceptance-tab.ts — la sección en cierre y terminado
- modificar packages/ui/src/acceptance/acceptance-tab.test.ts — la sección en la pestaña, sin la nota
- modificar packages/ui/src/change/change-page.ts — la acción en la cabecera
- modificar packages/ui/src/change/change-page.test.ts — la acción en la cabecera y el paso a terminado
- modificar packages/ui/src/change/change-bar.ts — la acción en la barra compacta
- modificar docs/ui.md — la vista de cierre

## Tareas

- [x] T1: La sección Cierre
  - files: packages/ui/src/acceptance/closing-view.ts, packages/ui/src/acceptance/closing-view.test.ts, packages/ui/src/acceptance/acceptance-tab.ts, packages/ui/src/acceptance/acceptance-tab.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/acceptance/closing-view.test.ts --include src/acceptance/acceptance-tab.test.ts
- [x] T2: Confirmar y archivar
  - files: packages/ui/src/acceptance/closing-actions.ts, packages/ui/src/acceptance/closing-actions.test.ts
  - ac: AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/acceptance/closing-actions.test.ts
- [x] T3: La acción en la cabecera y en la barra
  - files: packages/ui/src/change/change-page.ts, packages/ui/src/change/change-page.test.ts, packages/ui/src/change/change-bar.ts, docs/ui.md
  - ac: AC2, AC3
  - verify: pnpm check
  - notes: Comprobar en el navegador, en «Recordatorios de tareas por correo» y en «Panel de asistencia por curso» tras aceptarlo, a 390 y 1280 px y en claro y oscuro: las partes del cierre, el aviso mientras el agente redacta, el diálogo, el paso a terminado y la barra compacta.
