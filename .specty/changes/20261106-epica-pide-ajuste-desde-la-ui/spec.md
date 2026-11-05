---
kind: standard
---

# Una épica en implementación pide su ajuste desde la UI

## Objetivo

Desde P165, una épica en `implementing` se ajusta con `specty adjust` para estrechar un corte que salió demasiado grande y añadir cortes nuevos, pero la UI solo ofrece pedir ajustes con el resultado en aceptación. Con este cambio, la página de una épica en `implementing` ofrece «Pedir ajustes…», como hoy en aceptación, y su diálogo explica cómo se ajusta una épica y qué pasa al pedirlo: la épica vuelve a revisión, no empieza ningún corte nuevo hasta aprobarla y los cortes en curso siguen.

## Fuera de alcance

- Validar que el ajuste de una épica no cambie ni borre un corte cerrado (P185, otro cambio).
- Pedir ajustes en `implementing` de un cambio que no es una épica: su plan cambia con `scope add`, y sus ajustes siguen en aceptación.
- Mostrar en la página de la épica qué cortes quedan detenidos mientras se ajusta.
- Añadir una épica a los datos de muestra de la UI.

## Supuestos

- A1: Solo una épica se ajusta en `implementing` (P165): la UI ofrece «Pedir ajustes…» en esa fase solo a una épica, y los demás cambios siguen pidiéndolos en aceptación.
  - impacto: alto
- A2: El servidor local no cambia: su acción `adjust` no filtra por fase y ejecuta `specty adjust` en la carpeta del cambio, que ya admite una épica en `implementing` y rechaza los demás cambios en esa fase. Un test del servidor lo confirma.
  - impacto: alto
- A3: «Pedir ajustes…» de una épica en `implementing` va junto al título y en la barra compacta, como las acciones de aceptación, aunque no es una decisión que la épica espere: la cabecera no dice «Espera…», y bajo el botón una línea dice para qué sirve.
- A4: El diálogo es el mismo «Pedir ajustes» de aceptación. Para una épica, en cualquiera de sus dos fases, explica las formas de ajustarla de la tarjeta de `adjusting` de una épica (dividir un corte, un corte nuevo o alcance nuevo) en lugar de la clasificación por tareas, y su última línea habla de sus cortes en vez de las tareas hechas.
- A5: La fuente de muestra de la UI admite el ajuste de una épica en `implementing`, como el servidor, para que los tests y el catálogo lo vean.

## Criterios de aceptación

- AC1: CUANDO la persona abre la página de una épica en `implementing` ENTONCES la cabecera, junto al título, y la barra compacta ofrecen «Pedir ajustes…», sin «Aceptar resultado», y bajo el botón de la cabecera una línea dice que sirve para dividir un corte demasiado grande o añadir uno que falta.
- AC2: CUANDO la persona abre «Pedir ajustes…» de una épica en `implementing` ENTONCES el diálogo explica cómo ajusta el agente una épica (dividir un corte, corte nuevo o alcance nuevo) y dice que los cortes cerrados no se tocan, que la épica vuelve a revisión, que ningún corte nuevo empieza hasta que la persona apruebe el ajuste y que los cortes en curso siguen.
- AC3: CUANDO la persona envía la petición del ajuste de una épica en `implementing` ENTONCES la UI la envía tal cual, como `specty adjust`, la épica pasa a `adjusting` con la petición y un aviso dice que el agente la ajustará y volverá a la revisión de la persona; sin petición no se envía.
- AC4: CUANDO la página es de un cambio que no es una épica en `implementing` ENTONCES ni la cabecera ni la barra compacta ofrecen «Pedir ajustes…».
- AC5: CUANDO la persona pide ajustes de una épica en aceptación ENTONCES el diálogo explica las mismas formas de ajustar una épica, sin la clasificación por tareas, y dice que los cortes cerrados no se tocan y que sus cortes nuevos empiezan cuando apruebe el ajuste.
- AC6: CUANDO la fuente no deja decidir ENTONCES «Pedir ajustes…» de una épica en `implementing` aparece desactivado, con el motivo bajo el botón de la cabecera.
- AC7: CUANDO el servidor local recibe la petición de ajuste de una épica en `implementing` ENTONCES ejecuta `specty adjust` en su carpeta y la épica pasa a `adjusting` con la petición; la de un cambio que no es una épica en `implementing` la rechaza con 409, sin cambiar su fase.

