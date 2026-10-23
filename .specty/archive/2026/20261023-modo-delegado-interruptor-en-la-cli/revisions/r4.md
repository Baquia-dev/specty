---
kind: standard
---

# Modo delegado: interruptor en la CLI

## Objetivo

Segundo y último paso del modo delegado (ADR 0010). `specty delegate on` lo activa desde la terminal de la persona, después de mostrar la advertencia y pedir confirmación, y `specty delegate off` lo desactiva. Mientras está activo, el agente ejecuta sin TTY `approve` (también con `--scope`), `reject --scope`, `accept`, `close` y `cancel`. El guard y las tarjetas, que ya estaban preparados, reciben la delegación, y la auditoría registra esas acciones como del agente, por delegación.

## Fuera de alcance

- Un interruptor en la UI y la etiqueta del canal «delegado» en su historial: llegarán cuando la UI tenga su servidor local (§15).
- Una delegación que caduque sola o que cubra solo algunas acciones.
- Que `specty doctor` informe del modo.
- La retro mínima (`retro --minimal`): sigue exigiendo que la persona escriba el motivo.

## Supuestos

- A1: El interruptor es un archivo local en `git rev-parse --git-path common/specty/delegated.json`. Lo que cuelga de `common/` lo comparten todas las worktrees del clon, y nunca se versiona. Guarda quién lo activó y cuándo, y desactivarlo lo borra. El guard ya protege `.git/**` de las escrituras del agente.
- A2: Sin TTY y con el modo activo, la CLI responde por la persona: confirma, da por confirmados los supuestos de impacto alto pendientes y no pide comentarios; `reject --scope` y `cancel` usan `--reason` si el agente lo pasa. Con TTY, aunque el modo esté activo, sigue decidiendo la persona.
- A3: Actuando el agente, `accept` ejecuta la verificación completa (`verify.full`) sin preguntar, si está configurada. Si falla, no acepta: la salida pide corregirlo con `specty adjust`.
- A4: `by` sigue siendo el nombre de git de la persona, que es quien delegó, y queda constancia de la delegación en lo que se versiona con el cambio. En `state.json`, la aprobación lleva `channel: "delegated"`. En `audit.jsonl`, cada decisión delegada (aprobar, decidir el alcance, aceptar, cerrar y cancelar) queda con `actor: "agent"` y `delegated: true`.
- A5: `delegate` solo admite `on` y `off`, y siempre exige una TTY, también para desactivarlo: el modo se consulta en `specty status`, que ya muestra el bloque MODO DELEGADO.

## Criterios de aceptación

- AC1: CUANDO la persona ejecuta `specty delegate on` en su terminal ENTONCES ve la advertencia y se le pide confirmación (por defecto, no); si confirma, el modo queda activo para todas las worktrees del clon y la salida lo confirma; si no, nada cambia.
- AC2: CUANDO se ejecuta `specty delegate on` u `off` sin TTY, con el modo activo o sin él, ENTONCES se rechaza con la tarjeta de las acciones de la persona y el modo no cambia.
- AC3: CUANDO la persona ejecuta `specty delegate off` ENTONCES el modo se desactiva y las acciones de la persona vuelven a exigir su TTY.
- AC4: CUANDO el modo está activo y el agente ejecuta sin TTY `approve`, `approve --scope <S>`, `reject --scope <S>`, `close` o `cancel` ENTONCES se ejecutan sin preguntar (la spec se aprueba con sus supuestos de impacto alto confirmados), y cada evento queda en la auditoría con `actor: "agent"` y `delegated: true`; la aprobación, en `state.json`, con `by` igual al nombre de git de la persona y `channel: "delegated"`.
- AC5: CUANDO el modo está activo y el agente ejecuta `accept` sin TTY ENTONCES se ejecuta la verificación completa: si pasa, el resultado se acepta; si falla, no se acepta y la salida pide corregirlo con `specty adjust`.
- AC6: CUANDO el modo está activo ENTONCES el guard deja pasar los comandos de la persona salvo `delegate`, el `SIGUIENTE:` de las tarjetas le pide al agente que los ejecute y `specty status` muestra el bloque MODO DELEGADO.
- AC7: CUANDO el modo no está activo ENTONCES todo funciona como antes: sin TTY, las acciones de la persona se rechazan.

## Diseño

