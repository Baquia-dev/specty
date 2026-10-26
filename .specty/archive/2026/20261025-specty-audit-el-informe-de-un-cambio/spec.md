---
kind: standard
follows:
  - 20261025-specty-why-de-donde-viene-una-linea
---

# specty audit: el informe de un cambio

## Objetivo

PRODUCT.md promete para la versión 1 un informe de auditoría, y ARCHITECTURE §13 describe `specty audit <id>`, que combina la auditoría y git en un informe Markdown o JSON, pero el comando no existe. Ahora `specty audit [<id>]` da el informe de un cambio: sus datos, sus tareas con su commit y su resumen, y la línea de tiempo de la auditoría, cada evento dicho con palabras. Con `--json`, lo mismo, estructurado.

## Fuera de alcance

- La exportación a otros formatos: es el cambio siguiente.
- Un informe de varios cambios a la vez.
- Otros formatos de salida, como HTML o PDF.

## Supuestos

- A1: Sin id, el informe es del cambio activo de la carpeta. Con id, el cambio se busca como en `why`: aquí, abierto en otra worktree o archivado en la carpeta principal.
- A2: Cada evento de formats.md §4 tiene su frase; uno desconocido sale con su nombre, para no perder nada.
- A3: `audit` solo lee, así que también lo ejecuta el agente.

## Criterios de aceptación

- AC1: CUANDO se ejecuta `specty audit <id>` ENTONCES imprime un informe Markdown con el título, el id, el carril, la fase, la rama, la petición literal y la aprobación (revisión, fecha, quién y canal); las tareas con su estado, commit y resumen; y la línea de tiempo, con la fecha, quién (la persona, el agente con su herramienta, el agente por delegación o Specty) y qué, para cada evento.
- AC2: CUANDO se añade `--json` ENTONCES imprime lo mismo como JSON: el cambio, las tareas y los eventos tal como están en la auditoría.
- AC3: CUANDO no se da id ENTONCES usa el cambio activo, y CUANDO el id no existe ENTONCES lo rechaza.
- AC4: CUANDO alguien lee ARCHITECTURE ENTONCES `audit` aparece como implementado, con lo que muestra.

## Diseño

- Core, `cards/audit.ts`: `AuditView` y `auditReport`, que da el Markdown y los datos del JSON, con una frase por evento.
- CLI: `flow/find.ts` busca un cambio por id, y lo usan `why` y `audit`; `commands/audit.ts` reúne la vista y se registra desde su módulo, como `check`.

## Archivos

- crear packages/core/src/cards/audit.ts — el informe
- modificar packages/core/src/index.ts — exportarlo
- crear packages/core/test/cards/audit.test.ts — el informe y sus frases
- crear packages/cli/src/flow/find.ts — buscar un cambio por id
- modificar packages/cli/src/commands/why.ts — usar esa búsqueda
- crear packages/cli/src/commands/audit.ts — el comando
- modificar packages/cli/src/program.ts — registrarlo
- crear packages/cli/test/audit.test.ts — de punta a punta
- modificar docs/ARCHITECTURE.md — §6 y §13

## Tareas

- [x] T1: El informe de auditoría en core
  - files: packages/core/src/cards/audit.ts, packages/core/src/index.ts, packages/core/test/cards/audit.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/audit.test.ts
- [x] T2: El comando audit
  - files: packages/cli/src/flow/find.ts, packages/cli/src/commands/why.ts, packages/cli/src/commands/audit.ts, packages/cli/src/program.ts, packages/cli/test/audit.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm check

## Cierre

### Resumen

`specty audit [<id>]` da el informe de un cambio, el activo por defecto. En Markdown lleva el título, el id, el carril, la fase, la rama, la petición literal y la aprobación; las tareas con su estado, su commit (por su trailer) y su resumen; y la línea de tiempo de la auditoría, con cuándo, quién y qué. Cada evento de formats.md §4 va en palabras, en español o en inglés, y uno desconocido por su nombre. Con `--json` da el cambio, las tareas y los eventos tal como están. El informe vive en core (`cards/audit.ts`); la CLI lo reúne y se registra desde su módulo, como `check`. `flow/find.ts` busca un cambio por id, y lo comparten `why` y `audit`.

### Desviaciones

- `packages/core/test/cards/audit.test.ts` y `packages/core/src/cards/audit.ts`, de T1, entraron en el alcance de T2 (aprobados por la política, ya en Archivos): el lint de `pnpm check` encontró un `forEach` que devolvía un valor y una concatenación que Biome prefiere como plantilla. T1 solo había ejecutado su test.

### Decisiones

- Quién actúa: la persona, el agente con su herramienta, el agente por delegación (las decisiones con `delegated`) o Specty.
- `audit` y `why` no son decisiones de la persona: el agente también los ejecuta.

### Pendientes

- `packages/cli/src/program.ts` está en 305 líneas de código: la división por grupos de comandos que propuso el cierre de `why`.
- Una tarea cuyo `verify` es solo el test de su archivo no pasa el lint: vale más `pnpm check` en la última tarea de cada cambio, o que `verify.quick` incluya el lint.
