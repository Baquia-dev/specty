---
kind: standard
---

# Los huérfanos que son épicas los retoma la sesión, y el encargo para retomar se para ante una épica

## Objetivo

Con una herramienta que reparte en subagentes, la tarjeta sin cambio activo pide retomar cada huérfano con un subagente y el «ENCARGO PARA RETOMAR», que le prohíbe lanzar otros. Una épica huérfana no puede ir así, porque su tarjeta pide un subagente por corte (P260): el bloque la marca y pide que la retome la propia sesión. Además, el encargo para retomar gana el paso que ya lleva el de un cambio nuevo: si `propose` pide dividir el cambio en una épica, detenerse y responder con eso (P261).

## Fuera de alcance

- El SIGUIENTE de la tarjeta sin cambio activo: ya pide que la sesión convierta en épica el cambio del subagente que vuelve porque es demasiado grande.
- Los cortes huérfanos de una épica, que reparte la tarjeta de la épica con su propio encargo.
- La Bandeja y `status`, que ya dicen el tipo de cada cambio.

## Supuestos

- A1: Toda épica huérfana, en cualquier fase y también en borrador, la retoma la propia sesión. Un subagente que la llevara hasta su cierre llegaría a la tarjeta de la épica aprobada, que pide lanzar un subagente por corte, y el encargo se lo prohíbe.
  - impacto: alto
- A2: Con subagentes, la sesión retoma la épica en su carpeta como hoy sin ellos: `EnterWorktree` con `name` en Claude Code con los hooks de las worktrees, `specty enter <id>` en los agentes que entran así, o cambiar allí la carpeta. Lo hace cuando terminen los subagentes que estén trabajando, porque en Claude Code entrar en una carpeta los aislaría. La tarjeta de la épica aprobada ya le pide salir de su carpeta antes de lanzar los encargos de sus cortes.
  - impacto: medio
- A3: La línea que pide un subagente y el «ENCARGO PARA RETOMAR» salen solo si algún huérfano no es una épica. Si todos lo son, el bloque lleva solo la línea de la épica.
  - impacto: bajo
- A4: El paso de la épica demasiado grande es el mismo texto del encargo de un cambio nuevo, en una pieza de `cards/subagents.ts` que usan los dos encargos, y va tras la pregunta al usuario y antes de la respuesta en tres líneas.
  - impacto: bajo
- A5: La línea de cada huérfano que es una épica lo marca tras su fase («· épica», «· epic»), con subagentes o sin ellos. `OrphanView` gana `kind`, opcional, que la CLI llena con el que ya da `status`.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO `next` sin cambio activo lista entre sus huérfanos una épica y la herramienta reparte en subagentes ENTONCES la línea de la épica la marca como épica y el bloque pide que la retome la propia sesión en su carpeta, cuando terminen los subagentes que estén trabajando (en Claude Code con los hooks, `EnterWorktree` con `name`; en los agentes que entran así, `specty enter <id>`), en lugar de crear otro cambio; si todos los huérfanos son épicas, el bloque no pide un subagente ni trae el «ENCARGO PARA RETOMAR».
- AC2: CUANDO entre los huérfanos hay épicas y cambios que no lo son ENTONCES el bloque sigue pidiendo un subagente con el «ENCARGO PARA RETOMAR» para retomar los demás, y añade la línea de la épica.
- AC3: CUANDO el bloque trae el «ENCARGO PARA RETOMAR» ENTONCES, tras el paso de la pregunta al usuario, lleva el de la épica demasiado grande, con el mismo texto que el encargo de un cambio nuevo; el encargo de un cambio nuevo no cambia.
- AC4: CUANDO la herramienta no reparte en subagentes o `subagents` es `false` ENTONCES el bloque es el de hoy, con la épica marcada en su línea.
- AC5: CUANDO el idioma es inglés ENTONCES la marca, la línea de la épica y el paso del encargo salen en inglés.

## Diseño

- `cards/subagents.ts`: `tooLargeStep(ctx)`, el paso de la épica demasiado grande, sale de `changeBrief` (`cards/idle.ts`), que lo usa igual, y lo usa también `resumeBrief` (`cards/rejoin.ts`).
- `cards/rejoin.ts`: `OrphanView` gana `kind?: ChangeKind`. `orphansBlock` marca las épicas en su línea y, con subagentes, separa las líneas de cómo retomarlas: la del subagente y el encargo si algún huérfano no es una épica, y la de la épica, con `resumeHow`, si alguno lo es.
- CLI: `orphanChanges` (`commands/next.ts`) pasa el `kind` de `openChanges`.

