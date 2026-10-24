---
kind: standard
---

# Comentar y pedir cambios desde la UI

## Objetivo

En la UI que sirve `specty ui`, la persona comenta la spec durante la revisión y pide los cambios al agente. Hoy la UI responde que el servidor aún no lo admite, aunque el servidor ya tiene las dos rutas.

## Fuera de alcance

- Mostrar en la UI que los cambios ya se pidieron y que falta la revisión siguiente del agente.
- Ocultar o desactivar los botones cuando el servidor es de solo lectura: va en otro cambio.
- Verificar el cambio y ver diffs desde la UI: siguen respondiendo que el servidor aún no los admite.

## Supuestos

- A1: Basta con que la UI se actualice con el evento `changes` del servidor tras comentar o pedir cambios: su firma ya incluye `comments.json` y `audit.jsonl`, así que no hace falta leer nada más después de cada acción.

## Criterios de aceptación

- AC1: CUANDO la persona comenta en la UI servida por su `specty ui` ENTONCES la UI envía `POST /api/changes/<id>/comments` con el ancla y el texto tal cual, y el token CSRF.
- AC2: CUANDO la persona pide cambios ENTONCES la UI envía `POST /api/changes/<id>/request-changes`; si el servidor lo rechaza, la UI muestra el motivo del flujo, como en las demás decisiones.
- AC3: CUANDO alguien lee la arquitectura ENTONCES encuentra que comentar y pedir cambios desde la UI son acciones del servidor.

## Diseño

- `ServerData.addComment` y `ServerData.requestChanges` usan `act`, como las demás decisiones: `comments` con `{ anchor, body }` y `request-changes` con `{}`. Las anclas de la UI (`{ item }`, o `{ section, quote }` con las claves de `ReviewSection`) son las que acepta el servidor y las que la tarjeta del agente nombra.
- Solo `verifyChange` y `diff` siguen respondiendo «aún no admite esto desde la UI».

## Archivos

- modificar packages/ui/src/data/server.ts — comentar y pedir cambios contra el servidor
- modificar packages/ui/src/data/server.test.ts — las peticiones y los rechazos
- modificar docs/ARCHITECTURE.md — §15: comentar y pedir cambios desde la UI

## Tareas

- [ ] T1: Comentar y pedir cambios contra el servidor local
  - files: packages/ui/src/data/server.ts, packages/ui/src/data/server.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/server.test.ts
- [ ] T2: Documentar comentar y pedir cambios desde la UI
  - files: docs/ARCHITECTURE.md
  - ac: AC3
  - verify: pnpm check
  - type: docs
