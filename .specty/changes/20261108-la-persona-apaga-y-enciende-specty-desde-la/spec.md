---
kind: standard
epic: 20261108-interruptor-para-encender-y-apagar-el-flujo-de
slice: C2
---

# La persona apaga y enciende Specty desde la cabecera de la UI y ve su registro

## Objetivo

Segundo corte de la épica del interruptor. C1 dejó en main lo que hace Specty apagado y su registro (`store/switch.ts`), pero nadie puede cambiarlo todavía. Este corte da a la persona el interruptor «Specty» en la cabecera de la UI. Al pulsarlo, un diálogo explica qué pasa al apagarlo o al encenderlo y muestra el registro, con cada cambio de estado, quién lo hizo y cuándo. El servidor local lo sirve en `GET /api/switch` y lo cambia con `POST /api/switch`, con las mismas comprobaciones que las demás decisiones de la persona.

## Fuera de alcance

- Un comando de terminal para encender o apagar Specty: solo la UI de la persona lo cambia.
- Mostrar el interruptor en la MCP App, la extensión de VS Code, `specty status` o `specty doctor`: la fuente de la MCP App no sabe del interruptor y no aparece.
- Cambiar lo que hace Specty apagado, que dejó C1 (guard, hooks de git, fin de turno y `specty next`).
- Paginar o filtrar el registro: el diálogo lo muestra entero, porque solo crece cuando la persona cambia el estado.

## Supuestos

- A1: Quien apaga o enciende es el `user.name` de git del servidor (o `unknown` sin él) y la hora es la del servidor, como en el modo delegado. El servidor que arrancó la persona es el único que escribe.
- A2: `POST /api/switch` responde 200 con la vista nueva también cuando el estado ya era el pedido: no añade ninguna línea y no es un error, porque otra pestaña pudo cambiarlo antes.
- A3: El interruptor va en la cabecera entre «Buscar o ejecutar» y el chip del modo delegado. Apagado, lleva el tono de atención del chip del modo delegado, para que la persona no olvide que su agente trabaja sin el flujo. En el teléfono solo queda el interruptor, sin el texto, y su nombre accesible sigue siendo «Specty».
  - impacto: bajo
- A4: En un servidor de solo lectura, el interruptor muestra el estado pero está desactivado, con el motivo de `Decisions.blocked()` en su tooltip. El comando de la paleta sigue abriendo el diálogo para leer el registro, con la confirmación desactivada, como el modo delegado.
- A5: La firma de los eventos (`fingerprint`) incluye la última entrada del registro (`readSwitch`) en lugar del tamaño y la hora del archivo que proponía la épica: cada línea nueva cambia la última entrada, y así no hace falta exponer la ruta del registro fuera de `store/switch.ts`.

## Criterios de aceptación

- AC1: CUANDO la persona apaga o enciende Specty con `POST /api/switch` y `{ "on": boolean }` ENTONCES se añade al registro una línea con el estado nuevo, el `user.name` de git y la hora, y responde 200 con la vista nueva; `GET /api/switch` da `{ on, by?, at?, log }`, con el registro de la entrada más reciente a la más antigua; pedir el estado que ya tiene responde 200 sin añadir ninguna línea; y la firma de los eventos cambia con cada cambio de estado, para que las demás pestañas lo vean.
- AC2: CUANDO `POST /api/switch` llega a un servidor de solo lectura, sin el token de la sesión o con un cuerpo sin `on` booleano ENTONCES se rechaza (403, 403 y 400) y el registro no cambia.
- AC3: CUANDO la persona abre la UI con una fuente que sabe del interruptor ENTONCES la cabecera muestra el interruptor «Specty» (`role="switch"`, con `aria-checked` según el estado); si la fuente no sabe del interruptor, no aparece.
- AC4: CUANDO la persona pulsa el interruptor ENTONCES un diálogo explica qué pasa al apagarlo o, al encenderlo, desde cuándo estaba apagado, quién lo apagó y qué vuelve a actuar; muestra el registro (estado, quién y cuándo) y solo cambia el estado al confirmar, con un aviso. Cancelar no lo cambia. Si la fuente rechaza el cambio, un aviso dice por qué y el diálogo sigue abierto. La paleta ofrece «Encender o apagar Specty…», que abre el mismo diálogo.
- AC5: CUANDO la UI viene de un servidor de solo lectura ENTONCES el interruptor muestra el estado pero está desactivado y dice por qué, y en el diálogo que abre la paleta la confirmación está desactivada.
- AC6: CUANDO la UI lee y cambia el interruptor ENTONCES `ServerData` pide `GET /api/switch`, rechaza una respuesta sin la forma esperada y envía `POST /api/switch` con `{ on }` y el token de la sesión; `FixtureData` guarda un estado de ejemplo con su registro y avisa a sus suscriptores al cambiarlo; y la fuente base no sabe del interruptor y rechaza cambiarlo.

## Diseño

