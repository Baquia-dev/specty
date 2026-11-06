---
kind: standard
epic: 20261106-aceptar-y-decidir-en-la-ui-muestran-su-progreso-2
slice: C4
---

# La cabecera dice por qué espera una aceptación o un cierre

## Objetivo

Hoy, mientras una aceptación o un cierre lanzados desde la UI esperan, la cabecera solo dice «Aceptando…» o «Cerrando…», y lo que el comando cuenta de esa espera (el turno de la verificación completa de otra sesión, `git.afterLanding`) solo llega a la consola del servidor. Con este cambio, el servidor manda esas líneas como eventos `action` y la cabecera muestra la última bajo los botones, así la persona sabe por qué espera.

## Fuera de alcance

- Mostrar la línea del servidor en la barra compacta, en la Bandeja, en otra pestaña o tras recargar la página.
- Traducir la línea al idioma de la página: llega en el de Specty.
- Mostrar en la UI las líneas de las demás acciones de un cambio (aprobar, decidir un supuesto…): el servidor también las manda, pero nada las pinta.
- La verificación completa de «Ejecutarla antes», que ya se ve en vivo con los eventos `run`.
- Acortar lo que tarda aceptar o cerrar.

## Supuestos

- A1: Lo que el comando dice por `io.err` mientras la acción sigue (la espera del turno, la verificación tras incorporar main, `git.afterLanding`) es una línea por llamada y basta la última: cada línea nueva sustituye a la anterior.
  - impacto: bajo
- A2: La cabecera muestra la línea sin el prefijo `specty:` con el que la marca la terminal y con la primera letra en mayúscula; el resto llega tal cual, en el idioma de Specty.
  - impacto: bajo
- A3: El servidor emite los eventos de todas las acciones de un cambio (`runAction`), no solo de aceptar y cerrar, y no los de la memoria ni del modo delegado; la UI solo toma los de la aceptación o el cierre que esta pestaña tiene en curso sobre ese cambio.
  - impacto: bajo
- A4: Cuando el servidor dice que la acción terminó, la línea se va y vuelve «Aceptando…» o «Cerrando…» mientras la página vuelve a leer el cambio (C2), hasta que la acción termina también en la página.
  - impacto: bajo
- A5: El motivo de «Pedir ajustes…» sigue siendo «Aceptando…»: la línea del servidor va solo bajo los botones de la cabecera.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO la persona cierra (o acepta) desde la UI y el comando espera el turno de la verificación completa de otra sesión ENTONCES el servidor emite eventos `action` con el id del cambio y la acción: uno al empezar, uno con cada línea que el comando dice por su salida de errores (la de la espera) y uno con `done: true` cuando la acción termina.
- AC2: CUANDO una aceptación o un cierre lanzados desde esta página siguen en curso y el servidor manda una línea de esa acción ENTONCES la página la guarda sin el prefijo `specty:` de la terminal, hasta que el servidor dice que terminó o la acción termina; una línea de otro cambio, de otra acción o ilegible no cambia nada.
- AC3: CUANDO una aceptación o un cierre siguen en curso y el servidor ya mandó una línea de esa acción ENTONCES la cabecera la muestra bajo los botones, en lugar de «Aceptando…» o «Cerrando…»; la barra compacta no la muestra y su botón sigue cargando.

## Diseño

- **Servidor** (`packages/cli/src/server/actions.ts`, `api.ts`):
  - `runAction` recibe un `said: (text: string) => void` opcional. `onScreen` da a la sesión de la UI un `io` cuyo `err` sigue escribiendo en la consola del servidor y además llama a `said`.
  - En `act`, una acción de un cambio corre dentro de `followed`: emite `action` con `{ change, action }` antes de entrar en `serial`, `{ change, action, note }` con cada línea y `{ change, action, done: true }` al terminar, bien o mal (`finally`), antes de responder.
- **Fuente de datos** (`packages/ui/src/data/source.ts`, `server-answers.ts`, `server.ts`):
  - `ActionNote` (`{ change, action, note? }`) y `watchActions(listener)` en `SpectyData`, que por defecto no oye nada.
  - `actionEvent` en `server-answers.ts`, junto a `runEvent`, lee un evento `action`: quita el prefijo `specty:`, pone la mayúscula y deja sin `note` el del inicio y el del fin. Los dos comparten la lectura del JSON.
  - `ServerData.watchActions` escucha los eventos `action` en el mismo flujo. Para no hacer crecer `server.ts` (P203), un `follow(set, listener)` privado añade el oyente, abre el flujo y devuelve cómo pararlo; lo usan `subscribe`, `watchRun` y `watchActions`.
