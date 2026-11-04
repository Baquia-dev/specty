---
kind: standard
---

# Los recordatorios que esperan, en la página Memoria

## Objetivo

Resuelve P45. Hoy la página «Memoria» de `specty ui` muestra en «Te toca» todos los recordatorios abiertos, también los que esperan a su día, a las rutas de una tarea o a que se cierre un cambio. La tarjeta de inicio y «TE TOCA» de `specty status` ya los callan. Con este cambio, «Te toca» sigue la misma regla, los que esperan van a su propia sección, y cada recordatorio dice a qué espera: su día, sus rutas o el cambio.

## Fuera de alcance

- Cambiar cuándo se dispara un recordatorio, o cómo lo muestran la tarjeta de inicio y `status`.
- Editar el disparador de un recordatorio desde la página.

## Supuestos

- A1: La regla es la de `sessionEntries` del core: un recordatorio espera si tiene `paths` u `onClose`, o un `due` posterior al día local de hoy. La página lo calcula con el día local del navegador, como la CLI con el de la máquina.
  - impacto: alto
- A2: La UI importa `sessionEntries` y `localDay` desde la entrada ligera del core (`@baquia-dev/specty-core/light`): solo dependen del tipo de una entrada, así que no traen el parser, zod ni yaml.
- A3: Los que esperan van a la sección «Recordatorios que esperan», tras las lecciones y antes de las hechas y descartadas, por fecha, con su botón «Marcar hecho» como los de «Te toca».
- A4: La línea bajo un recordatorio añade «desde <día>» con `due`, «al cerrar <id>» con `onClose`, y las rutas como ya hace con las lecciones («en <rutas>»).

## Criterios de aceptación

- AC1: CUANDO la memoria tiene recordatorios que esperan a su día, a sus rutas o a que se cierre un cambio ENTONCES «Te toca» no los muestra, y la sección «Recordatorios que esperan» sí, por fecha.
- AC2: CUANDO el día de un recordatorio con `due` ya llegó ENTONCES está en «Te toca» y no en «Recordatorios que esperan».
- AC3: CUANDO la página muestra un recordatorio ENTONCES la línea bajo su texto dice a qué espera o esperaba: «desde <día>», «al cerrar <id>» o «en <rutas>».

## Diseño

- Core, `light.ts`: exporta `localDay` y `sessionEntries` de `memory/triggers.ts`.
- UI, `memory/memory-view.ts`: `memorySections(record, filter, today = localDay(new Date()))`; «Te toca» toma los recordatorios que `sessionEntries` deja, y la sección nueva `waiting` los demás.
- UI, `memory/memory-page.ts`: `entryLine` añade el día y el cambio que espera un recordatorio.

## Archivos

- modificar packages/core/src/light.ts — la regla de los recordatorios que esperan, para la UI
- modificar packages/ui/src/memory/memory-view.ts — «Te toca» sin los que esperan, y su propia sección
- crear packages/ui/src/memory/memory-waiting.test.ts — las secciones con recordatorios que esperan
- modificar packages/ui/src/memory/memory-page.ts — a qué espera cada recordatorio, en su línea
- crear packages/ui/src/memory/memory-reminders-page.test.ts — la página con recordatorios que esperan
- modificar docs/ARCHITECTURE.md — la página «Memoria» con los recordatorios que esperan

## Tareas

- [x] T1: «Te toca» sin los recordatorios que esperan, y su propia sección
  - files: packages/core/src/light.ts, packages/ui/src/memory/memory-view.ts, packages/ui/src/memory/memory-waiting.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/memory/memory-waiting.test.ts --include src/memory/memory-view.test.ts && pnpm lint
- [x] T2: A qué espera cada recordatorio, en la página
  - files: packages/ui/src/memory/memory-page.ts, packages/ui/src/memory/memory-reminders-page.test.ts
  - ac: AC1, AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/memory/memory-reminders-page.test.ts --include src/memory/memory-page.test.ts && pnpm typecheck && pnpm lint && pnpm exec knip
- [x] T3: La documentación de la página con los recordatorios que esperan
  - files: docs/ARCHITECTURE.md
  - ac: AC1, AC3
  - verify: pnpm lint
  - type: docs

## Cierre

### Resumen

La página «Memoria» de `specty ui` usa para «Te toca» la regla de la tarjeta de inicio y de «TE TOCA» de `specty status`: solo salen los recordatorios que ya tocan. Los que esperan a su día, a sus rutas o a que se cierre un cambio van, por fecha, a la sección nueva «Recordatorios que esperan», con su botón «Marcar hecho». La línea bajo cada recordatorio dice a qué espera o esperaba: «desde <día>», «al cerrar <id>» o «en <rutas>». La UI toma la regla (`sessionEntries` y `localDay`) de la entrada ligera del core, que solo depende del tipo de una entrada.

### Desviaciones

- `entryLine` pasaba de complejidad 10: lo que espera una entrada (su día, su cambio y sus rutas) salió a `waitsFor`.
- La primera verificación completa de `accept` falló sin que `pnpm check`, ejecutado a mano después, fallara. La segunda pasó sin cambiar nada: el fallo fue pasajero, como el del test de la extensión de VS Code que anota P10.

### Decisiones

- `memorySections` recibe el día como tercer argumento, con el de hoy por defecto, para que los tests no dependan del reloj.
- Los recordatorios que esperan siguen pudiéndose marcar hechos desde su sección.

### Pendientes

- `packages/ui/src/memory/memory-page.ts` tiene 304 líneas de código (el aviso salta a partir de 300). Propuesta de división por responsabilidad: llevar las líneas bajo cada fila (`entryLine`, `waitsFor` y `changeLine`) a `memory/memory-lines.ts`, como funciones puras que reciben el traductor, junto a `memory-view.ts`.
