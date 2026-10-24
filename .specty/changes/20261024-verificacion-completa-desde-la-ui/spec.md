---
kind: standard
---

# Verificación completa desde la UI

## Objetivo

Desde la UI que sirve `specty ui`, la persona ejecuta la verificación completa (`verify.full`) de un cambio en aceptación, ve su salida en vivo y su resultado queda en la auditoría como `change.verified`. Hoy la UI responde que el servidor aún no lo admite. Además, `specty accept` ejecuta esa verificación en la terminal pero no la anota, aunque el formato la documenta.

## Fuera de alcance

- Ver en vivo las verificaciones de las tareas: corren en el proceso del agente, con `specty task done`, no en el servidor.
- Cancelar desde la UI una verificación en curso.
- Que aceptar desde la UI exija una verificación que pase: la UI ya ofrece ejecutarla antes, y la persona decide.

## Supuestos

- A1: Basta con verificar en la fase de aceptación, que es donde la UI la ofrece: en la pestaña de aceptación y con «Ejecutar antes» al aceptar. Fuera de esa fase, el servidor la rechaza con el motivo.
- A2: Para la salida en vivo basta con que el flujo de eventos que la UI ya escucha mande la ejecución entera, con sus últimas 1000 líneas, a lo sumo cuatro veces por segundo. En local eso es barato, y la UI no tiene que juntar trozos.

## Criterios de aceptación

- AC1: CUANDO la persona pide desde la UI de su `specty ui` la verificación completa de un cambio en aceptación ENTONCES el servidor ejecuta `verify.full` en la carpeta del cambio, responde en cuanto empieza, y la UI ve su salida en vivo hasta que termina.
- AC2: CUANDO esa verificación termina ENTONCES la auditoría del cambio anota `change.verified` con el comando, el código de salida, la duración y, si falló, el final de la salida, y la UI lo muestra como la última verificación completa.
- AC3: CUANDO ya corre una verificación del cambio, el cambio no está en aceptación o no hay `verify.full` ENTONCES el servidor la rechaza con su motivo (409). Si lo arrancó el agente, la rechaza como cualquier acción (403).
- AC4: CUANDO la UI se abre mientras corre una verificación ENTONCES la ve desde lo que lleva.
- AC5: CUANDO `specty accept` ejecuta la verificación completa en la terminal ENTONCES también anota `change.verified`.
- AC6: CUANDO alguien lee la arquitectura y los formatos ENTONCES encuentra las rutas, el evento `run` y quién anota `change.verified`.

## Diseño

- `cli/flow/verified.ts`: anota `change.verified` como `task.verified` anota la de una tarea: comando, código de salida, duración y, si falló, las últimas 10 líneas. Lo usan `specty accept` y el servidor.
- `cli/server/runs.ts`: las verificaciones en curso, una por cambio. Arranca `verify.full` con la shell en la carpeta del cambio, con el `timeoutSec` de su configuración. Junta las líneas de stdout y stderr, avisa como mucho cada 250 ms, y al terminar anota el resultado y avisa de que acabó. Al cerrar el servidor, termina las que sigan corriendo.
- `cli/server/events.ts`: el evento `run` (`{ change, run }`, con `run: null` al terminar) para todos los que escuchan.
- `cli/server/http.ts`: `POST /api/changes/<id>/verify` es una acción con la seguridad de las demás, pero fuera de la cola, porque tarda minutos y no cambia el estado: las demás acciones siguen respondiendo. `GET /api/changes/<id>/run` da la ejecución en curso, o `null`.
- UI: `ServerData.verifyChange` hace el `POST`. `watchRun` escucha `run` en el flujo de eventos compartido y pide `/run` para empezar desde lo que lleva; si un evento llega antes, gana el evento. Las comprobaciones y los mensajes de las respuestas pasan a `data/server-answers.ts`, para que `server.ts` no pase de 300 líneas.

## Archivos

- crear packages/cli/src/flow/verified.ts — anotar `change.verified`
- modificar packages/cli/src/commands/accept.ts — anotar la verificación completa de la terminal
- modificar packages/cli/test/commands.test.ts — `accept` la anota
- crear packages/cli/src/server/runs.ts — las verificaciones en curso
- modificar packages/cli/src/server/events.ts — el evento `run`
- modificar packages/cli/src/server/http.ts — las rutas de la verificación
- crear packages/cli/test/server/verify.test.ts — verificar desde el servidor
- crear packages/ui/src/data/server-answers.ts — comprobaciones y mensajes de las respuestas
- modificar packages/ui/src/data/server.ts — verificar y seguir la ejecución
- crear packages/ui/src/data/server-runs.test.ts — `verifyChange` y `watchRun`
- modificar packages/ui/src/data/server-actions.test.ts — verificar ya no es «aún no»
- modificar docs/ARCHITECTURE.md — §15: rutas y evento `run`
- modificar docs/formats.md — §4: quién anota `change.verified`

## Tareas

- [x] T1: `specty accept` anota la verificación completa
  - files: packages/cli/src/flow/verified.ts, packages/cli/src/commands/accept.ts, packages/cli/test/commands.test.ts
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/commands.test.ts test/delegate.test.ts
- [ ] T2: La verificación completa en el servidor
  - files: packages/cli/src/server/runs.ts, packages/cli/src/server/events.ts, packages/cli/src/server/http.ts, packages/cli/test/server/verify.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server && pnpm sources
- [ ] T3: La UI verifica y sigue la ejecución
  - files: packages/ui/src/data/server-answers.ts, packages/ui/src/data/server.ts, packages/ui/src/data/server-runs.test.ts, packages/ui/src/data/server-actions.test.ts
  - ac: AC1, AC2, AC4
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data && pnpm sources
- [ ] T4: Documentar la verificación desde la UI
  - files: docs/ARCHITECTURE.md, docs/formats.md
  - ac: AC6
  - verify: pnpm check
  - type: docs
