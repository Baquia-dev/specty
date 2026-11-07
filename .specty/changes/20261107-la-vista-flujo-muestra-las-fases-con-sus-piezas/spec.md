---
kind: standard
epic: 20261107-flujo-configurable-en-la-ui
slice: C3
---

# La vista Flujo muestra las fases con sus piezas para ver, equipar y quitar

## Objetivo

La página «Configuración» gana la vista Flujo de la propuesta B: las fases de un cambio en línea, cada una con las piezas que la configuración equipa, y las garantías de Specty con candado. En Básico, la línea se ve sin controles y unas frases dicen qué hace el flujo; en Avanzado, la persona elige una fase, ajusta sus piezas, las quita o equipa otras, y lo guarda con «Revisar y guardar». La vista General, en Básico, muestra solo los ajustes básicos.

## Fuera de alcance

- Los perfiles Ligero, Equilibrado, Estricto y Propio (C4) y las claves nuevas de C5, como `flow.closing`: la pieza «Fase de cierre» se ve sin control.
- Arrastrar piezas para ordenarlas o cambiarlas de fase: cada pieza tiene su fase fija.
- Cambiar el servidor o el diálogo «Revisar y guardar»: la vista Flujo guarda con los de C2 y C10.
- Llevar la vista y el modo a la URL: los recuerda el navegador.

## Supuestos

- A1: Las piezas viven en `packages/core/src/settings/pieces.ts`, puro y en la entrada ligera, con sus textos en `cards/settings-pieces.ts`. Cada pieza tiene un id, su fase y los ajustes del catálogo con que se ajusta. Las fases de la línea son Borrador, Revisión, Tests, Implementación, Aceptación y Cierre, y Tests solo sale con `policy.tests: contract`.
  - impacto: alto
- A2: Las piezas de cada fase son estas. Borrador: glosario del dominio, avisos de la spec y una carpeta por cambio. Revisión: tu aprobación de la spec (garantía), revisión independiente y modo delegado. Tests: tu aprobación del contrato de tests (garantía). Implementación: política de tests, verificación de la tarea, comprobación rápida, `specty check` de lo cambiado, límite de líneas, subagentes, ampliación automática, `specty check` en el pre-commit y guard del agente (garantía). Aceptación: verificación completa, cobertura del diff y tu aceptación (garantía). Cierre: fase de cierre (Próximamente), retro del agente y al incorporar un cambio.
  - impacto: alto
- A3: Una pieza se equipa de una de tres formas. Las de sí o no (una carpeta por cambio, subagentes, ampliación automática, pre-commit y retro del agente) tienen una clave con un valor que la equipa y otro que la quita; si ese valor es el de por defecto, la edición quita la clave del archivo. Las de comando (revisión independiente, comprobación rápida y al incorporar un cambio) están equipadas mientras su comando tiene valor: quitarlas quita sus claves, y equiparlas abre sus ajustes para escribir el comando. Las demás están siempre equipadas y solo se ajustan. Las garantías y la fase de cierre no tienen control.
  - impacto: alto
- A4: Una pieza está equipada según el valor del archivo con las ediciones sin guardar o, sin él, el de por defecto, y el modo delegado según el del clon. Así la línea y las listas cambian al equipar o quitar, antes de guardar. Equipar, quitar o ajustar una pieza son ediciones de la página, como las de la vista General: cuentan en «Revisar y guardar» y se guardan con su diálogo.
  - impacto: medio
- A5: Las cuatro garantías (la aprobación de la spec, la del contrato de tests, la aceptación de la persona y el guard del agente) son piezas con candado, la marca «Garantía de Specty» y una frase de por qué no se quitan. No tienen clave ni control, y nunca salen entre las piezas para equipar.
  - impacto: medio
- A6: La pieza «Modo delegado» usa el control del menú de preferencias (`sp-delegation-setting`), con sus diálogos de activar y desactivar, y se aplica al momento por `/api/delegation`, sin diff ni commit. Está equipada mientras el modo está activo.
  - impacto: bajo
- A7: Bajo el encabezado, la página tiene dos selectores: la vista (General o Flujo) y el modo (Básico o Avanzado). El navegador los recuerda, como la agrupación de la Bandeja, y la primera vez abre en General y en Avanzado, como hoy (AC1 de la épica). En Básico, la vista General oculta el buscador y los filtros y muestra los 12 ajustes que el catálogo marca como básicos (`basic`): idioma, forma de trabajo, tests, subagentes, retro, verificación de cada tarea, verificación completa, tiempo máximo por comando, una carpeta por cambio, nombres de rama, al incorporar un cambio y comando de revisión.
  - impacto: medio
