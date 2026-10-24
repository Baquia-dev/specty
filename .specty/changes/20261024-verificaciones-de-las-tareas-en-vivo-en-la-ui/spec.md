---
kind: standard
---

# Verificaciones de las tareas en vivo en la UI

## Objetivo

Mientras el agente ejecuta `specty task done`, la UI que sirve `specty ui` muestra en vivo la verificación de esa tarea en la pestaña Progreso, como ya hace con la verificación completa que lanza la persona. Hoy esa verificación corre en el proceso del agente y el servidor no la ve hasta que termina.

## Fuera de alcance

- Cancelar desde la UI la verificación de una tarea.
- Guardar la salida completa: el resultado sigue quedando en `task.verified`, con las últimas líneas si falló.

## Supuestos

- A1: Basta con que `task done` deje la ejecución en curso en un archivo del directorio común de git (`specty/runs/<cambio>.json`), reescrito como mucho cada 250 ms y borrado al terminar, y que el servidor lo lea cada medio segundo. Es portable y barato, y todas las worktrees lo comparten.
- A2: Si el proceso que escribió el archivo ya no existe (lo cortaron a mitad), el servidor ignora el archivo y lo borra, para no mostrar una verificación colgada para siempre.

## Criterios de aceptación

- AC1: CUANDO `specty task done` verifica una tarea ENTONCES deja el archivo de la ejecución con la tarea, el comando, cuándo empezó, el proceso y las últimas 1000 líneas, y lo borra al terminar, pase o falle.
- AC2: CUANDO la UI escucha los eventos del servidor mientras corre esa verificación ENTONCES recibe `run` con la ejecución, con su tarea, a medida que llegan líneas, y `run: null` cuando termina. `GET /api/changes/<id>/run` la da a una pestaña que se abre a mitad.
- AC3: CUANDO el proceso que escribió el archivo ya no existe ENTONCES el servidor no muestra esa ejecución y borra el archivo.
- AC4: CUANDO alguien lee la arquitectura y el documento de la UI ENTONCES encuentra de dónde sale la verificación en vivo de una tarea.

## Diseño

- `io/exec.ts`: `execute` acepta `onOutput`, que recibe cada trozo de stdout y stderr según llega.
- `store/runs.ts`: escribe, lee y borra los archivos de las ejecuciones en curso en `common/specty/runs/`.
- `flow/live-run.ts`: `runLive` ejecuta la verificación de una tarea con `onOutput`, junta las líneas y reescribe el archivo como mucho cada 250 ms; al terminar lo borra. `task.ts` la usa en lugar de `execute`.
- `server/runs.ts`: además de las verificaciones completas que lanza, lee cada medio segundo los archivos de las tareas, avisa con `run` cuando cambian o desaparecen, y `current` los da cuando no corre una completa. Un archivo de un proceso que ya no existe se ignora y se borra.
- La UI no cambia: `ServerData.watchRun` ya acepta ejecuciones con tarea, y Progreso ya las muestra.

## Archivos

- modificar packages/cli/src/io/exec.ts — `onOutput` en `execute`
- crear packages/cli/src/store/runs.ts — los archivos de las ejecuciones en curso
- crear packages/cli/src/flow/live-run.ts — la verificación de una tarea, en vivo
- modificar packages/cli/src/commands/task.ts — `task done` verifica con `runLive`
- crear packages/cli/test/live-run.test.ts — tests del archivo en vivo
- modificar packages/cli/src/server/runs.ts — las ejecuciones de las tareas en los eventos
- crear packages/cli/test/server/live.test.ts — tests de los eventos de las tareas
- modificar docs/ARCHITECTURE.md — §15: la verificación en vivo de las tareas
- modificar docs/ui.md — Progreso: la salida en vivo con el servidor

## Tareas

- [x] T1: task done deja su verificación en vivo
  - files: packages/cli/src/io/exec.ts, packages/cli/src/store/runs.ts, packages/cli/src/flow/live-run.ts, packages/cli/src/commands/task.ts, packages/cli/test/live-run.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/live-run.test.ts test/commands.test.ts && pnpm sources
- [x] T2: El servidor la emite en los eventos
  - files: packages/cli/src/server/runs.ts, packages/cli/test/server/live.test.ts
  - ac: AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server && pnpm sources
- [ ] T3: Documentar la verificación en vivo de las tareas
  - files: docs/ARCHITECTURE.md, docs/ui.md
  - ac: AC4
  - verify: pnpm check
  - type: docs
