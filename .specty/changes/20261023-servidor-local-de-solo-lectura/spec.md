---
kind: standard
---

# Servidor local de solo lectura

## Objetivo

`specty ui` levanta en `127.0.0.1` el servidor local de ARCHITECTURE §15, de momento solo para leer: sirve la UI construida y una API con los cambios de todas las worktrees del repositorio (los abiertos de cada carpeta y los archivados, una vez cada uno), y avisa en vivo cuando algo cambia. Es la base de la Bandeja global y de las pantallas en vivo, para que la UI deje los datos de ejemplo. Las acciones de la persona desde la UI quedan para después, porque antes hay que decidir cómo impedir que el agente las use.

## Fuera de alcance

- Acciones desde la UI (aprobar, comentar, aceptar, cerrar, decidir el alcance, verificar): la API solo admite GET.
- Que la UI lea de este servidor: va en su propio cambio, sobre el contrato `SpectyData` que ya tiene.
- Arrancar el servidor desde `propose` o `next`, apagarlo por inactividad y meter la UI construida en el paquete de npm.
- Los diffs por tarea.

## Supuestos

- A1: Cada cambio llega con la forma de `ChangeRecord` de la UI (`packages/ui/src/data/records.ts`): los archivos tal cual (`spec`, `state`, `comments`, `audit` y la spec aprobada), más `phaseSince` y `verifyFull`; el servidor añade `folder`, la carpeta donde vive el cambio, que la UI todavía no usa.
  - impacto: alto
- A2: `phaseSince` sale de la auditoría: la hora de la última entrada que lleva a la fase actual (`change.created` al borrador, `spec.proposed` a la revisión, `spec.approved` a la implementación, `adjust.requested` a los ajustes, `task.completed` o `spec.approved` a la aceptación, `change.accepted` al cierre, `change.closed`, `change.accepted` o `retro.confirmed` a terminado y `change.cancelled` a cancelado); si no hay ninguna, la hora de `state.json`.
- A3: La seguridad sigue `docs/ui.md`: el servidor escucha solo en `127.0.0.1`; el enlace que imprime lleva un token de sesión que vive solo en memoria y que, al abrirlo, el servidor cambia por una cookie `HttpOnly` y `SameSite=Strict` con el puerto en el nombre (las cookies de `localhost` se comparten entre puertos) antes de redirigir a la URL limpia; la API exige esa cookie, comprueba `Host` (contra el DNS rebinding) y `Origin`, y no habilita CORS.
  - impacto: alto
- A4: Los eventos en vivo salen de revisar cada segundo, mientras alguien escucha, la hora y el tamaño de los archivos de los cambios de cada worktree y la lista de los archivados: es portable y barato con decenas de archivos, a diferencia de vigilar carpetas que tienen `node_modules` dentro.
- A5: La UI construida se busca junto al bundle del CLI (`dist/ui`) y, en el monorepo, en `packages/ui/dist/browser`; el servidor marca su `index.html` con `<meta name="specty-data" content="server">`, para que la UI sepa de dónde leer, y lo sirve también en las rutas de la app. Sin una UI construida, una página explica cómo construirla y la API sigue funcionando.

## Criterios de aceptación

- AC1: CUANDO la persona ejecuta `specty ui` ENTONCES se imprime un enlace `http://localhost:<puerto>/?token=…` (4173 o el siguiente libre, o el de `--port`) y el servidor sigue hasta Ctrl+C.
- AC2: CUANDO se abre el enlace ENTONCES el navegador recibe la cookie de sesión y `GET /api/changes` devuelve los cambios abiertos de cada worktree y los archivados, cada uno una vez, con su carpeta y su `phaseSince`; sin la cookie, con otro `Host` o con otro `Origin` responde 403, y a cualquier método que no sea GET, 405.
- AC3: CUANDO cambia un archivo de un cambio, o aparece uno nuevo, ENTONCES `GET /api/events` emite un evento `changes` a quien escucha.
- AC4: CUANDO se pide una ruta de la app o un archivo de la UI construida ENTONCES el servidor sirve el `index.html` marcado o el archivo con su tipo, y nunca algo fuera de la carpeta de la UI; sin una UI construida, explica cómo construirla.

## Diseño

- `server/records.ts`: `changeRecords(session)` reúne los cambios, con `locateChanges` para los abiertos y el archivo de cada worktree para los terminados (saltando los ids ya vistos), y calcula `phaseSince`.
- `server/events.ts`: la firma de los archivos y los clientes de los eventos; solo revisa mientras alguien escucha.
- `server/http.ts`: `startServer({ session, port, ui, interval })`, con la seguridad, la API y los archivos de la UI.
- `commands/ui.ts`: `specty ui` imprime el enlace y espera a Ctrl+C. Para que `program.ts` no pase de 300 líneas, sus comandos ocultos `hook` y `guard` pasan a `enforce/commands.ts`.

## Archivos

- crear packages/cli/src/server/records.ts — los cambios de todas las worktrees, como los lee la UI
- crear packages/cli/src/server/events.ts — los eventos en vivo
- crear packages/cli/src/server/http.ts — el servidor: seguridad, API y UI
- crear packages/cli/src/commands/ui.ts — `specty ui`
- crear packages/cli/src/enforce/commands.ts — los comandos ocultos `hook` y `guard`
- modificar packages/cli/src/program.ts — registrar `ui` y los comandos ocultos
- crear packages/cli/test/server.test.ts — API, seguridad, eventos y UI
- modificar docs/ARCHITECTURE.md — §15: lo que ya existe
- modificar AGENTS.md — `server/` en el mapa

## Tareas

- [x] T1: Los cambios de todas las worktrees con la forma de la UI
  - files: packages/cli/src/server/records.ts, packages/cli/test/server.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server.test.ts
- [x] T2: El servidor, con su seguridad, la API, los eventos y la UI
  - files: packages/cli/src/server/events.ts, packages/cli/src/server/http.ts, packages/cli/test/server.test.ts
  - ac: AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server.test.ts
- [x] T3: El comando `specty ui`
  - files: packages/cli/src/commands/ui.ts, packages/cli/src/enforce/commands.ts, packages/cli/src/program.ts, packages/cli/test/server.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server.test.ts test/enforce.test.ts
- [ ] T4: Documentar el servidor
  - files: docs/ARCHITECTURE.md, AGENTS.md
  - ac: —
  - verify: pnpm check
  - type: docs

## Riesgos

- R1: El agente ve el enlace con el token si lanza `specty ui` — hoy solo da lectura; antes de abrir acciones a la UI hay que decidir cómo impedir que el agente las use.
- R2: Revisar cada segundo con muchas worktrees cuesta un `git worktree list` por segundo mientras alguien escucha — se mide y, si hace falta, se cambia por vigilar carpetas sin tocar la API.
