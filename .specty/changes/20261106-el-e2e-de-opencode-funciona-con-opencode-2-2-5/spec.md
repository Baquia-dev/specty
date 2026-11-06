---
kind: standard
---

# El E2E de OpenCode funciona con OpenCode 2.2.5

## Objetivo

Con OpenCode 2.2.5 (Homebrew, instalado el 2026-11-06) fallan los 7 tests de `opencode-e2e.test.ts` y bloquean la unidad `cli` de la verificación completa de todos los cambios (P197). El cambio adapta el E2E a cómo se maneja OpenCode 2.2.5, sin cambiar lo que comprueba de Specty, y arregla el fin de turno del plugin de Specty, que con 2.2.5 nunca se disparaba: OpenCode ya no publica `session.idle` y sus eventos llevan la sesión en `data`.

## Fuera de alcance

- Que el E2E siga corriendo con un OpenCode anterior a 2.2 (1.x o la beta de OpenCode 2): sus herramientas, `opencode run` y la API de `opencode serve` son otros, y no hay cómo comprobarlo aquí. Con esas versiones el E2E se salta; el plugin las sigue admitiendo, como prueban sus tests unitarios.
- Distinguir en OpenCode 2 el fin de turno de la sesión hija de un subagente, que ARCHITECTURE ya cuenta como pendiente.
- Que `doctor` avise de un plugin de antes de este cambio, sin el fin de turno de 2.2: `specty init --tools opencode` lo reescribe.
- Que el guard juzgue las herramientas nuevas de OpenCode 2.2.5: `execute` (su Code Mode, con `tools.opencode.*`).
- Parar los `opencode serve` que dejaron vivos las ejecuciones del E2E que fallaron antes de este cambio, que no lanzó esta sesión.

## Supuestos

- A1: OpenCode 2.2.5 carga el plugin por `setup` y le da, como la beta, `ctx.location`, `ctx.tool.hook` (`execute.before` y `execute.after`), `ctx.session.hook` (`compaction` y `context`), `ctx.event.subscribe` y `ctx.session.prompt`. Comprobado en 2.2.5 con el modelo simulado: el guard bloquea, avisa, lleva las rutas a la carpeta del cambio y devuelve la tarjeta tras compactar sin tocar el plugin; solo falla el fin de turno.
  - impacto: alto
- A2: En OpenCode 2.2.5 un turno termina con el evento `session.execution.succeeded`, con la sesión en `data.sessionID`; `session.idle` ya no existe. Un turno que falla o que la persona interrumpe publica otro evento y no se devuelve al trabajo. La beta publicaba `session.idle` con la sesión en `properties`, y el plugin sigue escuchándolo.
  - impacto: alto
- A3: `opencode run --standalone` arranca un servidor privado, hijo suyo, con el entorno aislado del test (HOME y carpetas XDG temporales, el proveedor falso), y no usa el servicio en segundo plano de la persona; sin `--standalone`, `opencode run` iría a ese servicio. `--dir` ya no existe: la carpeta es la de trabajo del proceso.
  - impacto: alto
- A4: `opencode serve` sin `--service` es un servidor propio, que en 2.2.5 pide en cada petición la contraseña de `OPENCODE_SERVER_PASSWORD` por Basic auth con el usuario `opencode`. Su API va bajo `/api`: `session.create` (`POST /api/session`, con la carpeta en `location.directory`), `session.prompt` (`POST /api/session/<id>/prompt`, con `text`), `session.compact` (`POST /api/session/<id>/compact`) y `experimental.session.wait` (`POST /api/experimental/session/<id>/wait`), que espera a que la sesión quede inactiva.
  - impacto: medio
- A5: OpenCode 2.2.5 manda la petición de compactar con herramientas y la da por buena si alguna línea del resumen es una cabecera de su plantilla (`<template>`); si no, falla la compactación. El modelo simulado responde a esa petición con la primera cabecera, fuera del guion.
  - impacto: medio
- A6: En OpenCode 2.2.5 las herramientas se llaman `shell`, `write` y `read` (con `path`) y `subagent` (con `agent`), que responde con `<subagent sessionID="…">`. Un `bash` lo corre como `shell`, pero un `filePath` no lo acepta. El plugin y el guard ya conocían esos nombres de OpenCode 2.
  - impacto: medio

## Criterios de aceptación

