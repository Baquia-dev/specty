---
kind: standard
---

# Modo delegado en el servidor local

## Objetivo

El servidor de `specty ui` dice si el modo delegado está activo (quién lo activó y cuándo) y da el aviso que `specty delegate on` muestra antes de activarlo, en español y en inglés; y, si lo arrancó la persona, lo activa o desactiva con el mismo comando que la terminal. Así la UI podrá mostrar el interruptor que pidió la persona, y las vistas se actualizan también cuando el modo cambia desde la CLI.

## Fuera de alcance

- El interruptor en la UI: va en su propio cambio, sobre estas rutas.
- Cambiar qué hace el modo delegado (ADR 0010).

## Supuestos

- A1: `GET /api/delegation` responde `{ on, by?, at?, warning: { es, en } }`, con el aviso de las tarjetas del core en los dos idiomas, y exige la sesión como el resto de la API.
  - impacto: alto
- A2: `POST /api/delegation` con `{ on: true | false }` es una acción de la persona como las demás (`Origin`, cookie, token CSRF y servidor arrancado por la persona) y ejecuta `delegate on|off`; al activarlo, la terminal de la UI responde «sí» a la pregunta del comando, porque la persona ya leyó el aviso y confirmó en la pantalla.
  - impacto: alto
- A3: La firma de los eventos en vivo incluye el interruptor (el contenido de `delegated.json` de la carpeta común de git), así que activarlo o desactivarlo, desde la UI o desde la terminal, emite `changes`.

## Criterios de aceptación

- AC1: CUANDO la UI pide el modo delegado ENTONCES sabe si está activo, quién lo activó y cuándo, y recibe el aviso en español y en inglés.
- AC2: CUANDO la persona lo activa o lo desactiva desde la UI servida por su `specty ui` ENTONCES pasa lo mismo que con `specty delegate on|off` en su terminal; con un servidor de solo lectura o sin el token CSRF, 403, y con un cuerpo que no dice `on`, 400.
- AC3: CUANDO el modo delegado cambia ENTONCES `/api/events` emite `changes`.

## Diseño

- `server/actions.ts`: `delegationView(session)` y `setDelegation(session, on)`, con la terminal de la UI respondiendo «sí» al activarlo.
- `server/http.ts`: `GET` y `POST /api/delegation`.
- `server/events.ts`: el interruptor entra en la firma.

## Archivos

- modificar packages/cli/src/server/actions.ts — leer y cambiar el modo delegado
- modificar packages/cli/src/server/http.ts — las rutas del modo delegado
- modificar packages/cli/src/server/events.ts — el interruptor en la firma de los eventos
- modificar packages/cli/test/server/actions.test.ts — tests del modo delegado
- modificar docs/ARCHITECTURE.md — §15: el modo delegado en el servidor

## Tareas

- [x] T1: El modo delegado en el servidor
  - files: packages/cli/src/server/actions.ts, packages/cli/src/server/http.ts, packages/cli/src/server/events.ts, packages/cli/test/server/actions.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server/actions.test.ts test/server.test.ts test/delegate.test.ts
- [ ] T2: Documentar el modo delegado en el servidor
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm check
  - type: docs
