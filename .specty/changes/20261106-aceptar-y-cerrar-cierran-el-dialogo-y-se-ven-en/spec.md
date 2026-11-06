---
kind: standard
epic: 20261106-aceptar-y-decidir-en-la-ui-muestran-su-progreso-2
slice: C3
---

# Aceptar y cerrar cierran el diálogo y se ven en curso en la cabecera

## Objetivo

Hoy, al aceptar o confirmar el cierre desde la UI, el diálogo se queda abierto sin decir nada mientras la petición tarda, a veces minutos. Con este cambio, el diálogo se cierra al confirmar, el botón de la cabecera y el de la barra compacta cargan, y bajo los botones de la cabecera se lee «Aceptando…» o «Cerrando…» hasta que el servidor responde; entonces un aviso dice cómo terminó.

## Fuera de alcance

- La línea que manda el servidor mientras la acción sigue y los eventos `action` que la llevan: son el corte C4.
- Que «Pedir ajustes…» cierre su diálogo al enviar: sigue esperando la respuesta con el diálogo abierto.
- Mostrar una acción en curso en la Bandeja, en otra pestaña del navegador o tras recargar la página.
- Acortar lo que tarda aceptar o cerrar.
- Mostrar el nuevo estado antes de que el servidor lo confirme (actualización optimista).

## Supuestos

- A1: Las acciones en curso viven en `InFlight`, un servicio raíz de la pestaña que las lanzó, por id del cambio: sobreviven a salir de la página del cambio y volver dentro de la UI, pero no a recargar la página.
  - impacto: medio
- A2: Mientras una acción sigue, la línea «Aceptando…» o «Cerrando…» ocupa bajo los botones de la cabecera el sitio de la línea de la verificación completa. La barra compacta no añade ninguna línea: solo carga su botón y, en aceptación, «Pedir ajustes…» lleva el motivo en su tooltip, como el motivo de solo lectura.
  - impacto: bajo
- A3: Si la aceptación o el cierre fallan, el aviso de error de hoy dice por qué, ya sin diálogo, y los botones vuelven a su estado: para reintentarlo, la persona vuelve a pulsar el botón y confirma otra vez.
  - impacto: medio
- A4: Mientras una aceptación o un cierre siguen, su botón carga y está desactivado, así que la página no lanza otra acción igual sobre el mismo cambio.
  - impacto: bajo
- A5: «Ejecutarla antes» del diálogo de aceptar no cambia: cierra el diálogo y lanza la verificación completa, que ya se ve en vivo.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO la persona pulsa «Aceptar» en el diálogo de aceptar ENTONCES el diálogo se cierra al momento; mientras el servidor no responde, «Aceptar resultado» de la cabecera y de la barra compacta carga y «Pedir ajustes…» queda desactivado con el motivo «Aceptando…»; al responder, un aviso dice que se aceptó o por qué no, y los botones vuelven a su estado.
- AC2: CUANDO la persona pulsa «Confirmar y archivar» en el diálogo del cierre ENTONCES el diálogo se cierra al momento; mientras el servidor no responde, «Confirmar y archivar» de la cabecera y de la barra compacta carga; al responder, un aviso dice que el cierre se confirmó o por qué no, y el botón vuelve a su estado.
- AC3: CUANDO una aceptación o un cierre lanzados desde esta página siguen en curso ENTONCES la cabecera dice bajo los botones «Aceptando…» o «Cerrando…» («Accepting…», «Closing…» en inglés), en lugar de la línea de la verificación completa, hasta que la acción termina; la barra compacta no añade esa línea.
- AC4: CUANDO la persona deja la página del cambio y vuelve a ella mientras su aceptación o su cierre siguen ENTONCES la cabecera los sigue mostrando en curso.

## Diseño

- **Acciones en curso** (`packages/ui/src/data/in-flight.ts`, nuevo): `InFlight`, servicio raíz (A1).
  - Guarda en una señal un mapa de solo lectura del id del cambio a `{ kind: "accept" | "close" }`.
  - `run(change, kind, pending)` apunta la acción, devuelve la misma promesa y la quita del mapa al cumplirse o fallar (`finally`).
  - `of(change)` lee el mapa, así una `computed` o una plantilla que la llama se actualiza sola.
  - C4 añadirá a cada entrada la nota del servidor.
- **Diálogos** (`packages/ui/src/acceptance/result-dialogs.ts`, `closing-actions.ts`):
  - `AcceptResult.accept()` y `ConfirmClosing.confirm()` cierran el diálogo y lanzan la petición con `InFlight.run`. Al cumplirse, el aviso de éxito de hoy; al fallar, `reportFailure`. Los dos son servicios raíz, así que funcionan con el diálogo ya destruido.
  - `ConfirmClosing` deja su señal `loading` y el motivo «Cerrando…» de «Cancelar»: el diálogo ya no espera.
