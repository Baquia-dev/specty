---
kind: standard
---

# Comando specty wait y reanudación automática tras aprobación humana

## Objetivo

Permitir que el agente detecte automáticamente cuando la persona realiza una aprobación o decisión (ya sea desde la terminal con comandos de Specty o desde la UI web), mediante el comando `specty wait`, el cual permanece en espera pasiva hasta que no quede ninguna acción humana pendiente y retorna inmediatamente con el siguiente paso, evitando que la persona tenga que regresar al chat a indicarle manualmente al agente que continúe.

## Fuera de alcance

- Modificar el protocolo de transporte SSE del servidor web o crear sockets dedicados exclusivos para agentes.
- Forzar la terminación de procesos del sistema operativo fuera del timeout del propio comando.

## Supuestos

- A1: El estado de espera humana se deriva deterministamente: un cambio espera por la persona si tiene solicitudes de alcance pendientes (`pendingScope.length > 0`) o si su fase tiene `waitingFor === "human"`.
- A2: `specty wait` es una operación de solo lectura y no adquiere el cerrojo de cambio (`withChangeLock`), de modo que no bloquea las acciones de la persona en la terminal ni en la UI.
- A3: `specty wait` admite la opción `--timeout <segundos>` (con valor por defecto de 3600 segundos) y un intervalo de sondeo pasivo configurable (por defecto 500 ms).
- A4: Si un cambio espera múltiples confirmaciones (por ejemplo, múltiples solicitudes de alcance o supuestos pendientes), `specty wait` no se desbloquea hasta que todas ellas hayan sido resueltas y el cambio pase a esperar por el agente o finalice.

## Criterios de aceptación

- AC1: CUANDO el cambio activo no espera por la persona (`waitingFor !== "human"`) ENTONCES `specty wait` retorna inmediatamente con código 0 y la tarjeta de `specty next`.
- AC2: CUANDO el cambio activo espera por una o múltiples acciones de la persona (`waitingFor === "human"`) ENTONCES `specty wait` permanece en espera pasiva y solo se desbloquea cuando no queda ninguna acción pendiente por la persona.
- AC3: CUANDO la persona aprueba, rechaza o decide en la terminal o en la UI ENTONCES `specty wait` se desbloquea de inmediato, sale con código 0 y devuelve la tarjeta de `next` actualizada.
- AC4: CUANDO transcurre el tiempo límite indicado en `--timeout` sin que la persona tome una decisión ENTONCES `specty wait` finaliza informando que el tiempo de espera expiró sin bloquear el estado.
- AC5: CUANDO se consultan las reglas de `AGENTS.md` (`flowBlock`) y `docs/ARCHITECTURE.md` ENTONCES describen el uso de `specty wait` para la reanudación reactiva del agente tras aprobaciones humanas.

## Diseño

- **Tarjetas y textos de espera (`packages/core/src/cards/wait.ts`, `packages/core/src/cards/index.ts`)**:
  - Crear `waitTimeoutCard(ctx: CardContext)` para emitir la tarjeta bilingüe cuando expira el timeout.
  - Exportar las funciones en el índice público de cards.
- **Comando `specty wait` (`packages/cli/src/commands/wait.ts`, `packages/cli/src/commands/agent-commands.ts`)**:
  - Implementar `wait(session: Session, options: WaitOptions): Promise<Output>`.
  - Evaluar periódicamente la función determinista de espera humana sobre el cambio activo.
  - Al detectar `waitingFor !== "human"`, invocar `next(session)` y retornar su salida.
  - Registrar el comando en `agentCommands` con `run(...)` (sin `withChangeLock`).
- **Reglas del agente y documentación (`packages/core/src/agents-md.ts`, `docs/ARCHITECTURE.md`)**:
  - Añadir en `flowBlock` la indicación de ejecutar `specty wait` al quedar esperando por la persona.
  - Documentar `specty wait` en la tabla de comandos de `docs/ARCHITECTURE.md` (§6).

## Archivos

- crear packages/core/src/cards/wait.ts — tarjeta de timeout para specty wait
- modificar packages/core/src/cards/index.ts — exportar tarjetas de wait
- crear packages/core/test/cards/wait.test.ts — pruebas de tarjetas de wait
- crear packages/cli/src/commands/wait.ts — comando specty wait con sondeo pasivo
- modificar packages/cli/src/commands/agent-commands.ts — registrar comando wait en la CLI
- crear packages/cli/test/wait.test.ts — pruebas de comportamiento de specty wait
- modificar packages/core/src/agents-md.ts — regla de specty wait en AGENTS.md
- modificar packages/core/test/agents-md.test.ts — prueba de regla de specty wait
- modificar docs/ARCHITECTURE.md — documentar comando specty wait

## Tareas

- [x] T1: Tarjetas y textos de espera
  - files: packages/core/src/cards/wait.ts, packages/core/src/cards/index.ts, packages/core/test/cards/wait.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/wait.test.ts
- [ ] T2: Comando specty wait y registro en CLI
  - files: packages/cli/src/commands/wait.ts, packages/cli/src/commands/agent-commands.ts, packages/cli/test/wait.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/wait.test.ts
- [ ] T3: Reglas para agentes y documentación
  - files: packages/core/src/agents-md.ts, packages/core/test/agents-md.test.ts, docs/ARCHITECTURE.md
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/agents-md.test.ts
