---
kind: standard
epic: 20261107-flujo-configurable-en-la-ui
slice: C5
---

# La fase de cierre pasa a ser un ajuste

## Objetivo

Hoy, aceptar un cambio estándar siempre lo lleva a la fase de cierre: el agente redacta el cierre y la retro, y la persona lo cierra después. Con este cambio, la clave opcional `flow.closing` de `.specty/config.yaml` lo decide. Con `false`, aceptar un cambio estándar que no es corte de una épica lo cierra como hoy uno rápido: queda archivado con el resumen de sus tareas y aterriza, sin fase de cierre. Con `true` o sin la clave, todo sigue como hoy. La página «Configuración» muestra el ajuste en la sección Flujo con la marca «Nuevo». Es el corte C5 de la épica `20261107-flujo-configurable-en-la-ui`, estrechado: cubre su AC18, y AC25 y AC26 para esta clave.

## Fuera de alcance

- Las reglas de AC19 de la épica: cuántas tareas admite un cambio `quick`, cuándo se recomienda la revisión independiente y qué verificaciones ejecuta `task done`. Con ellas este corte salía XL, así que van a otro corte.
- La pieza «Fase de cierre» de la vista Flujo, que sigue como «Próximamente» hasta otro corte que la conecte a `flow.closing`, con su frase del modo básico.
- El diálogo «Aceptar» de la UI y su aviso, que dicen que después el agente redactará el cierre.
- Las épicas, los cortes de una épica, los spikes y los retros, que siguen como hoy.
- El guard y los permisos de cada fase (`phasePermissions`), y `propose` en aceptación: no cambian.
- Guardar ajustes desde la UI (C2 y C10) y los perfiles (C4).

## Supuestos

- A1: `flow` es un bloque nuevo de primer nivel en un módulo propio, `schema/flow.ts`, con su forma, sus valores por defecto y su `resolve`. `config.ts` los reúne con un spread, como los de `warnings.ts`. Por ahora solo tiene `closing`, un booleano opcional que vale `true` sin la clave, y una clave que no existe dentro de `flow` es un error. Las reglas de AC19 podrán sumarse a ese bloque en su corte.
  - impacto: medio
- A2: Sin fase de cierre, un cambio estándar se cierra como uno `quick` (A9 de la épica), con `closeQuick`. El `accept` de la persona, o el del agente en modo delegado, incorpora main y escribe como sección Cierre el resumen de sus tareas (`quickClosing`). Después archiva, hace el commit y aterriza en el turno de aterrizaje. No hay retro, y el agente no redacta nada. El registro `change.closed` lleva `closing: false` en lugar del `lane: quick` de un cambio rápido, para que el historial no lo llame rápido.
  - impacto: alto
- A3: Solo un cambio `standard` que no es corte de una épica, sin `epic` en el frontmatter de su spec, se queda sin fase de cierre. Los cortes la conservan, porque el corte siguiente toma de su cierre los pendientes (`follows`). La épica, el spike y el retro siguen igual (A9 de la épica).
  - impacto: alto
- A4: La regla vive en la máquina de estados. El evento `accept` lleva `withoutClosing`, y con él un cambio `standard` pasa de `acceptance` a `done`. La CLI lo calcula con la configuración de la carpeta del cambio y el frontmatter de su spec, y la vista del cambio (`ChangeView`) lo lleva. Con él, la tarjeta de aceptación en modo delegado deja de pedir el cierre antes de aceptar. Además, el `accept` del agente toma el turno de aterrizaje desde el principio, como en un cambio rápido (`closingTurn`).
  - impacto: medio
- A5: `flow.closing` va en la sección Flujo del catálogo, antes de `retro.mode`, como interruptor, con la marca «Nuevo» y sin la de «Afectan permisos». No deja al agente hacer nada sin la persona, porque solo la aceptación cierra el cambio, como hoy en uno rápido. Tampoco es uno de los ajustes básicos.
  - impacto: medio
