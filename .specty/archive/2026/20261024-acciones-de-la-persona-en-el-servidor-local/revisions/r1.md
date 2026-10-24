---
kind: standard
---

# Acciones de la persona en el servidor local

## Objetivo

El servidor de `specty ui` deja de ser solo de lectura cuando lo arranca la persona: acepta, en nombre de quien abrió el enlace, las decisiones que hoy se toman en la terminal (aprobar la spec, decidir un supuesto de alto impacto, aprobar o rechazar una solicitud de alcance, aceptar el resultado o pedir un ajuste, y confirmar el cierre), y las ejecuta con los mismos comandos de la CLI, en la carpeta del cambio y con el canal `ui`. Si lo arranca el agente, sigue siendo de solo lectura, porque el agente vería el enlace (decisión de la persona del 2026-10-24).

## Fuera de alcance

- Que la UI llame a estas acciones: va en su propio cambio, sobre `SpectyData`.
- Comentarios y «pedir cambios» de la revisión, el interruptor del modo delegado, la verificación completa y los diffs desde la UI.
- Cancelar desde la UI.

## Supuestos

- A1: El servidor admite acciones solo si `specty ui` se arrancó desde una terminal interactiva, como `specty approve`; arrancado sin TTY (por el agente), cualquier acción recibe 403 y un texto que pide a la persona arrancarlo ella.
  - impacto: alto
- A2: Cada acción ejecuta el comando de la CLI que ya existe (`approve`, `approve --scope`/`reject --scope`, `accept`, `adjust`, `close`) con una terminal de la UI: la persona ya decidió en la pantalla, así que confirma, elige y responde con lo que trae la petición, y registra el canal `ui` en la aprobación; `accept` recibe además una opción para no preguntar por la verificación completa, que la UI lanzará aparte.
  - impacto: alto
- A3: Decidir un supuesto de alto impacto es nuevo en la CLI: guarda la decisión (y el comentario, si lo rechaza) en `state.items` durante la revisión y lo anota como `assumption.decided` con el ítem, la decisión y el comentario (formats.md §4).
- A4: Las acciones son `POST` con JSON; además de la cookie de sesión exigen la cabecera `Origin` del propio servidor y la cabecera `X-Specty-CSRF` con el token que da `GET /api/session` (que también dice si hay acciones). Responden la salida del comando: 200 si fue bien y 409 si el flujo la rechazó.
- A5: Antes de aprobar, el servidor comprueba que la revisión pedida sea la vigente y que no queden supuestos de alto impacto sin decidir ni rechazados, para no confundir con un éxito el «Nada cambió» de un comando aplazado.

## Criterios de aceptación

- AC1: CUANDO la persona arranca `specty ui` desde su terminal ENTONCES `GET /api/session` dice que hay acciones y da el token CSRF, y la salida del comando lo dice; arrancado sin terminal, no hay acciones y toda acción recibe 403.
- AC2: CUANDO la UI aprueba la revisión vigente, con sus supuestos de alto impacto confirmados, ENTONCES el cambio pasa a implementación, la aprobación queda con el canal `ui` y su commit, como en la terminal; con otra revisión o con supuestos sin decidir, 409 con el motivo.
- AC3: CUANDO la UI confirma o rechaza un supuesto de alto impacto durante la revisión ENTONCES `state.items` guarda la decisión y el comentario, y la auditoría la anota.
- AC4: CUANDO la UI decide una solicitud de alcance, acepta el resultado, pide un ajuste o confirma el cierre ENTONCES pasa lo mismo que con `approve --scope`, `reject --scope`, `accept`, `adjust` y `close` en la terminal, en la carpeta del cambio.
- AC5: CUANDO una acción llega sin la cabecera CSRF correcta, sin `Origin` o con otro, o sin la cookie de sesión ENTONCES recibe 403 y no cambia nada.

## Diseño

- `session.ts`: `Terminal.channel` (`tty` o `ui`); `approve` registra ese canal y `accept` acepta `{ verify: false }`.
- `flow/review.ts`: `decideAssumption(session, change, item, decision, comment)`.
- `server/actions.ts`: la terminal de la UI, las comprobaciones previas y el reparto de cada acción a su comando con `personSession`, en la carpeta del cambio.
- `server/http.ts`: `GET /api/session`, el token CSRF y el enrutado de los `POST`; `commands/ui.ts` habilita las acciones solo con una terminal interactiva.

## Archivos

- modificar packages/cli/src/session.ts — el canal de la terminal
- modificar packages/cli/src/commands/approve.ts — registrar el canal de la terminal
- modificar packages/cli/src/commands/accept.ts — no preguntar por la verificación si la petición ya lo dice
- crear packages/cli/src/flow/review.ts — decidir un supuesto
- crear packages/cli/src/server/actions.ts — las acciones de la persona
- modificar packages/cli/src/server/http.ts — sesión, CSRF y rutas POST
- modificar packages/cli/src/commands/ui.ts — acciones solo si lo arranca la persona
- crear packages/cli/test/server-actions.test.ts — acciones, seguridad y modo de solo lectura
- modificar docs/ARCHITECTURE.md — §15: las acciones
- modificar docs/ui.md — Seguridad: quién puede decidir desde la UI

## Tareas

- [ ] T1: La terminal de la UI y decidir un supuesto
  - files: packages/cli/src/session.ts, packages/cli/src/commands/approve.ts, packages/cli/src/commands/accept.ts, packages/cli/src/flow/review.ts, packages/cli/test/server-actions.test.ts
  - ac: AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server-actions.test.ts test/commands.test.ts test/flow.test.ts
- [ ] T2: Las acciones en el servidor
  - files: packages/cli/src/server/actions.ts, packages/cli/src/server/http.ts, packages/cli/src/commands/ui.ts, packages/cli/test/server-actions.test.ts
  - ac: AC1, AC2, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server-actions.test.ts test/server.test.ts
- [ ] T3: Documentar las acciones
  - files: docs/ARCHITECTURE.md, docs/ui.md
  - ac: —
  - verify: pnpm check
  - type: docs

## Riesgos

- R1: Confirmar el cierre desde la UI incorpora el cambio y puede tardar lo que tarde la verificación — la petición espera; la UI lo mostrará en curso.
- R2: Un agente con acceso al navegador de la persona podría usar su sesión — fuera del modelo de confianza de Specty, como hoy un agente que escribe en la terminal de la persona.
