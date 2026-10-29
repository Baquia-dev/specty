---
kind: standard
---

# El informe de auditoría y los datos de exportación, en funciones puras

## Objetivo

La pestaña Historial va a exportar el cambio en Markdown, JSON, OpenSpec, Spec Kit y Kiro, y lo hará igual que `specty audit` y `specty export`. Hoy lo que esos comandos leen del cambio (las tareas con su commit, la aprobación, los eventos de la auditoría, la petición y el día de creación) se arma dentro de la CLI, con su sesión. Pasa a dos funciones puras, una en core y otra en los exportadores, que la CLI usa ya y la UI usará después. La salida de los dos comandos no cambia.

## Fuera de alcance

- La exportación desde la UI: va en el cambio siguiente.
- Cambiar el contenido del informe o de las exportaciones.

## Supuestos

- A1: Los commits de las tareas siguen llegando aparte (la CLI los busca por sus trailers y el servidor los pone en `state.json` al leerlo), así que la función los recibe y, si no se los dan, toma los de `state.tasks`.

## Criterios de aceptación

- AC1: CUANDO se ejecuta `specty audit` ENTONCES el informe, en Markdown y con `--json`, es el mismo que antes, ahora construido por `auditViewOf` de core a partir del estado, la spec, los commits y las líneas de la auditoría.
- AC2: CUANDO se ejecuta `specty export` ENTONCES los archivos son los mismos que antes, con el id, la rama, el día de creación y la petición que da `exportContextOf` de los exportadores a partir del estado y la auditoría.

## Diseño

- `core/src/cards/audit-view.ts`: `auditViewOf({ state, spec, audit, commits? })` devuelve el `AuditView` de `auditReport`. Lee las líneas de la auditoría como hoy `eventsOf` de la CLI (deja fuera las que no son un evento) y saca la petición del evento `change.created`.
- `exporters/src/context.ts`: `exportContextOf(state, audit)` devuelve el `ExportContext` de `exportSpec`, como hoy `exportFacts` de la CLI.
- `commands/audit.ts` y `commands/export.ts` las usan y quitan su copia.

## Archivos

- crear packages/core/src/cards/audit-view.ts — el `AuditView` a partir del estado, la spec, los commits y la auditoría
- modificar packages/core/src/cards/index.ts — exporta `auditViewOf`
- crear packages/core/test/cards/audit-view.test.ts — las tareas, la aprobación, la petición y los eventos
- modificar packages/cli/src/commands/audit.ts — usa `auditViewOf`
- modificar packages/cli/test/audit.test.ts — debe pasar sin cambios
- crear packages/exporters/src/context.ts — el `ExportContext` a partir del estado y la auditoría
- modificar packages/exporters/src/index.ts — exporta `exportContextOf`
- crear packages/exporters/test/context.test.ts — el id, la rama, el día y la petición
- modificar packages/cli/src/commands/export.ts — usa `exportContextOf`
- modificar packages/cli/test/export.test.ts — debe pasar sin cambios

## Tareas

- [x] T1: El informe de auditoría desde `auditViewOf` de core
  - files: packages/core/src/cards/audit-view.ts, packages/core/src/cards/index.ts, packages/core/test/cards/audit-view.test.ts, packages/cli/src/commands/audit.ts, packages/cli/test/audit.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/audit-view.test.ts test/cards/audit.test.ts && pnpm --filter @baquia-dev/specty exec vitest run test/audit.test.ts && pnpm lint
  - type: refactor
- [x] T2: Los datos de la exportación desde `exportContextOf`
  - files: packages/exporters/src/context.ts, packages/exporters/src/index.ts, packages/exporters/test/context.test.ts, packages/cli/src/commands/export.ts, packages/cli/test/export.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty-exporters exec vitest run && pnpm --filter @baquia-dev/specty exec vitest run test/export.test.ts && pnpm lint
  - type: refactor

## Cierre

### Resumen

`auditViewOf` (core, `cards/audit-view.ts`) arma el `AuditView` de `auditReport` desde el estado, la spec, las líneas de la auditoría y los commits de las tareas, y `exportContextOf` (exportadores, `context.ts`) da el id, la rama, el día de creación y la petición que necesita `exportSpec`. `specty audit` y `specty export` los usan y su salida no cambia: sus tests pasan sin tocarlos. La UI podrá exportar lo mismo con ellas.

### Desviaciones

Ninguna.

### Decisiones

- Sin commits dados, `auditViewOf` toma los de `state.tasks`, donde los pone el servidor local al leer los cambios; la CLI sigue buscándolos por sus trailers.
- Cada función tiene su `isRecord` local: core y los exportadores no comparten utilidades fuera de su API pública.

### Pendientes

- `cards/index.ts` sigue por encima de 300 líneas (333): es la lista de la API pública de textos; se sugirió añadirlo a `lines.exclude`.
