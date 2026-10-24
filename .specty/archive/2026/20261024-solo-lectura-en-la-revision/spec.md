---
kind: standard
---

# Solo lectura en la revisión

## Objetivo

Cuando la UI corre sobre un servidor de solo lectura, porque lo arrancó el agente o porque la pestaña no tiene sesión, la revisión ya no ofrece decisiones que van a fallar. Los botones de la cabecera aparecen desactivados con el motivo, y las acciones en línea no se muestran. Hoy todo aparece activo y falla al pulsarlo con un aviso. Es la primera de dos partes; la aceptación, el alcance y el modo delegado van en la segunda.

## Fuera de alcance

- La aceptación, el cierre, las solicitudes de alcance y el modo delegado: van en el cambio siguiente.
- Un aviso general de solo lectura en la cabecera de la app.

## Supuestos

- A1: Mientras la fuente no responde si se puede decidir, los botones siguen activos. Si la persona pulsa uno y el servidor lo rechaza, el aviso explica por qué, como hasta ahora.
- A2: Basta con desactivar los botones de la cabecera con el motivo visible y ocultar las acciones en línea. La cabecera ya explica por qué no se puede decidir, y así la página no se llena de botones apagados.

## Criterios de aceptación

- AC1: CUANDO la UI corre sobre un servidor que arrancó el agente, o sin sesión ENTONCES sabe que no puede decidir y por qué, en el idioma de la persona. Con los datos de ejemplo o con el servidor de la persona, sí puede.
- AC2: CUANDO la persona abre una spec en revisión en una UI de solo lectura ENTONCES «Aprobar revisión» y «Pedir cambios» aparecen desactivados, con el motivo en el tooltip y visible en la cabecera.
- AC3: CUANDO la UI es de solo lectura ENTONCES la revisión no muestra las acciones en línea: comentar un ítem o la selección, confirmar o rechazar supuestos, ni el formulario de comentario.
- AC4: CUANDO la spec no está en revisión ENTONCES los criterios, las tareas y los riesgos ya no ofrecen «Comentar», igual que los supuestos.
- AC5: CUANDO alguien lee el documento de la UI ENTONCES encuentra cómo se ve la revisión en solo lectura.

## Diseño

- `SpectyData.readOnly()` dice por qué no se puede decidir desde la fuente, o nada si se puede. La base responde su propio «solo lectura», `FixtureData` no responde nada, y `ServerData` responde según `GET /api/session`: solo lectura sin acciones, el motivo del fallo sin sesión.
- `Decisions` (`data/decisions.ts`) le pregunta una vez a la fuente y da `blocked`, el motivo en el idioma de la persona o vacío, y `allowed`.
- `ReviewActions` suma ese motivo al de cada botón, y lo muestra bajo los botones como el de los supuestos pendientes. `SpecReview` solo deja editar (`editable`) en revisión y si se puede decidir, y `ReviewItems` recibe `editable` como los demás.

## Archivos

- modificar packages/ui/src/data/source.ts — `readOnly()` en el contrato
- modificar packages/ui/src/data/fixtures.ts — los datos de ejemplo deciden
- modificar packages/ui/src/data/server.ts — solo lectura según la sesión
- modificar packages/ui/src/data/server-actions.test.ts — `readOnly()` del servidor
- crear packages/ui/src/data/decisions.ts — si se puede decidir aquí, y por qué no
- crear packages/ui/src/data/decisions.test.ts — tests de `Decisions`
- modificar packages/ui/src/review/review-actions.ts — botones desactivados con el motivo
- modificar packages/ui/src/review/review-actions.test.ts — tests de los botones
- modificar packages/ui/src/review/spec-review.ts — acciones en línea solo si se puede decidir
- modificar packages/ui/src/review/spec-review.test.ts — tests de la revisión de solo lectura
- modificar packages/ui/src/review/spec-sections.ts — «Comentar» de los ítems solo si se edita
- modificar packages/ui/src/review/spec-sections.test.ts — tests de los ítems
- modificar docs/ui.md — la revisión en solo lectura

## Tareas

- [x] T1: La fuente dice si se puede decidir
  - files: packages/ui/src/data/source.ts, packages/ui/src/data/fixtures.ts, packages/ui/src/data/server.ts, packages/ui/src/data/server-actions.test.ts, packages/ui/src/data/decisions.ts, packages/ui/src/data/decisions.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data && pnpm sources
- [x] T2: La revisión sin decisiones en solo lectura
  - files: packages/ui/src/review/review-actions.ts, packages/ui/src/review/review-actions.test.ts, packages/ui/src/review/spec-review.ts, packages/ui/src/review/spec-review.test.ts, packages/ui/src/review/spec-sections.ts, packages/ui/src/review/spec-sections.test.ts
  - ac: AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/review && pnpm sources
- [x] T3: Documentar la revisión en solo lectura
  - files: docs/ui.md
  - ac: AC5
  - verify: pnpm check
  - type: docs

## Cierre

### Resumen

La revisión ya no ofrece decisiones que van a fallar. `SpectyData.readOnly()` dice si se puede decidir desde la fuente: un servidor que arrancó el agente o una pestaña sin sesión no lo permiten, y los datos de ejemplo sí. `Decisions` lo pregunta una vez. En solo lectura, «Pedir cambios» y «Aprobar» aparecen desactivados con el motivo, y la revisión se ve como fuera de revisión: sin «Comentar», sin Confirmar / Rechazar y sin formulario de comentario. De paso, criterios, tareas, riesgos, supuestos y el delta ya no ofrecen «Comentar» fuera de la revisión.

### Desviaciones

- T2 también tocó `assumption-row.ts` y `delta-review.ts` (ampliación S1): su «Comentar» no miraba `editable`.
- Los tests de `Markdown` pasaron de `spec-sections.test.ts` a `markdown.test.ts`, junto a su componente, para que el primero no pasara de 300 líneas.

### Decisiones

- Los botones de la cabecera se desactivan con el motivo visible en vez de ocultarse. Así se entiende por qué no se puede decidir y cómo hacerlo; las acciones en línea se ocultan para no llenar la página de botones apagados.
- Mientras la fuente no responde, nada se desactiva: un rechazo se sigue explicando con un aviso (A1).

### Pendientes

- La aceptación, el cierre, las solicitudes de alcance y el modo delegado, en el cambio siguiente.