- **Botones de la cabecera y la barra** (`packages/ui/src/acceptance/acceptance-actions.ts`, `closing-actions.ts`):
  - Leen `InFlight.of(change().id)`. El botón principal lleva `loading`; «Pedir ajustes…» lleva como motivo el de solo lectura o, si no hay, «Aceptando…».
  - Fuera de la barra compacta, bajo los botones, una línea atenuada `[data-in-flight]` dice «Aceptando…» o «Cerrando…». Va tras el motivo de solo lectura y antes de la línea de la verificación completa, a la que sustituye.
  - `ClosingActions` pasa a columna, como `AcceptanceActions` (`flex flex-col items-end gap-1.5 max-lg:items-start`), para poner la línea bajo su botón.
- **Tests**: los escritos antes que el código no usan tipos ni miembros que aún no existen: leen el DOM.
  - Usan una fuente que extiende `FixtureData` y deja `decideResult` o `confirmClosing` pendiente hasta que el test la resuelve o la rechaza.
  - El `Host` de cada test puede pintar además la versión compacta, para comprobar la cabecera y la barra a la vez, y dejar de pintar las acciones, para AC4.
  - Los de aceptar y cerrar que hoy esperan el diálogo abierto con el motivo pasan a esperar el aviso con el diálogo cerrado. El de cerrar que comprobaba la carga del botón del diálogo pasa a comprobar la de la cabecera. Los de pedir ajustes no cambian.

## Archivos

- crear packages/ui/src/data/in-flight.ts — el servicio raíz con las aceptaciones y los cierres que siguen en curso
- modificar packages/ui/src/acceptance/result-dialogs.ts — «Aceptar» cierra el diálogo y lanza la aceptación con `InFlight`
- modificar packages/ui/src/acceptance/acceptance-actions.ts — «Aceptar resultado» carga, «Pedir ajustes…» se desactiva y la cabecera dice «Aceptando…»
- modificar packages/ui/src/acceptance/acceptance-actions.test.ts — el diálogo se cierra, la cabecera y la barra en curso, el aviso al terminar o fallar, en inglés y al volver a la página
- modificar packages/ui/src/acceptance/closing-actions.ts — «Confirmar y archivar» cierra el diálogo, el botón carga y la cabecera dice «Cerrando…»
- modificar packages/ui/src/acceptance/closing-actions.test.ts — el diálogo se cierra, la cabecera y la barra en curso, el aviso al terminar o fallar, en inglés y al volver a la página
- modificar docs/ui.md — aceptar y confirmar el cierre cierran el diálogo y se ven en curso en la cabecera

## Tareas

- [ ] T1: Aceptar cierra el diálogo y la cabecera la muestra en curso
  - files: packages/ui/src/data/in-flight.ts, packages/ui/src/acceptance/result-dialogs.ts, packages/ui/src/acceptance/acceptance-actions.ts, packages/ui/src/acceptance/acceptance-actions.test.ts
  - ac: AC1, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/acceptance/acceptance-actions.test.ts --include src/acceptance/epic-adjust.test.ts --include src/acceptance/acceptance-tab.test.ts && pnpm --filter @baquia-dev/specty-ui typecheck
- [ ] T2: Confirmar el cierre cierra el diálogo y la cabecera lo muestra en curso
  - files: packages/ui/src/acceptance/closing-actions.ts, packages/ui/src/acceptance/closing-actions.test.ts
  - ac: AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/acceptance/closing-actions.test.ts --include src/change/change-page.closing.test.ts --include src/change/change-page.epic.test.ts && pnpm typecheck
- [ ] T3: ui.md cuenta que aceptar y cerrar cierran el diálogo y se ven en curso
  - files: docs/ui.md
  - ac: —
  - verify: grep -q "Aceptando…" docs/ui.md && grep -q "Cerrando…" docs/ui.md
  - type: docs

## Riesgos

- R1: Con el diálogo cerrado, un fallo solo queda en el aviso, que desaparece. Mitigación: el aviso de error es el de hoy y dice por qué; los botones vuelven a su estado para reintentarlo.
- R2: Si la petición nunca responde, la cabecera sigue diciendo «Aceptando…» hasta recargar la página. Mitigación: es lo mismo que hoy hace el diálogo, pero sin tapar la página; C4 añade la línea de por qué espera.
