---
kind: standard
---

# Diffs del cambio en la UI

## Objetivo

En la UI que sirve `specty ui`, la persona ve el diff de cada tarea y el de todo el cambio antes de aceptar el resultado. Hoy esa vista queda vacía por dos motivos: `state.json` no guarda el commit de cada tarea y el servidor no da diffs.

## Fuera de alcance

- Ejecutar la verificación completa desde la UI: va en otro cambio.
- El diff del trabajo sin commit de la tarea en curso.
- Mostrar diffs de más de 512 KB: el servidor dice que no caben y cómo verlos con git.

## Supuestos

- A1: Una sola búsqueda en el historial de todas las ramas (`git log --all`, filtrada por el trailer `Specty-Task`) da los commits de las tareas de todos los cambios, así que leer `/api/changes` sigue siendo barato aunque haya muchos cambios archivados.
- A2: El diff de todo el cambio va del commit base de la primera tarea con commit al commit de la última, el mismo rango que ya muestra la UI. Los archivos de `.specty/` (spec, estado y auditoría) quedan fuera, porque esa vista enseña el código.

## Criterios de aceptación

- AC1: CUANDO la UI lee `/api/changes` ENTONCES cada tarea hecha trae su `commit`: el que lleva su trailer `Specty-Task`.
- AC2: CUANDO la UI pide `GET /api/changes/<id>/diff`, o `?task=<T>` para una tarea, ENTONCES el servidor responde el diff de git sin los archivos de `.specty/`, también si lo arrancó el agente, porque es una lectura. Sin sesión responde 403; si el cambio o la tarea no tienen commits, 404.
- AC3: CUANDO el diff pasa de 512 KB ENTONCES el servidor responde 413 y la UI explica que no cabe y cómo verlo con `git diff`.
- AC4: CUANDO la persona abre la vista de cambios en la UI servida por `specty ui` ENTONCES la UI pide el diff al servidor y lo muestra, o muestra por qué no pudo.
- AC5: CUANDO alguien lee la arquitectura y los formatos ENTONCES encuentra la ruta del diff y de dónde sale el commit de cada tarea.

## Diseño

- `server/records.ts`: una búsqueda `git log --all --grep=Specty-Task:` da el commit de cada tarea de cada cambio por sus trailers, y cada registro completa `state.tasks[T].commit` de sus tareas hechas. El archivo no puede guardarlo porque es el commit que lo contiene.
- `server/diff.ts`: el rango de una tarea (de su `baseCommit` a su `commit`) o el de todo el cambio, y `git diff -M --no-color --no-ext-diff` con prefijos `a/` y `b/`, sin `.specty/`. Las worktrees comparten los objetos de git, así que basta la del servidor.
- `server/http.ts`: la ruta, con las mismas comprobaciones de sesión y origen que las demás lecturas; responde `text/plain`. `io/exec.ts` exporta su límite de salida, para saber si el diff se cortó.
- UI: `ServerData.diff` pide la ruta y explica el 404 y el 413; solo `verifyChange` sigue respondiendo que el servidor aún no lo admite.

## Archivos

- modificar packages/cli/src/server/records.ts — el commit de cada tarea hecha
- crear packages/cli/src/server/diff.ts — el diff de una tarea o de todo el cambio
- modificar packages/cli/src/server/http.ts — la ruta del diff
- modificar packages/cli/src/io/exec.ts — exportar el límite de salida
- crear packages/cli/test/server/diff.test.ts — commits, diffs, permisos y límite
- modificar packages/ui/src/data/server.ts — pedir el diff al servidor
- modificar packages/ui/src/data/server.test.ts — la petición y sus fallos
- modificar docs/ARCHITECTURE.md — §15: la ruta del diff y los commits de las tareas
- modificar docs/formats.md — §3: `tasks[].commit`

## Tareas

- [x] T1: Los commits de las tareas y el diff en el servidor
  - files: packages/cli/src/server/records.ts, packages/cli/src/server/diff.ts, packages/cli/src/server/http.ts, packages/cli/src/io/exec.ts, packages/cli/test/server/diff.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server
- [ ] T2: La UI pide el diff al servidor
  - files: packages/ui/src/data/server.ts, packages/ui/src/data/server.test.ts
  - ac: AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/server.test.ts
- [ ] T3: Documentar los diffs del servidor
  - files: docs/ARCHITECTURE.md, docs/formats.md
  - ac: AC5
  - verify: pnpm check
  - type: docs