- `store/local.ts`: `readDelegation`, `writeDelegation` y `clearDelegation` sobre `git.gitPath("common/specty/delegated.json")`; según gitrepository-layout, lo que hay bajo `common/` se comparte entre worktrees.
- `session.ts`: `Session.delegated`, leído en `openSession`, y `cards.delegated`. Sin TTY y con el modo activo, la sesión usa una terminal delegada: `confirm` responde que sí, `choose` y `ask` no responden y `note` escribe en la salida. `interactive` sigue siendo falso: la delegación no convierte la shell del agente en una persona.
- Puertas: `humanChange` (accept, close y cancel), `approve` y `reject` aceptan `terminal.interactive || session.delegated`. Si actúa el agente, `approve` confirma sin preguntar los supuestos de impacto alto pendientes y registra `channel: "delegated"`.
- `accept`: si actúa el agente, ejecuta `verify.full` sin preguntar y, si falla, devuelve una tarjeta bloqueada que pide `specty adjust`.
- Auditoría: `commitState` (`flow/active.ts`) registra como `agent` con `delegated: true` una decisión de la persona tomada por el agente, y `archive` (`flow/finish.ts`) añade `delegated: true` a los cierres y cancelaciones delegados.
- `commands/delegate.ts`: `on` (TTY, advertencia, confirmación por defecto no, escribe el interruptor) y `off` (TTY, lo borra), con `delegationCard` como salida. `program.ts` lo registra.
- `enforce/guard.ts` pasa `delegated` al contexto del guard. Leer el interruptor añade un `git rev-parse` a cada llamada del guard; se mide antes y después.
- core `schema/state.ts`: `approved.channel` admite `delegated`.

## Archivos

- crear packages/cli/src/commands/delegate.ts — `specty delegate on|off`
- modificar packages/cli/src/program.ts — registrar `delegate`
- modificar packages/cli/src/store/local.ts — leer, escribir y borrar el interruptor
- crear packages/cli/test/delegate.test.ts — de punta a punta: interruptor, acciones delegadas y sin delegación
- modificar packages/cli/src/session.ts — `delegated` en la sesión y en las tarjetas; la terminal delegada
- modificar packages/cli/src/enforce/guard.ts — `delegated` en el contexto del guard
- modificar packages/cli/src/commands/human.ts — la puerta de accept, close y cancel
- modificar packages/cli/src/commands/scope-decision.ts — la puerta de `reject`
- modificar packages/cli/src/flow/active.ts — la auditoría de las decisiones delegadas
- modificar packages/cli/src/flow/finish.ts — la auditoría de los cierres y cancelaciones delegados
- modificar packages/core/src/schema/state.ts — `approved.channel` admite `delegated`
- modificar packages/cli/src/commands/approve.ts — la puerta, los supuestos de impacto alto y el canal
- modificar packages/cli/src/commands/accept.ts — la verificación completa obligatoria y no aceptar si falla
- modificar docs/ARCHITECTURE.md — §6: `delegate` y las acciones de la persona en modo delegado
- modificar docs/formats.md — el archivo del interruptor (§1), el canal (§3) y la marca de auditoría (§4)

## Tareas

- [x] T1: El interruptor `specty delegate`
  - files: packages/cli/src/commands/delegate.ts, packages/cli/src/program.ts, packages/cli/src/store/local.ts, packages/cli/test/delegate.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty build && pnpm --filter @baquia-dev/specty exec vitest run test/delegate.test.ts
- [x] T2: La sesión, el guard y las puertas con el modo activo
  - files: packages/cli/src/session.ts, packages/cli/src/enforce/guard.ts, packages/cli/src/commands/human.ts, packages/cli/src/commands/scope-decision.ts, packages/cli/test/delegate.test.ts
  - ac: AC6, AC7
  - verify: pnpm --filter @baquia-dev/specty build && pnpm --filter @baquia-dev/specty exec vitest run test/delegate.test.ts
- [x] T3: La auditoría y la aprobación delegadas
  - files: packages/cli/src/flow/active.ts, packages/cli/src/flow/finish.ts, packages/core/src/schema/state.ts, packages/cli/src/commands/approve.ts, packages/cli/test/delegate.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty build && pnpm --filter @baquia-dev/specty exec vitest run test/delegate.test.ts