## Diseño

- `ui/acceptance/epic-actions.ts` (nuevo): `EpicActions` (`sp-epic-actions`) replica `AcceptanceActions` con un solo botón, «Pedir ajustes…», que abre `ResultDialogs.adjust`; sin compactar, bajo el botón, el motivo si la fuente no deja decidir o la línea de para qué sirve. `adjustsWhileImplemented(change)` dice si el cambio es una épica en `implementing`: lo usan la página y la barra.
- `ui/change/change-page.ts` y `ui/change/change-bar.ts`: montan `sp-epic-actions` después de las acciones de aceptación, con la misma condición.
- `ui/acceptance/result-dialogs.ts`: `AdjustResult` elige por el tipo del cambio la explicación (`CLASSES` o las formas de una épica), la descripción, el ejemplo del campo y el aviso al enviar; para una épica, su última línea depende de la fase.
- `ui/data/sample-acceptance.ts`: `decideResultIn` admite `adjust` de una épica en `implementing`.
- El servidor (`cli/server/actions.ts`) no cambia (A2).

## Archivos

- crear packages/ui/src/acceptance/epic-actions.ts — «Pedir ajustes…» de una épica en implementación
- modificar packages/ui/src/change/change-page.ts — el botón junto al título
- modificar packages/ui/src/change/change-bar.ts — el botón en la barra compacta
- crear packages/ui/src/change/change-page.epic.test.ts — AC1, AC4 y AC6
- modificar packages/ui/src/acceptance/result-dialogs.ts — el diálogo del ajuste de una épica
- modificar packages/ui/src/data/sample-acceptance.ts — la fuente de muestra ajusta una épica en implementación
- crear packages/ui/src/acceptance/epic-adjust.test.ts — AC2, AC3 y AC5
- crear packages/cli/test/server/epic-adjust.test.ts — AC7
- modificar docs/ui.md — el ajuste de una épica en implementación

## Tareas

- [x] T1: «Pedir ajustes…» en la página de una épica en implementación
  - files: packages/ui/src/acceptance/epic-actions.ts, packages/ui/src/change/change-page.ts, packages/ui/src/change/change-bar.ts, packages/ui/src/change/change-page.epic.test.ts
  - ac: AC1, AC4, AC6
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/change/change-page.epic.test.ts --include src/change/change-page.test.ts --include src/change/change-page.closing.test.ts --include src/change/change-page.tests.test.ts --include src/acceptance/acceptance-actions.test.ts && pnpm lint && pnpm knip
  - type: feat
- [ ] T2: El diálogo del ajuste de una épica, en sus dos fases
  - files: packages/ui/src/acceptance/result-dialogs.ts, packages/ui/src/data/sample-acceptance.ts, packages/ui/src/acceptance/epic-adjust.test.ts
  - ac: AC2, AC3, AC5
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/acceptance/epic-adjust.test.ts --include src/acceptance/acceptance-actions.test.ts --include src/acceptance/criterion-row.test.ts --include src/data/acceptance.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: feat
- [ ] T3: El servidor ajusta una épica en implementación y rechaza otro cambio en esa fase
  - files: packages/cli/test/server/epic-adjust.test.ts
  - ac: AC7
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server/epic-adjust.test.ts test/server/actions.test.ts && pnpm lint
  - type: test
- [ ] T4: La documentación del ajuste de una épica desde la UI
  - files: docs/ui.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: Una persona pide el ajuste de la épica sin saber que detiene los cortes nuevos hasta aprobarlo — el diálogo lo dice antes de enviar, y los cortes en curso siguen.
