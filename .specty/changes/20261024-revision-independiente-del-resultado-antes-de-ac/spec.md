---
kind: standard
follows:
  - 20261024-revision-independiente-de-la-spec-con-un-modelo
---

# Revisión independiente del resultado antes de aceptar

## Objetivo

La revisión independiente del ADR 0011 cubre también el resultado: con el cambio en aceptación, `specty review` pasa al comando de la persona la spec y el diff de todo el cambio, guarda la respuesta y se la enseña al agente, que se la cuenta al usuario o pide un ajuste si hay un defecto real. La tarjeta de aceptación la recomienda, una vez por ronda de aceptación, cuando el cambio es L o XL, o alguna tarea quitó aserciones o añadió riesgos conocidos.

## Fuera de alcance

- Que el modelo recomiende el esfuerzo: irá en el cambio siguiente.
- Partir `core/src/guard/decide.ts`: este cambio no lo toca.
- Mostrar la revisión en la UI.
- Revisar el diff tarea a tarea.

## Supuestos

- A1: El diff es el de todo el cambio, del commit base de su primera tarea al commit de la última, sin `.specty/`: el mismo que da `/api/changes/<id>/diff` (`changeDiff`). Si pasa de su límite, la revisión no se lanza y lo dice.
  - impacto: medio
- A2: La recomendación sale si no hay una revisión del resultado posterior a la última tarea completada: después de un ajuste con tareas nuevas vuelve a salir, y tras una revisión, no.
  - impacto: medio
- A3: El tamaño para decidir es el que guardó `propose` en `state.json` (`size.level`).
- A4: La respuesta se guarda en `reviews/diff-<n>.md`, con `n` el número de revisiones del resultado del cambio, y `review.completed` lleva `target: "diff"`.

## Criterios de aceptación

- AC1: CUANDO hay `review.command` y el cambio llega a aceptación siendo L o XL, o con aserciones quitadas o riesgos en alguna tarea, sin revisión del resultado después de la última tarea ENTONCES el SIGUIENTE de la tarjeta de aceptación pide `specty review` antes de la aceptación; si no, el de siempre.
- AC2: CUANDO el agente ejecuta `specty review` en aceptación ENTONCES el comando recibe las instrucciones para revisar código, la spec y el diff del cambio, la respuesta queda en `reviews/diff-<n>.md` y en la salida, `review.completed` lleva `target: "diff"`, y el SIGUIENTE pide contárselo al usuario y pedir la aceptación o un ajuste (o aceptar o ajustar él mismo en modo delegado).
- AC3: CUANDO el diff del cambio no existe o es demasiado grande ENTONCES `specty review` lo explica sin ejecutar el comando.
- AC4: CUANDO alguien lee el ADR 0011, ARCHITECTURE y formats.md ENTONCES encuentra la revisión del resultado.

## Diseño

- Core, `cards/review.ts`: `diffReviewPrompt(spec, diff, lang)` y `ReviewedView.target`, que cambia el SIGUIENTE de `reviewedCard`; `ChangeView.recommendReview` cambia el SIGUIENTE de la tarjeta de aceptación.
- CLI: `specty review` en aceptación usa `changeDiff` (`server/diff.ts`); `changeView` calcula la recomendación con la configuración, el tamaño guardado, los avisos de las tareas y la auditoría.

## Archivos

- modificar packages/core/src/cards/review.ts — el texto para revisar el resultado y su SIGUIENTE
- modificar packages/core/src/cards/view.ts — `ChangeView.recommendReview`
- modificar packages/core/src/cards/work.ts — la aceptación recomienda la revisión
- modificar packages/core/src/index.ts — exportar lo nuevo
- modificar packages/core/test/cards/review.test.ts — el texto, el SIGUIENTE y la recomendación
- modificar packages/cli/src/commands/review.ts — la revisión del resultado en aceptación
- modificar packages/cli/src/flow/views.ts — cuándo se recomienda en aceptación
- modificar packages/cli/test/review.test.ts — de punta a punta en aceptación
- modificar docs/decisions/0011-revision-independiente.md — la revisión del resultado ya está
- modificar docs/ARCHITECTURE.md — `specty review` también en aceptación
- modificar docs/formats.md — `reviews/diff-<n>.md` y `target: "diff"`

## Tareas

- [x] T1: La revisión del resultado en core
  - files: packages/core/src/cards/review.ts, packages/core/src/cards/view.ts, packages/core/src/cards/work.ts, packages/core/src/index.ts, packages/core/test/cards/review.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards
- [x] T2: specty review en aceptación
  - files: packages/cli/src/commands/review.ts, packages/cli/src/flow/views.ts, packages/cli/test/review.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/review.test.ts
- [x] T3: Documentar la revisión del resultado
  - files: docs/decisions/0011-revision-independiente.md, docs/ARCHITECTURE.md, docs/formats.md
  - ac: AC4
  - verify: pnpm check
  - type: docs
