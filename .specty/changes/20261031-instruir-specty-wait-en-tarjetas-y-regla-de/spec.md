---
kind: standard
---

# Instruir specty wait en tarjetas y regla de aprobaciones

## Objetivo

Instruir explícitamente al agente a ejecutar `specty wait` en la directiva `SIGUIENTE:` de todas las tarjetas donde se espera una acción humana (revisión de spec, aprobación de pruebas, decisiones de alcance, aceptación y cierre), y actualizar la regla de `AGENTS.md` para incluir las solicitudes de alcance, eliminando las frases que le ordenaban terminar su turno (`termina tu turno` / `end your turn`) para que el agente sondee pasivamente y se reanude de forma automática y reactiva tras cualquier decisión humana en la terminal o en la UI.

## Fuera de alcance

- Modificar la lógica interna de sondeo o bloqueo de `specty wait`.
- Modificar el comportamiento de comandos en modo delegado (en modo delegado el agente sigue ejecutando las acciones él mismo cuando `SIGUIENTE:` se lo pide).

## Supuestos

- A1: En todas las situaciones donde el cambio queda en espera por una acción de la persona (`waitingFor === "human"` o `pending.scopeRequests.length > 0`), la directiva `SIGUIENTE:` debe instruir al agente a pedir la acción al usuario y ejecutar `specty wait` para esperar su decisión, tanto en español como en inglés.
- A2: El límite estricto de 15 líneas y las 5 reglas del bloque `flowBlock` en `AGENTS.md` se preservan al añadir la decisión de alcance (`decidir el alcance` / `deciding scope`).

## Criterios de aceptación

- AC1: CUANDO una tarjeta indica una acción pendiente por la persona (revisión de spec, aprobación de pruebas, decisión de alcance o cierre) ENTONCES la directiva `SIGUIENTE:` instruye al agente a pedir la acción y ejecutar `${ctx.command} wait`, sin indicar que termine su turno (`termina tu turno` / `end your turn`).
- AC2: CUANDO el guard deniega un comando reservado a la persona ENTONCES `denied.next` instruye pedir al usuario que lo ejecute y ejecutar `${ctx.command} wait`, sin indicar que termine su turno.
- AC3: CUANDO se genera el bloque de flujo (`flowBlock`) de `AGENTS.md` ENTONCES la regla de decisiones humanas incluye explícitamente decidir el alcance y preserva el límite de 15 líneas.
- AC4: CUANDO se ejecutan los tests de tarjetas, guard y CLI ENTONCES todas las aserciones sobre `SIGUIENTE:` reflejan la instrucción de `specty wait` y pasan limpiamente.

## Archivos

- modificar packages/core/src/cards/flow.ts — instruir specty wait en tarjetas de cierre, spec lista y desbloqueo de test
- modificar packages/core/src/cards/next.ts — instruir specty wait en tarjeta de espera de revisión
- modificar packages/core/src/cards/testing.ts — instruir specty wait en tarjetas de aprobación de pruebas y solicitud de alcance
- modificar packages/core/test/cards/delegated.test.ts — actualizar aserciones de tarjetas
- modificar packages/core/test/cards/testing.test.ts — actualizar aserciones de pruebas y alcance
- modificar packages/core/src/cards/work.ts — instruir specty wait en tarjeta de confirmación de cierre
- modificar packages/core/src/cards/integration.ts — instruir specty wait en tarjeta de reintento de cierre o aceptación
- modificar packages/core/src/guard/human.ts — instruir specty wait en denegación de comandos de la persona
- modificar packages/core/test/cards/incorporation.test.ts — actualizar aserción de incorporación
- modificar packages/core/test/guard/decide.test.ts — actualizar aserción de guard
- modificar packages/core/src/agents-md.ts — incluir decisión de alcance en regla de flowBlock
- modificar packages/core/test/agents-md.test.ts — comprobar regla actualizada de flowBlock
- modificar packages/cli/test/resolve.test.ts — actualizar aserción de reintento
- modificar docs/formats.md — actualizar ejemplo de tarjeta en formato

## Tareas

- [ ] T1: Instruir specty wait en tarjetas de flujo, revisión y pruebas
  - files: packages/core/src/cards/flow.ts, packages/core/src/cards/next.ts, packages/core/src/cards/testing.ts, packages/core/test/cards/delegated.test.ts, packages/core/test/cards/testing.test.ts
  - ac: AC1, AC4
  - verify: pnpm --filter @baquia-dev/specty-core test test/cards/testing.test.ts test/cards/delegated.test.ts
- [ ] T2: Instruir specty wait en tarjetas de cierre, reintento y denegación de guard
  - files: packages/core/src/cards/work.ts, packages/core/src/cards/integration.ts, packages/core/src/guard/human.ts, packages/core/test/cards/incorporation.test.ts, packages/core/test/guard/decide.test.ts
  - ac: AC1, AC2, AC4
  - verify: pnpm --filter @baquia-dev/specty-core test test/cards/incorporation.test.ts test/guard/decide.test.ts
- [ ] T3: Incluir decisión de alcance en regla flowBlock de AGENTS.md
  - files: packages/core/src/agents-md.ts, packages/core/test/agents-md.test.ts
  - ac: AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-core test test/agents-md.test.ts
- [ ] T4: Actualizar documentación y prueba de integración de CLI
  - files: packages/cli/test/resolve.test.ts, docs/formats.md
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty test test/resolve.test.ts