- **Servidor** (`server/switch.ts`, nuevo, como `server/config.ts`): `switchView(session)` lee `switchLog` y da `{ ...última entrada, log }` o, sin ninguna, `{ on: true, log: [] }`. `switchPost(context, pathname, body)` responde solo a `/api/switch`: sin `on` booleano, 400; si no, dentro de `context.serial`, `turnSwitch` con `user.name` (o `unknown`) y `environment.now()`, y 200 con `switchView`. `api.ts` añade `/api/switch` a `VIEWS` y, en `act`, pregunta a `configPost` y después a `switchPost` desde una función aparte, para no subir la complejidad de `act`. Las comprobaciones de origen, token y servidor con acciones ya las hace `actionRefusal` antes.
- **Eventos** (`server/events.ts`): `fingerprint` añade `switch` con `readSwitch`, como hace con el modo delegado (A5).
- **Datos de la UI**: `records.ts` gana `SwitchEntry` (`{ on, by, at }`) y `SpectySwitch` (`{ on, by?, at?, log }`). `SpectyData` (`source.ts`) gana `specty()`, que da nada, y `setSpecty(on)`, rechazado con `READ_ONLY`. `ServerData` los pide a `/api/switch`, con `isSpectySwitch` en `server-answers.ts`. `FixtureData` empieza encendido con un registro de ejemplo (`sample-switch.ts`, nuevo, como `sample-delegation.ts`) y, al cambiarlo, añade la entrada con el revisor de ejemplo y avisa.
- **Interruptor** (`app/specty-switch.ts`, nuevo, como `app/delegation.ts`): `SwitchState` lee la fuente y vuelve a leerla con cada aviso. `SpectySwitchToggle` (`sp-specty-switch`) es un `<button role="switch">` nativo dentro de `sp-tooltip`, con `aria-checked`, `aria-label="Specty"`, una pista con su botón y el texto «Specty» desde `sm`. Apagado, lleva el tono `--color-phase-review`. En solo lectura queda `disabled` y el tooltip da el motivo. Registra en la paleta «Encender o apagar Specty…». Dos diálogos, `TurnSpectyOff` y `TurnSpectyOn`, con el efecto, el registro (`SwitchLog`, una lista con «Apagado» o «Encendido», quién y cuándo, o «Aún no se ha apagado nunca.») y la confirmación con `disabledReason` de `Decisions.blocked()`. Un rechazo se informa con `reportFailure` y el diálogo sigue abierto. `shell.ts` lo pone en la cabecera, antes del chip del modo delegado.
- **Documentación**: `GET /api/switch` y `POST /api/switch` en `docs/ARCHITECTURE.md` §15, que el registro se cambia desde la UI en §10 y en `docs/formats.md` §1, y el interruptor de la cabecera en el armazón de `docs/ui.md`.

## Archivos

- crear packages/cli/src/server/switch.ts — `GET /api/switch` y `POST /api/switch`: la vista del interruptor y su cambio
- modificar packages/cli/src/server/api.ts — la lectura y la acción de `/api/switch`
- modificar packages/cli/src/server/events.ts — la firma de los eventos incluye el interruptor
- crear packages/cli/test/server/switch.test.ts — la vista, el cambio, el estado repetido, los rechazos y la firma
- modificar packages/ui/src/data/records.ts — `SwitchEntry` y `SpectySwitch`
- modificar packages/ui/src/data/source.ts — `specty()` y `setSpecty(on)` en `SpectyData`
- modificar packages/ui/src/data/server.ts — `ServerData` lee y cambia `/api/switch`
- modificar packages/ui/src/data/server-answers.ts — `isSpectySwitch`, la comprobación de la respuesta
- modificar packages/ui/src/data/fixtures.ts — el interruptor de ejemplo y su cambio
- crear packages/ui/src/data/sample-switch.ts — el estado y el registro de ejemplo
- crear packages/ui/src/data/switch-data.test.ts — el interruptor en `ServerData`, `FixtureData` y la fuente base
- crear packages/ui/src/app/specty-switch.ts — el interruptor de la cabecera, sus diálogos y el comando de la paleta
- modificar packages/ui/src/app/shell.ts — el interruptor en la cabecera
- crear packages/ui/src/app/specty-switch.test.ts — el interruptor, los diálogos, la paleta, el rechazo y la solo lectura
- modificar docs/ARCHITECTURE.md — §15: `/api/switch`; §10: el registro se cambia desde la UI
- modificar docs/formats.md — §1: quién escribe `switch.jsonl`
- modificar docs/ui.md — el interruptor en el armazón

## Tareas

- [x] T1: El servidor da y cambia el interruptor en `/api/switch`, y la firma de los eventos lo incluye
  - files: packages/cli/src/server/switch.ts, packages/cli/src/server/api.ts, packages/cli/src/server/events.ts, packages/cli/test/server/switch.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server/switch.test.ts
- [x] T2: Las fuentes de datos de la UI leen y cambian el interruptor
  - files: packages/ui/src/data/records.ts, packages/ui/src/data/source.ts, packages/ui/src/data/server.ts, packages/ui/src/data/server-answers.ts, packages/ui/src/data/fixtures.ts, packages/ui/src/data/sample-switch.ts, packages/ui/src/data/switch-data.test.ts
  - ac: AC6
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/switch-data.test.ts
- [x] T3: El interruptor «Specty» en la cabecera, con sus diálogos y su comando de la paleta
  - files: packages/ui/src/app/specty-switch.ts, packages/ui/src/app/shell.ts, packages/ui/src/app/specty-switch.test.ts
  - ac: AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/app/specty-switch.test.ts && pnpm typecheck
- [ ] T4: La documentación cuenta `/api/switch` y el interruptor de la cabecera
  - files: docs/ARCHITECTURE.md, docs/formats.md, docs/ui.md
  - ac: AC1, AC3
  - type: docs

## Riesgos

- R1: El servidor acepta `POST /api/switch` de quien tenga su token, como `/api/delegation`. Mitigación: pasa por `actionRefusal` (origen, cookie, token y servidor con acciones), igual que las demás decisiones de la persona.
- R2: Una pestaña abierta con el estado viejo podría pedir el que ya hay. Mitigación: pedir el estado actual no añade ninguna línea y responde con la vista nueva, y la firma de los eventos avisa a las demás pestañas de cada cambio.