- **Acciones en curso** (`packages/ui/src/data/in-flight.ts`): `InFlightAction` gana `note?`. `run` escucha `watchActions` mientras la promesa sigue: un evento de ese cambio y esa acción deja su `note`, o ninguna si no la trae; al terminar deja de escuchar.
- **Cabecera** (`packages/ui/src/acceptance/acceptance-actions.ts`, `closing-actions.ts`): la línea `[data-in-flight]` dice la `note` de `InFlight.of(change.id)` o, sin ella, «Aceptando…» o «Cerrando…».
- **Tests**: los escritos antes que el código no usan tipos ni miembros que aún no existen. El de `InFlight` usa `ServerData` con un `EventSource` falso. Los de la cabecera sustituyen `InFlight` por uno que ya tiene la línea del servidor (un parámetro nuevo de `render` con proveedores extra). El del servidor cierra desde la UI un cambio en su worktree mientras otra sesión tiene el turno, como `close-turn.test.ts`, y no se cuelga si los eventos no llegan.

## Archivos

- modificar packages/cli/src/server/actions.ts — `runAction` pasa a `said` lo que el comando dice por su salida de errores
- modificar packages/cli/src/server/api.ts — `act` emite los eventos `action` de las acciones de un cambio
- crear packages/cli/test/server/action-notes.test.ts — el cierre desde la UI que espera el turno emite su inicio, la línea de la espera y su fin
- modificar packages/ui/src/data/source.ts — `ActionNote` y `watchActions`, que por defecto no oye nada
- modificar packages/ui/src/data/server-answers.ts — `actionEvent` lee un evento `action`
- modificar packages/ui/src/data/server.ts — `watchActions` sobre los eventos `action`, con `follow` para los oyentes
- modificar packages/ui/src/data/in-flight.ts — cada acción en curso guarda la última línea que el servidor dijo de ella
- crear packages/ui/src/data/in-flight.test.ts — la línea de la acción, solo la suya y hasta que termina, por `ServerData`
- modificar packages/ui/src/acceptance/acceptance-actions.ts — la cabecera muestra la línea del servidor en lugar de «Aceptando…»
- modificar packages/ui/src/acceptance/acceptance-actions.test.ts — la línea en la cabecera y no en la barra
- modificar packages/ui/src/acceptance/closing-actions.ts — la cabecera muestra la línea del servidor en lugar de «Cerrando…»
- modificar packages/ui/src/acceptance/closing-actions.test.ts — la línea en la cabecera y no en la barra
- modificar docs/ui.md — la cabecera dice por qué espera una aceptación o un cierre
- modificar docs/ARCHITECTURE.md — los eventos `action` del servidor

## Tareas

- [x] T1: El servidor manda lo que dicen la aceptación y el cierre mientras siguen
  - files: packages/cli/src/server/actions.ts, packages/cli/src/server/api.ts, packages/cli/test/server/action-notes.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server/action-notes.test.ts test/server/actions.test.ts test/server-actions.test.ts && pnpm --filter @baquia-dev/specty typecheck && pnpm lint
- [x] T2: La página guarda la última línea del servidor de cada acción en curso
  - files: packages/ui/src/data/source.ts, packages/ui/src/data/server-answers.ts, packages/ui/src/data/server.ts, packages/ui/src/data/in-flight.ts, packages/ui/src/data/in-flight.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/in-flight.test.ts --include src/data/server-runs.test.ts --include src/data/server-actions.test.ts --include src/data/server.test.ts && pnpm lint && pnpm knip
- [x] T3: La cabecera muestra la línea del servidor bajo los botones
  - files: packages/ui/src/acceptance/acceptance-actions.ts, packages/ui/src/acceptance/acceptance-actions.test.ts, packages/ui/src/acceptance/closing-actions.ts, packages/ui/src/acceptance/closing-actions.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/acceptance/acceptance-actions.test.ts --include src/acceptance/closing-actions.test.ts --include src/acceptance/acceptance-tab.test.ts --include src/acceptance/epic-adjust.test.ts --include src/change/change-page.closing.test.ts && pnpm typecheck && pnpm lint
- [x] T4: ui.md y ARCHITECTURE.md cuentan la línea del servidor y los eventos `action`
  - files: docs/ui.md, docs/ARCHITECTURE.md
  - ac: —
  - verify: grep -q "watchActions" docs/ARCHITECTURE.md && grep -q "evento \`action\`" docs/ui.md
  - type: docs

## Riesgos

- R1: Una línea larga (la espera nombra el comando y la carpeta de la otra sesión) ocupa varias líneas bajo los botones. Mitigación: va en texto pequeño y atenuado, y es justo lo que la persona necesita saber.
- R2: Si el flujo de eventos se corta, la cabecera se queda con «Aceptando…» o con la última línea hasta que la acción termina. Mitigación: es lo mismo que hoy; el aviso final sigue llegando con la respuesta.