- AC1: CUANDO termina un turno de OpenCode 2.2 (`session.execution.succeeded`, con la sesión en `data`) con el fin de turno encendido y `specty check --changed` falla ENTONCES el plugin devuelve esa sesión al trabajo con el informe, y el siguiente fin de turno de la sesión que devolvió termina.
- AC2: CUANDO el E2E corre con OpenCode 2.2.5 por `opencode run` ENTONCES comprueba lo mismo que antes de Specty: sin cambio, el guard bloquea el código, el commit y `specty approve` con su SIGUIENTE; con una tarea, deja pasar sus archivos, para los de fuera y avisa de lo que un comando cambió fuera de ella; `specty enter` lleva la conversación a la carpeta del cambio; y un subagente trabaja en la carpeta en la que entró su sesión hija, sin mover la de la principal.
- AC3: CUANDO el E2E corre con OpenCode 2.2.5 por `opencode serve` ENTONCES, tras compactar, la siguiente petición al modelo trae la tarjeta de `specty next`, que la de antes no traía; y con el fin de turno encendido y `specty check --changed` en rojo, el modelo recibe el informe una vez y el turno siguiente termina.

## Diseño

- Plugin (`install/opencode.ts`): en el bucle de `ctx.event.subscribe`, un fin de turno es `session.idle` (la beta) o `session.execution.succeeded` (2.2), y la sesión se lee de `data` o de `properties`. Lo demás del plugin queda igual.
- E2E: `opencode run --standalone` en la carpeta del repositorio; los ayudantes del guion usan los nombres y los campos de OpenCode 2.2 (`shell`, `write` y `read` con `path`, `subagent` con `agent`), y el id de la sesión hija se lee de `<subagent sessionID="…">`. `served()` arranca `opencode serve` con una contraseña propia en `OPENCODE_SERVER_PASSWORD`, habla con `/api` por Basic auth, crea la sesión en la carpeta del repositorio, y `say` y `compact` esperan con `wait` a que la sesión quede inactiva. Si el servidor no llega a responder, lo para antes de fallar, para no dejarlo vivo.
- La tarjeta tras compactar: OpenCode 2 la recibe en las partes de sistema de la siguiente llamada al modelo (ARCHITECTURE §10), así que el test la busca en cualquier mensaje de esa petición, y comprueba que la petición de antes de compactar no la traía. Ya no espera a verla entre los mensajes de la sesión, que era cómo la recibía OpenCode 1.
- `fake-chat.ts`: una petición cuyo último mensaje pide un resumen con `<template>` recibe la primera cabecera de la plantilla, no cuenta como paso del guion ni como petición de la conversación.
- `findOpencode()` lee `opencode --version` y solo da el binario desde 2.2; con uno anterior, el E2E se salta, y el nombre del `describe` dice que necesita OpenCode 2.2 o posterior.

## Archivos

- modificar packages/cli/src/install/opencode.ts — el fin de turno del plugin en OpenCode 2.2: `session.execution.succeeded`, con la sesión en `data`
- modificar packages/cli/test/opencode.test.ts — el plugin devuelve al trabajo la sesión de OpenCode 2.2 desde `session.execution.succeeded`, una vez seguida
- modificar packages/cli/test/opencode-e2e.test.ts — maneja OpenCode 2.2.5: `run --standalone`, sus herramientas, la API de `serve` con contraseña y la tarjeta en las partes de sistema; para el servidor si no arranca; solo desde OpenCode 2.2
- modificar packages/cli/test/fake-chat.ts — responde a la petición de compactar de OpenCode 2.2 con la cabecera de su plantilla, fuera del guion
- modificar docs/ARCHITECTURE.md — la versión con la que se comprobó el plugin y el E2E (2.2.5), el fin de turno de OpenCode 2.2 y cómo maneja el E2E a OpenCode desde 2.2

## Tareas

- [x] T1: El fin de turno del plugin en OpenCode 2.2
  - files: packages/cli/src/install/opencode.ts, packages/cli/test/opencode.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/opencode.test.ts test/opencode-install.test.ts && pnpm typecheck
  - type: fix
- [ ] T2: El E2E de OpenCode maneja OpenCode 2.2.5
  - files: packages/cli/test/opencode-e2e.test.ts, packages/cli/test/fake-chat.ts
  - ac: AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/opencode-e2e.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: test
- [ ] T3: ARCHITECTURE cuenta OpenCode 2.2.5
  - files: docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-core test
  - type: docs

## Riesgos

- R1: Otra versión de OpenCode 2 cambia otra vez los nombres o la API — el E2E falla con el nombre del paso que cambió, y el plugin sigue escuchando los dos eventos de fin de turno.
- R2: `wait` responde antes de que empiece el turno que acaba de admitir `prompt` — se comprobó en 2.2.5 que espera al turno; si no, el test de compactar fallaría por falta de la tarjeta, no por pasar en falso.
- R3: Con OpenCode 2.2, el fin de turno también salta en la sesión hija de un subagente, como ya pasaba con la beta — queda como estaba, fuera de alcance.