- A6: Los textos nuevos van en `cards/settings.ts`, que ya pasa de 300 líneas de código y crece solo en la entrada de este ajuste.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO `.specty/config.yaml` no tiene `flow`, o tiene `flow.closing: true` ENTONCES aceptar un cambio estándar lo deja en la fase de cierre, como hoy, y en modo delegado la tarjeta de aceptación pide escribir el cierre antes de aceptar.
- AC2: CUANDO `flow.closing` es `false` y la persona acepta un cambio estándar que no es corte de una épica ENTONCES el cambio queda hecho, archivado con el resumen de sus tareas como cierre y aterrizado, sin pasar por la fase de cierre, y la salida dice «Cambio aceptado, cerrado y archivado».
- AC3: CUANDO `flow.closing` es `false` y el modo delegado está activo ENTONCES la tarjeta de un cambio estándar en aceptación pide aceptar el resultado sin escribir antes el cierre, y el `accept` del agente lo deja hecho y archivado.
- AC4: CUANDO `flow.closing` es `false` y se acepta un corte de una épica, un spike o una épica ENTONCES pasa a la fase de cierre, como hoy.
- AC5: CUANDO `flow.closing` no es un booleano, o `flow` tiene otra clave ENTONCES el validador del core da un error con su clave, y sin `flow` el valor efectivo es `true`.
- AC6: CUANDO la persona abre «Configuración» ENTONCES ve en la sección Flujo el ajuste «Fase de cierre» (`flow.closing`), un interruptor con la marca «Nuevo», su valor y el de por defecto, con su nombre y su descripción en español y en inglés.
- AC7: CUANDO se lee la documentación ENTONCES `docs/formats.md` §6 documenta `flow.closing`, con su valor por defecto y a qué cambios afecta, y `docs/ARCHITECTURE.md` dice que con `false` aceptar un cambio estándar lo archiva y lo incorpora sin la fase de cierre.
  - test: manual

## Diseño

- Core, `schema/flow.ts`: `FlowConfig` (`flow.closing`), `DEFAULT_FLOW`, `FLOW_SHAPE` (un `strictObject` opcional con `closing: z.boolean().optional()`) y `resolveFlow(input)`. `config.ts` extiende `ResolvedConfig` con `FlowConfig` y suma `...DEFAULT_FLOW`, `...FLOW_SHAPE` y `...resolveFlow(input)`.
- Core, `flow/machine.ts`: el evento `accept` gana `withoutClosing?: boolean`. Pasa a `done` un `quick`, o un `standard` con `withoutClosing`; lo demás pasa a `closing`. Core, `cards/view.ts`: `ChangeView.withoutClosing?: boolean`. Core, `cards/acceptance.ts`: con `withoutClosing`, `acceptanceCard` no muestra «CÓMO CERRAR» y `acceptanceNext` no pide el cierre antes de aceptar. `closingInAcceptance` no cambia, porque también lo usa el guard.
- Core, `settings/catalog.ts`: `{ key: "flow.closing", section: "flow", kind: "toggle", new: true }` antes de `retro.mode`. Core, `cards/settings.ts`: su nombre, «Fase de cierre» / «Closing phase», y su descripción en los dos idiomas.
- CLI, `flow/views.ts`: `withoutClosing(session, kind, spec)` vale `true` con `flow.closing: false` en un `standard` sin `epic` en el frontmatter. `changeView` lo pone en la vista, y `writesClosing` no da las observaciones del cierre en aceptación a ese cambio. CLI, `commands/accept.ts`: pasa `view.withoutClosing` al evento `accept`; si el cambio queda en `done`, lo cierra `closeQuick`, como hoy a uno rápido. CLI, `flow/closing-turn.ts`: `closingTurn` toma el turno para el `accept` del agente también en ese cambio, y `closeQuickOnTurn` registra `closing: false` en lugar de `lane: quick` si el cambio no es `quick`.
- Tests: `core/test/settings/catalog.test.ts` (AC5, AC6, con las listas exactas de las marcas), `core/test/closing-ahead.test.ts` (AC1, AC3 y AC4 en la máquina y la tarjeta) y `cli/test/closing-ahead.test.ts` (AC1 a AC4 de punta a punta, con un `config.yaml` con `flow.closing: false`).