## Archivos

- modificar packages/core/src/cards/subagents.ts — el paso de la épica demasiado grande, compartido por los dos encargos
- modificar packages/core/src/cards/idle.ts — el encargo de un cambio nuevo usa el paso compartido
- modificar packages/core/src/cards/rejoin.ts — la épica huérfana marcada y retomada por la sesión, y el paso en el encargo para retomar
- modificar packages/cli/src/commands/next.ts — cada huérfano lleva su `kind`
- crear packages/core/test/cards/orphans-epic.test.ts — el bloque con épicas huérfanas, con y sin subagentes, y el paso del encargo, en los dos idiomas
- crear packages/cli/test/next-orphan-epic.test.ts — `next` en la carpeta principal con una épica aprobada huérfana
- modificar packages/core/test/cards/orphans-subagents.test.ts — el encargo para retomar numera el paso nuevo antes de la respuesta
- modificar docs/ARCHITECTURE.md — §7: la épica huérfana y el paso del encargo para retomar
- modificar docs/formats.md — §6: la épica huérfana sigue en la propia sesión

## Tareas

- [x] T1: El encargo para retomar se para ante una épica, y el bloque deja las épicas huérfanas a la sesión
  - files: packages/core/src/cards/subagents.ts, packages/core/src/cards/idle.ts, packages/core/src/cards/rejoin.ts, packages/core/test/cards/orphans-epic.test.ts, packages/core/test/cards/orphans-subagents.test.ts
  - ac: AC1, AC2, AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/orphans-epic.test.ts test/cards/orphans-subagents.test.ts test/cards/rejoin.test.ts test/cards/idle-subagents.test.ts test/cards/idle-epic-size.test.ts && pnpm lint
- [x] T2: `next` sabe qué huérfano es una épica, y la documentación lo cuenta
  - files: packages/cli/src/commands/next.ts, packages/cli/test/next-orphan-epic.test.ts, docs/ARCHITECTURE.md, docs/formats.md
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/next-orphan-epic.test.ts test/session-return.test.ts && grep -q 'épica huérfana' docs/ARCHITECTURE.md && grep -q 'épica huérfana' docs/formats.md && pnpm typecheck && pnpm lint

## Riesgos

- R1: Con subagentes trabajando, la sesión podría entrar en la épica en Claude Code y aislarlos. Mitigación: la línea le pide hacerlo cuando terminen.

## Cierre

### Resumen

Con una herramienta que reparte en subagentes, la tarjeta sin cambio activo ya no manda una épica huérfana a un subagente. La marca con «· épica» tras su fase y pide que la retome la propia sesión en su carpeta, como sin subagentes, cuando terminen los subagentes que estén trabajando. La línea del subagente y el «ENCARGO PARA RETOMAR» solo salen si algún huérfano no es una épica (P260). El encargo para retomar lleva ahora el paso de la épica demasiado grande, el mismo texto que el encargo de un cambio nuevo, desde una pieza compartida (`tooLargeStep` en `cards/subagents.ts`) (P261). La CLI pasa el `kind` de cada huérfano (`orphanChanges`), y ARCHITECTURE §7 y formats §6 lo cuentan.

### Desviaciones

- El test de la CLI aprobado escribía los hooks de Claude Code en la carpeta principal sin confirmarlos, y `next` daba «CAMBIOS SIN SPEC» con salida 2. La persona aprobó desbloquearlo (S1) con un parche que los confirma con el repositorio y no cambia las expectativas.
- La `verify` de T1 no ejecuta `pnpm typecheck`, como avisó `propose`: lo ejecuta la de T2.

### Decisiones

- Toda épica huérfana, en cualquier fase, va a la sesión (A1). Sin subagentes, el bloque es el de hoy y solo añade la marca.
- El SIGUIENTE de la tarjeta sin cambio activo no cambia: ya pide convertir en épica el cambio del subagente que vuelve por demasiado grande.
- En `packages/core/test/cards/orphans-subagents.test.ts`, que ya existía, el encargo para retomar se renumeró: el paso nuevo es el 5 y la respuesta pasa al 6.

### Pendientes

- Ninguno.
