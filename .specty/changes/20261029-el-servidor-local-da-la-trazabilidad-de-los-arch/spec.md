---
kind: standard
---

# El servidor local da la trazabilidad de los archivos de un cambio

## Objetivo

La vista de trazabilidad del Historial (docs/ui.md) enseña un archivo con un margen tipo blame que enlaza cada bloque con su cambio, su tarea y sus criterios. Hoy eso solo lo da `specty why`, línea a línea y en la terminal. El servidor local pasa a dar, de cada cambio, los archivos que dejó y, de cada uno, sus líneas agrupadas en bloques con lo que `specty why` diría de ellos. La vista de la UI va en el cambio siguiente.

## Fuera de alcance

- La vista de la UI y su fuente de datos.
- Trazar archivos que el cambio no tocó, o en otra revisión que su último commit.

## Supuestos

- A1: El archivo se traza tal como lo dejó el cambio: el blame va sobre el commit de su última tarea, que comparten todas las worktrees, así que vale para cambios abiertos y cerrados.
  - impacto: alto
- A2: Solo se trazan los archivos que el cambio dejó, de la base de su primera tarea con commit al commit de la última, sin `.specty/` ni los borrados: así el servidor no lee ningún otro archivo del repositorio.
  - impacto: alto
- A3: Como el diff, un blame de más de 512 KB no se sirve: responde 413.

## Criterios de aceptación

- AC1: CUANDO la UI pide `GET /api/changes/<id>/trace` ENTONCES recibe los archivos que el cambio dejó (añadidos, modificados o renombrados, sin `.specty/` ni los borrados), y 404 si el cambio no existe o aún no tiene commits.
- AC2: CUANDO pide `?path=<archivo>` de uno de ellos ENTONCES recibe sus líneas en el último commit del cambio, agrupadas en bloques de líneas seguidas del mismo commit, cada uno con su commit, fecha, autor y asunto y, si lo hizo Specty, su cambio, su tarea y los criterios que cubre, como `specty why`.
- AC3: CUANDO el archivo no es uno de los del cambio ENTONCES responde 404 sin leerlo, y 413 si su blame pasa de 512 KB; es una lectura, así que también la da el servidor del agente, siempre con la sesión.

## Diseño

- `flow/traced.ts`: lo que hoy está dentro de `commands/why.ts` para leer commits con sus trailers (`logged`) y encontrar su cambio, tarea y criterios (`ChangeSpecs`), para que lo usen `why` y el servidor.
- `server/diff.ts` exporta el rango del cambio (de la base de su primera tarea con commit al commit de la última) que ya calcula para el diff.
- `server/trace.ts`: `changeTrace(session, id, path?)` da la lista de archivos (`git diff --name-only --diff-filter=d` del rango, sin `.specty/`) o el blame (`git blame --porcelain <último> -- <archivo>`) de uno de ellos, con sus líneas y sus bloques; los commits de los bloques se leen de una vez con `git log --no-walk`.
- `server/http.ts` añade `trace` a las lecturas de un cambio, junto a `diff` y `run`: 200 con JSON, 404 y 413 como el diff.

## Archivos

- crear packages/cli/src/flow/traced.ts — los commits con sus trailers y el cambio, la tarea y los criterios que hay detrás
- modificar packages/cli/src/commands/why.ts — usa `flow/traced.ts`
- modificar packages/cli/test/why.test.ts — debe pasar sin cambios
- crear packages/cli/src/server/trace.ts — los archivos del cambio y el blame de uno de ellos, por bloques
- modificar packages/cli/src/server/diff.ts — exporta el rango del cambio
- modificar packages/cli/src/server/http.ts — la lectura `trace`
- crear packages/cli/test/server/trace.test.ts — la lista, los bloques y los rechazos
- modificar docs/ARCHITECTURE.md — `GET /api/changes/<id>/trace` en la API del servidor

## Tareas

- [x] T1: Los commits con sus trailers, fuera de `specty why`
  - files: packages/cli/src/flow/traced.ts, packages/cli/src/commands/why.ts, packages/cli/test/why.test.ts
  - ac: —
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/why.test.ts && pnpm lint
  - type: refactor
- [x] T2: La trazabilidad de un cambio en el servidor
  - files: packages/cli/src/server/trace.ts, packages/cli/src/server/diff.ts, packages/cli/src/server/http.ts, packages/cli/test/server/trace.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server/trace.test.ts test/server/diff.test.ts && pnpm lint
- [ ] T3: Documentar la lectura `trace`
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm lint
  - type: docs