- [x] T4: Aceptar con la verificación completa, y la documentación
  - files: packages/cli/src/commands/accept.ts, docs/ARCHITECTURE.md, docs/formats.md, packages/cli/test/delegate.test.ts
  - ac: AC5
  - verify: pnpm check

## Riesgos

- R1: Si la terminal delegada respondiera donde no debe, el agente decidiría sin delegación. Por eso solo se construye con el modo activo y sin TTY, `interactive` sigue siendo falso, y AC7 prueba que sin el modo todo se rechaza como antes.
- R2: Aceptar a ciegas un resultado roto. Actuando el agente, `accept` siempre ejecuta la verificación completa y no acepta si falla (AC5).
- R3: Un agente que escriba el interruptor por su cuenta, por ejemplo con un script, se saltaría la advertencia. El guard protege `.git/**` de las escrituras que ve, y el modelo de confianza (§10) ya asume que una evasión deliberada no se puede impedir en local.

## Cierre

### Resumen

El modo delegado ya funciona de punta a punta.

**El interruptor.** `specty delegate on` muestra la advertencia y solo activa el modo si la persona elige «Sí» explícitamente; la opción por defecto es «No». `specty delegate off` lo desactiva, y las dos exigen una TTY real. El interruptor se guarda en `.git/common/specty/delegated.json`, con quién lo activó y cuándo, y lo comparten todas las worktrees del clon.

**Las acciones sin TTY.** Con el modo activo, la sesión lo sabe (`Session.delegated`) y se lo pasa a las tarjetas y al guard. Sin TTY, una terminal delegada responde por la persona: confirma, pero no elige opciones ni escribe textos, y muestra los resúmenes en stderr. Así el agente ejecuta `approve` (también con `--scope`), `reject --scope`, `accept`, `close` y `cancel`. Si aprueba el agente, los supuestos de impacto alto pendientes se dan por confirmados. Si acepta el agente, se ejecuta siempre la verificación completa, y si falla no se acepta: la salida pide `specty adjust`.

**La constancia.** Cada decisión delegada queda en la auditoría con `actor: "agent"` y `delegated: true`. La aprobación guarda `channel: "delegated"`, con la persona en `by`. Si la persona decide desde su terminal con el modo activo, se registra como siempre (`human`, `tty`).

### Desviaciones

- **«Por defecto, no» con `choose`, no con `confirm`:** `Terminal.confirm` no admite un valor por defecto, y cambiarlo habría tocado `terminal.ts`, que no estaba en Archivos. La primera opción de `choose` es la por defecto, y es «No».
- **Los resúmenes de la terminal delegada van a stderr**, no a la salida normal, para que `--json` siga siendo JSON válido.
- **`delegate on` con el modo ya activo** solo lo confirma, sin volver a preguntar.

### Decisiones

- **Una sola puerta, `canDecide`:** la usan `humanChange` (accept, close y cancel), `approve` y `reject`. Pasa si hay una TTY o si la persona delegó.
- **`session.actor === "agent"` tras la puerta significa «por delegación»:** la puerta solo deja pasar a un agente con el modo activo. `approve` y `accept` lo usan para no preguntar.
- **`auditEntry` en `flow/active.ts`:** lo usan `commitState` y `archive`, y `archive` registra siempre una decisión de la persona (cerrar, cancelar, aceptar un quick o confirmar una retro).
- **La máquina de estados no cambia:** la CLI sigue pasando `actor: "human"` a las transiciones, porque la persona delegó su autoridad.
- **Latencia del guard:** leer el interruptor añade un `git rev-parse` a cada llamada; el p95 pasó de 90 a 98 ms, dentro del objetivo de 200 ms.

### Pendientes

- **Recompilar la CLI de la carpeta principal** después de incorporar este cambio, para que el `specty` global tenga `delegate`.
- **Volver a ejecutar `specty init`** para que el AGENTS.md de este repositorio tenga la línea nueva del bloque de flujo (del cambio anterior).
- **En la UI:** la etiqueta del canal `delegated` en el historial (hoy sale sin canal) y el interruptor, cuando la UI tenga su servidor local (§15).
- **Opcional:** un trailer `Specty-Delegated` en los commits de las decisiones delegadas, para que `git log` también lo muestre.
- **`specty doctor`** podría avisar de que el modo está activo.
