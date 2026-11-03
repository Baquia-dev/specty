---
kind: standard
epic: 20261030-memoria-de-specty
slice: C6
---

# specty note deja una bitácora del cambio para la sesión que lo retoma

## Objetivo

Lo que un agente averigua a mitad de un cambio (por qué eligió una ruta, qué probó, dónde se quedó) vive solo en su conversación, y se pierde con `/clear`, al compactar o en otra sesión. Con este corte, `specty note "<texto>"` lo anota en el audit del cambio, y la tarjeta de `specty next`, que es también la de inicio de una sesión en su carpeta, muestra las tres últimas notas. Es el AC11 de la épica.

## Fuera de alcance

- Las notas en la memoria de Specty o en otros cambios: la bitácora es del cambio y viaja con él al archivo.
- Editar o borrar notas: el audit solo crece.
- Mostrar las notas en `specty ui` o en `specty audit` con formato propio: van en el corte C7 o después.

## Supuestos

- A1: Una nota es un evento `change.noted` del audit del cambio abierto de la carpeta, con su texto en `data.text`, y quién y cuándo como cualquier evento. La anotan el agente y la persona, en cualquier fase del cambio abierto.
  - impacto: alto
- A2: La tarjeta de `next` de cualquier fase muestra las tres últimas notas, de la más antigua a la más reciente, en la sección «BITÁCORA», con la fecha y la hora (UTC, hasta el minuto) y la primera línea de su texto. Sin notas, la tarjeta no cambia.
  - impacto: alto
- A3: Anotar no hace commit: el audit viaja con el siguiente commit de Specty del cambio, como los demás eventos.
- A4: `specty note` toma el lock del cambio, como `adjust`, porque escribe su audit.

## Criterios de aceptación

- AC1: CUANDO el agente ejecuta `specty note "<texto>"` en la carpeta de un cambio abierto ENTONCES la nota queda en el audit del cambio como `change.noted`, con el texto y quién la anotó, y la tarjeta lo confirma.
- AC2: CUANDO una sesión recibe la tarjeta de `next` de un cambio con notas ENTONCES la tarjeta muestra las tres últimas en «BITÁCORA», con su fecha y hora.
- AC3: CUANDO no hay un cambio abierto en la carpeta, o el texto está vacío ENTONCES `specty note` no anota nada y dice por qué.

## Diseño

- Core:
  - `cards/notes.ts`, nuevo: `notedCard(id, text, ctx)`, `noteRefusalCard(refusal, ctx)` (`empty` o `no-change`) y `notesBlock(notes, ctx)`, la sección «BITÁCORA».
  - `ChangeView` gana `notes`, las tres últimas (`NoteView`: `at` y `text`), y `nextCard` añade `notesBlock` a la tarjeta de cada fase.
- CLI:
  - `commands/note.ts`, nuevo: `noteCommand(program, run)` registra `specty note <text>` con el lock del cambio, y `note(session, text)` anota `change.noted` con `appendAudit` y `auditEntry`.
  - `flow/views.ts`: `changeView` lee las notas del audit que ya lee.

## Archivos

- crear packages/core/src/cards/notes.ts — las tarjetas de `specty note` y la sección «BITÁCORA»
- modificar packages/core/src/cards/view.ts — `ChangeView.notes` y `NoteView`
- modificar packages/core/src/cards/next.ts — la bitácora en la tarjeta de cada fase
- modificar packages/core/src/cards/index.ts — exporta lo nuevo
- crear packages/cli/src/commands/note.ts — el comando `specty note`
- modificar packages/cli/src/commands/agent-commands.ts — lo registra
- modificar packages/cli/src/flow/views.ts — las notas en la vista del cambio
- crear packages/core/test/cards/notes.test.ts — las tarjetas y la sección, en español y en inglés
- crear packages/cli/test/note.test.ts — anotar, verlas en `next` y negarse, con un cambio real
- modificar docs/formats.md — el evento `change.noted`
- modificar docs/ARCHITECTURE.md — el comando `specty note`

## Tareas

- [ ] T1: Las tarjetas de `specty note` y la bitácora en la tarjeta de `next`
  - files: packages/core/src/cards/notes.ts, packages/core/src/cards/view.ts, packages/core/src/cards/next.ts, packages/core/src/cards/index.ts, packages/core/test/cards/notes.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/notes.test.ts test/cards/findings.test.ts && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint
- [ ] T2: El comando `specty note` y las notas en la vista del cambio, y la documentación
  - files: packages/cli/src/commands/note.ts, packages/cli/src/commands/agent-commands.ts, packages/cli/src/flow/views.ts, packages/cli/test/note.test.ts, docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/note.test.ts test/request.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: La tarjeta de `next` se alarga en cada llamada — solo con notas, y como mucho tres, en una línea cada una.
- R2: Un agente anota demasiado — solo salen las tres últimas; el audit las guarda todas.
