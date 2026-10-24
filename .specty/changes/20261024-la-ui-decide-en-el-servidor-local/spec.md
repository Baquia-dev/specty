---
kind: standard
---

# La UI decide en el servidor local

## Objetivo

Servida por un `specty ui` que arrancó la persona, la UI deja de ser de solo lectura: sus botones de aprobar, decidir un supuesto, decidir una solicitud de alcance, aceptar o pedir un ajuste y confirmar el cierre llaman a las acciones que ya tiene el servidor. Si el servidor lo arrancó el agente, o la acción aún no existe en él, la UI lo explica en el idioma de la persona en lugar de fallar en silencio.

## Fuera de alcance

- Comentarios, «pedir cambios», la verificación completa y los diffs: el servidor todavía no los tiene.
- Ocultar los botones cuando el servidor es de solo lectura: por ahora la acción explica por qué no se puede.

## Supuestos

- A1: `ServerData` pide `GET /api/session` la primera vez que necesita actuar y guarda el token CSRF; cada acción es un `POST` con JSON y la cabecera `X-Specty-CSRF`, y el navegador añade solo la cookie y `Origin`.
  - impacto: alto
- A2: Si la acción va bien (200), la UI no hace nada más: el evento `changes` del servidor la hace volver a leer. Si el flujo la rechaza (409), el motivo es el texto de la salida del comando, en el idioma del repositorio, y la UI lo muestra igual en los dos idiomas.
- A3: Sin acciones (servidor de solo lectura), la UI pide arrancar `specty ui` en la terminal propia; sin sesión, abrir el enlace que imprime; y para comentarios, «pedir cambios», verificación y diffs dice que el servidor aún no los tiene.

## Criterios de aceptación

- AC1: CUANDO la persona aprueba, decide un supuesto o una solicitud de alcance, acepta, pide un ajuste o confirma el cierre en la UI servida por su `specty ui` ENTONCES la UI envía la acción al servidor con el token CSRF y, si va bien, se resuelve sin error.
- AC2: CUANDO el servidor rechaza la acción ENTONCES la UI muestra el motivo: el del flujo (409), que el servidor es de solo lectura, que falta la sesión o que la acción aún no existe en él.

## Diseño

- `data/server.ts`: `ServerData` implementa `approve`, `decideAssumption`, `decideScope`, `decideResult` y `confirmClosing` con un `act(change, verb, body)` común que lee la sesión una vez y traduce cada respuesta en éxito o en un `ActionError` bilingüe; `addComment`, `requestChanges`, `verifyChange` y `diff` explican que el servidor aún no los tiene.

## Archivos

- modificar packages/ui/src/data/server.ts — las acciones de la persona
- modificar packages/ui/src/data/server.test.ts — sus tests
- modificar docs/ARCHITECTURE.md — §15: la UI ya decide

## Tareas

- [x] T1: Las acciones de la persona en `ServerData`
  - files: packages/ui/src/data/server.ts, packages/ui/src/data/server.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/server.test.ts
- [ ] T2: Documentar que la UI decide
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm check
  - type: docs