- A8: En Básico, bajo la línea, unas frases dicen qué hace el flujo configurado: la política de tests, la verificación de cada tarea, la completa, la revisión independiente, los archivos de un cambio rápido y el modo delegado. Las da el core (`flowSentences`) en español y en inglés, con los comandos entre comillas invertidas, que la UI muestra en mono.
  - impacto: bajo
- A9: En Avanzado, cada fase de la línea es un botón que la elige, e Implementación está elegida al abrir. Debajo, «Equipado en» y el nombre de la fase lista sus piezas, cada una con su descripción, sus ajustes (las filas de la vista General, con sus controles y «Restablecer») y «Quitar» si se puede quitar. «Para equipar» lista las que no están equipadas, con «Equipar». En solo lectura no hay «Equipar» ni «Quitar», y las filas muestran su valor.
  - impacto: medio

## Criterios de aceptación

- AC1: CUANDO la persona abre la vista Flujo ENTONCES ve en línea las fases Borrador, Revisión, Implementación, Aceptación y Cierre, cada una con su número de piezas y las piezas que la configuración equipa. Con `policy.tests: contract` ve también Tests, entre Revisión e Implementación.
- AC2: CUANDO una pieza es una garantía de Specty ENTONCES se ve con candado, la marca «Garantía de Specty» y una frase de por qué no se quita, sin «Quitar» ni controles. Lo son la aprobación de la spec, la del contrato de tests, la aceptación de la persona y el guard del agente.
- AC3: CUANDO está en Básico ENTONCES la línea de fases no tiene botones para elegir una fase, equipar ni quitar, y debajo unas frases dicen qué hace el flujo configurado.
- AC4: CUANDO está en Básico en la vista General ENTONCES ve solo los ajustes básicos, sin buscador ni filtros, y una línea dice cuántos ajustes más hay en Avanzado, con un botón que lo abre.
- AC5: CUANDO está en Avanzado y elige una fase ENTONCES ve sus piezas equipadas, cada una con sus ajustes y sus controles, y la lista de piezas que se pueden equipar.
- AC6: CUANDO quita o equipa una pieza de sí o no ENTONCES la pieza cambia de lista y de línea al momento, su clave toma el valor que la quita o la equipa (o sale del archivo si es el de por defecto), y «Revisar y guardar» cuenta el cambio y lo guarda con su diálogo.
- AC7: CUANDO quita una pieza de comando ENTONCES sus claves salen del archivo. CUANDO la equipa ENTONCES ve sus ajustes para escribir el comando, y al escribirlo queda equipada.
- AC8: CUANDO enciende o apaga la pieza «Modo delegado» ENTONCES se abre el mismo diálogo que en el menú de preferencias y, al confirmar, se aplica al momento en el clon, sin pasar por «Revisar y guardar».
- AC9: CUANDO una pieza todavía no tiene clave, como la fase de cierre, ENTONCES se ve con la marca «Próximamente» y sin control.
- AC10: CUANDO la página es de solo lectura ENTONCES la vista Flujo en Avanzado no tiene «Equipar» ni «Quitar», y los ajustes de sus piezas muestran su valor.
- AC11: CUANDO la persona cambia la vista o el modo y vuelve a abrir la página ENTONCES la encuentra en la vista y el modo que eligió.
- AC12: CUANDO la UI está en inglés ENTONCES las fases, las piezas, sus descripciones, las garantías, las frases y los selectores salen en inglés.

## Diseño

- Core (`settings/pieces.ts`): `FLOW_PHASES`, `PIECES` (cada una con `id`, `phase`, `keys` y, según A3, `toggle` con su clave y sus valores `on` y `off`, `command` con su clave, o `guarantee`, `soon` o `clone`), `flowPhases(value)`, `isEquipped(piece, value)` y `pieceEdits(piece, equip, fallback)`. `value` y `fallback` dan el valor de una clave con puntos. Cada edición pasa `settingOf`, así que el servidor la acepta. El catálogo gana la marca `basic`. Todo se exporta desde `light.ts`.
- Textos (`cards/settings-pieces.ts`): `pieceText(id, lang)` da el nombre, la descripción y, de una garantía, por qué no se quita; `flowSentences(value, lang)` da las frases de A8.
- UI: `settings/settings-mode.ts` tiene el servicio `SettingsMode` (la vista y el modo en `localStorage`, como `InboxState`) y `sp-settings-views`, con los dos `sp-segmented`. `settings/settings-flow.ts` (`sp-settings-flow`) dibuja la línea de fases, cada fase con el tono y el icono de `sp-phase-badge` y sus piezas, las frases en Básico y, en Avanzado, la fase elegida con «Equipado en…» y «Para equipar». `settings/flow-piece.ts` (`sp-flow-piece`) es una pieza en Avanzado: nombre, marcas, descripción, candado y por qué, sus filas `sp-setting-row` y «Quitar» o «Equipar», o el control del modo delegado. `settings/settings-page.ts` pone los selectores bajo el encabezado, filtra General en Básico y le pasa a `sp-settings-flow` las filas, los campos y los valores con las ediciones; las ediciones de la vista Flujo entran por el mismo `write` que las de General.
- Tests: en el core, `test/settings/pieces.test.ts` compara las listas exactas de fases, piezas, garantías y ajustes básicos, y comprueba las piezas equipadas, sus ediciones, sus textos y las frases. En la UI, por la página como los de C10: `settings-mode.test.ts` (los selectores, su recuerdo y General en Básico), `settings-flow.test.ts` (la línea, las garantías, Básico, «Próximamente» y el inglés) y `flow-piece.test.ts` (elegir fase, quitar, equipar, comandos, modo delegado y solo lectura).