## Archivos

- crear packages/core/src/schema/flow.ts — la clave `flow.closing`, con su valor por defecto
- modificar packages/core/src/schema/config.ts — reúne `flow` en el schema, en `ResolvedConfig` y en `DEFAULT_CONFIG`
- modificar packages/core/src/settings/catalog.ts — el ajuste `flow.closing` en la sección Flujo, con la marca `new`
- modificar packages/core/src/cards/settings.ts — el nombre y la descripción de `flow.closing` en español y en inglés
- modificar packages/core/src/flow/machine.ts — `accept` con `withoutClosing` lleva un cambio estándar a `done`
- modificar packages/core/src/cards/view.ts — `withoutClosing` en la vista del cambio
- modificar packages/core/src/cards/acceptance.ts — sin fase de cierre, la tarjeta no pide el cierre antes de aceptar
- modificar packages/cli/src/flow/views.ts — calcula `withoutClosing` con la configuración y el frontmatter
- modificar packages/cli/src/commands/accept.ts — acepta con `withoutClosing` y cierra con `closeQuick` el cambio que queda hecho
- modificar packages/cli/src/flow/closing-turn.ts — el turno del `accept` del agente y el registro `closing: false`
- modificar packages/core/test/settings/catalog.test.ts — el schema de `flow`, el ajuste nuevo, sus marcas y sus textos
- modificar packages/core/test/closing-ahead.test.ts — la máquina y la tarjeta de aceptación con y sin fase de cierre
- modificar packages/cli/test/closing-ahead.test.ts — aceptar con `flow.closing: false`, de la persona y en modo delegado, y un corte que conserva su cierre
- modificar docs/formats.md — §6: `flow.closing`
- modificar docs/ARCHITECTURE.md — §4 y §9: el cambio estándar sin fase de cierre

## Tareas

- [x] T1: La clave `flow.closing` en el schema y en el catálogo, con sus textos
  - files: packages/core/src/schema/flow.ts, packages/core/src/schema/config.ts, packages/core/src/settings/catalog.ts, packages/core/src/cards/settings.ts, packages/core/test/settings/catalog.test.ts
  - ac: AC5, AC6
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/settings/catalog.test.ts
- [x] T2: La máquina de estados y la tarjeta de aceptación sin fase de cierre
  - files: packages/core/src/flow/machine.ts, packages/core/src/cards/view.ts, packages/core/src/cards/acceptance.ts, packages/core/test/closing-ahead.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC3, AC4, AC7
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/closing-ahead.test.ts
- [x] T3: `accept` cierra y aterriza un cambio estándar sin fase de cierre, y `formats.md` documenta la clave
  - files: packages/cli/src/flow/views.ts, packages/cli/src/commands/accept.ts, packages/cli/src/flow/closing-turn.ts, packages/cli/test/closing-ahead.test.ts, docs/formats.md
  - ac: AC1, AC2, AC3, AC4, AC7
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/closing-ahead.test.ts && pnpm typecheck

## Riesgos

- R1: Apagar la fase de cierre quita el cierre que redacta el agente, con sus decisiones, desviaciones y pendientes, y la retro, de los cambios estándar. Mitigación: lo decide la persona en su `config.yaml`, con su commit. El resumen de las tareas queda como cierre, y los cortes de una épica conservan el suyo, del que el siguiente toma los pendientes.
- R2: La aprobación de la spec, la del contrato de tests, la aceptación de la persona y el guard son garantías con candado (A2 de la épica). Mitigación: este cambio no toca el guard ni los permisos de cada fase, y sin fase de cierre el cambio solo aterriza al aceptarlo la persona, o su agente en modo delegado.
- R3: C4, C13, C15 y C19 tocan en paralelo `config.ts`, el catálogo, sus textos, sus tests y `docs/formats.md` §6. Mitigación: la clave va en su módulo y en su línea del catálogo, y al incorporar main `specty integrate` conserva lo de los dos.
