---
kind: standard
follows:
  - 20261025-los-textos-de-las-epicas-y-del-trabajo-en-parale
---

# Los textos de ui, export, delegate, why y audit viven en core

## Objetivo

Decimotercer cambio de la serie que lleva a core los textos de la CLI, con cinco comandos que aún arman los suyos:

- `ui`: el puerto no válido, el enlace y si se decide desde ella, y el cierre del servidor;
- `export`: sus rechazos y lo que escribió;
- `delegate`: la nota, la pregunta y sus respuestas;
- `why` y `audit`: sus rechazos.

Pasan a dos módulos nuevos de core, `cards/ui.ts` y `cards/export.ts`, y a los que ya tenían el resto de cada comando: `cards/human.ts` (la tarjeta de `delegate`), `cards/why.ts` y `cards/audit.ts`. La salida no cambia ni una letra.

## Fuera de alcance

- Qué hacen esos comandos: solo cambia dónde viven sus textos.
- Los textos del servidor, de los hooks y de `check`, que llegan en los siguientes cambios de la serie.

## Supuestos

- A1: Los nombres de los formatos de `export` (OpenSpec, Spec Kit, Kiro) no se traducen y siguen en la CLI, que los pasa a la tarjeta.

## Criterios de aceptación

- AC1: CUANDO `specty ui` rechaza el puerto, arranca o se cierra ENTONCES su salida es la misma que antes y sale de `cards/ui.ts` de core.
- AC2: CUANDO `specty export` se rechaza o escribe los archivos ENTONCES su salida es la misma que antes y sale de `cards/export.ts` de core.
- AC3: CUANDO la persona activa el modo delegado ENTONCES la nota, la pregunta y sus respuestas son las mismas que antes y salen de core.
- AC4: CUANDO `specty why` o `specty audit` se rechazan ENTONCES el motivo y el SIGUIENTE son los mismos que antes y salen de core.
- AC5: CUANDO se ejecutan los tests de core ENTONCES cubren cada texto, en español y en inglés.

## Archivos

- crear packages/core/src/cards/ui.ts — los textos de ui
- crear packages/core/src/cards/export.ts — los textos de export
- modificar packages/core/src/cards/human.ts — la nota, la pregunta y las respuestas de delegate
- modificar packages/core/src/cards/why.ts — los rechazos de why
- modificar packages/core/src/cards/audit.ts — los rechazos de audit
- modificar packages/core/src/cards/index.ts — exportarlos
- crear packages/core/test/cards/commands.test.ts — sus tests
- modificar packages/cli/src/commands/ui.ts — pedir sus textos a core
- modificar packages/cli/src/commands/export.ts — pedir sus textos a core
- modificar packages/cli/src/commands/delegate.ts — pedir sus textos a core
- modificar packages/cli/src/commands/why.ts — pedir sus textos a core
- modificar packages/cli/src/commands/audit.ts — pedir sus textos a core

## Tareas

- [x] T1: Core tiene los textos de ui, export, delegate, why y audit
  - files: packages/core/src/cards/ui.ts, packages/core/src/cards/export.ts, packages/core/src/cards/human.ts, packages/core/src/cards/why.ts, packages/core/src/cards/audit.ts, packages/core/src/cards/index.ts, packages/core/test/cards/commands.test.ts
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty-core typecheck && pnpm --filter @baquia-dev/specty-core test
  - type: refactor
- [x] T2: ui, export y delegate piden sus textos a core
  - files: packages/cli/src/commands/ui.ts, packages/cli/src/commands/export.ts, packages/cli/src/commands/delegate.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty typecheck
  - type: refactor
- [x] T3: why y audit piden sus textos a core
  - files: packages/cli/src/commands/why.ts, packages/cli/src/commands/audit.ts
  - ac: AC4
  - verify: pnpm check
  - type: refactor

## Cierre

### Resumen

Los textos de `ui` (`cards/ui.ts`), `export` (`cards/export.ts`), la pregunta de `delegate` (`cards/human.ts`) y los rechazos de `why` y `audit` (`cards/why.ts` y `cards/audit.ts`) viven en core, con tests. Los cinco comandos ya no llaman al traductor, y la salida es la misma: sus tests pasan sin cambios.

### Desviaciones

- Ninguna.

### Decisiones

- Los nombres de los formatos de `export` siguen en la CLI y se pasan a la tarjeta, porque no se traducen.
- Las respuestas de `delegate on` («No» primero, la opción por defecto) salen de core, como las de `uninstall`.

### Pendientes

- Siguen en la CLI los textos del servidor, de los hooks y de `check`.