## Archivos

- crear packages/core/src/settings/pieces.ts — las fases del flujo, sus piezas, cuándo están equipadas y sus ediciones
- crear packages/core/src/cards/settings-pieces.ts — el nombre, la descripción y la garantía de cada pieza, y las frases del flujo, en español y en inglés
- modificar packages/core/src/settings/catalog.ts — la marca `basic` de los ajustes del modo básico
- modificar packages/core/src/light.ts — exporta las piezas, sus textos y las frases
- crear packages/core/test/settings/pieces.test.ts — las fases, las piezas, las garantías, los ajustes básicos, las ediciones y los textos
- crear packages/ui/src/settings/settings-mode.ts — la vista y el modo de la página, recordados en el navegador, y sus selectores
- crear packages/ui/src/settings/settings-mode.test.ts — los selectores, su recuerdo y General en Básico
- crear packages/ui/src/settings/settings-flow.ts — la vista Flujo: la línea de fases, las frases y la fase elegida
- crear packages/ui/src/settings/settings-flow.test.ts — la línea, las garantías, Básico, «Próximamente» y el inglés
- crear packages/ui/src/settings/flow-piece.ts — una pieza en Avanzado, con sus ajustes y sus acciones
- crear packages/ui/src/settings/flow-piece.test.ts — elegir fase, equipar, quitar, comandos, modo delegado y solo lectura
- modificar packages/ui/src/settings/settings-page.ts — los selectores, General en Básico y la vista Flujo con las ediciones de la página
- modificar docs/ui.md — la vista Flujo y los modos de la página Configuración

## Tareas

- [x] T1: El core define las fases del flujo y sus piezas, con las garantías, sus ediciones, sus textos y los ajustes básicos
  - files: packages/core/src/settings/pieces.ts, packages/core/src/cards/settings-pieces.ts, packages/core/src/settings/catalog.ts, packages/core/src/light.ts, packages/core/test/settings/pieces.test.ts
  - ac: AC1, AC2, AC3, AC4, AC6, AC7, AC9, AC12
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/settings/pieces.test.ts
- [x] T2: La página elige la vista y el modo, los recuerda, y General en Básico muestra los ajustes básicos
  - files: packages/ui/src/settings/settings-mode.ts, packages/ui/src/settings/settings-mode.test.ts, packages/ui/src/settings/settings-page.ts
  - ac: AC4, AC11
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/settings/settings-mode.test.ts
- [ ] T3: La vista Flujo muestra la línea de fases con sus piezas, las garantías con candado y, en Básico, sus frases
  - files: packages/ui/src/settings/settings-flow.ts, packages/ui/src/settings/settings-flow.test.ts, packages/ui/src/settings/settings-page.ts
  - ac: AC1, AC2, AC3, AC9, AC12
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/settings/settings-flow.test.ts
- [ ] T4: En Avanzado, cada fase muestra sus piezas con sus ajustes y deja equiparlas, quitarlas y encender el modo delegado
  - files: packages/ui/src/settings/flow-piece.ts, packages/ui/src/settings/flow-piece.test.ts, packages/ui/src/settings/settings-flow.ts, docs/ui.md
  - ac: AC2, AC5, AC6, AC7, AC8, AC10, AC12
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/settings/flow-piece.test.ts && pnpm typecheck && pnpm lint && pnpm sources && pnpm knip

## Riesgos

- R1: `settings-page.ts` ya pasa de 440 líneas. Mitigación: la vista Flujo, sus piezas y los selectores van en sus propios archivos, y la página solo gana los selectores, el filtro de Básico y el paso de datos a la vista Flujo.
- R2: C13 a C16 y C18 cambian el catálogo y sus tests en paralelo. Mitigación: la marca `basic` solo toca líneas de ajustes de flujo, verificación, git y revisión, y su test va en `pieces.test.ts`, no en `catalog.test.ts`; al incorporar main se conservan las dos partes.
- R3: Una pieza sin clave hasta C5, como la fase de cierre, no se puede quitar todavía. Mitigación: se ve con «Próximamente» y sin control, y C5 la conecta (R5 de la épica).
