---
kind: quick
---

# Aprobar una solicitud solo dice que la tarea vuelve si no le queda otra

## Objetivo

En Progreso, aprobar una solicitud de alcance avisa «Aprobaste S1: T3 vuelve a su lugar.» aunque esa tarea aún espere otra solicitud, como S1 y S2 de «Exportar boletines en PDF» en el prototipo (P235). Con este cambio el aviso solo dice que la tarea vuelve a su lugar cuando no le queda ninguna solicitud pendiente; si le queda alguna, nombra las que siguen esperando: «Aprobaste S1: T3 sigue esperando S2.» («You approved S1: T3 still waits for S2.»), y con varias las une como una lista («S2 y S3», «S2 and S3»). La pestaña ya le da a cada tarea sus solicitudes pendientes (`TaskProgressView.scopeRequests`): se las pasa también a cada `sp-scope-request` de esa tarea, que toma las demás al pulsar «Aprobar», sin otra copia de los datos.

## Archivos

- modificar packages/ui/src/progress/scope-request.ts — recibe las solicitudes pendientes de su tarea y el aviso de aprobar nombra las que siguen esperando, o dice que la tarea vuelve a su lugar si no queda ninguna
- modificar packages/ui/src/progress/progress-tab.ts — pasa a cada solicitud las de su tarea
- modificar packages/ui/src/progress/progress-tab.test.ts — aprobar S1 de los boletines avisa que T3 sigue esperando S2, en español y en inglés, y aprobar después S2 avisa que vuelve a su lugar
- modificar docs/ui.md — el aviso de aprobar una solicitud de alcance según le queden otras a su tarea

## Tareas

- [x] T1: El aviso de aprobar una solicitud nombra las que su tarea aún espera
  - files: packages/ui/src/progress/scope-request.ts, packages/ui/src/progress/progress-tab.ts, packages/ui/src/progress/progress-tab.test.ts, docs/ui.md
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/progress/progress-tab.test.ts && pnpm typecheck && pnpm lint
  - type: fix
