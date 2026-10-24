---
kind: standard
---

# En modo delegado, decidir da la tarjeta siguiente

## Objetivo

En modo delegado, el agente toma las decisiones de la persona (aprobar, decidir el alcance, aceptar), y cada una termina con «sigue con `specty next`»: un comando que solo trae la tarjeta siguiente. La medición de fricción lo cuenta dos veces en cada cambio standard. Ahora, cuando la decisión la toma el agente, su salida ya trae lo que diría `next`, con la decisión delante. Cuando decide la persona en su terminal, nada cambia: el agente sigue cuando ella se lo dice.

## Fuera de alcance

- Las salidas de la persona y de la UI.
- `close` y el `accept` de un cambio quick, que ya terminan el cambio.

## Supuestos

- A1: Ejecutar `next` justo después de la decisión es lo mismo que haría el agente con el SIGUIENTE de hoy: activa la siguiente tarea o pasa una épica a aceptación, y no decide nada por la persona.

## Criterios de aceptación

- AC1: CUANDO el agente, en modo delegado, aprueba la spec, rechaza supuestos, decide una solicitud de alcance o acepta el resultado ENTONCES la salida lleva la línea de la decisión y, debajo, la tarjeta que daría `specty next`, con su SIGUIENTE.
- AC2: CUANDO decide la persona en su terminal ENTONCES la salida es la de hasta ahora.
- AC3: CUANDO el recorrido de fricción hace un cambio standard en modo delegado ENTONCES necesita dos comandos menos del agente, y ARCHITECTURE §16 lo refleja.

## Archivos

- modificar packages/cli/src/commands/next.ts — `thenNext`: la decisión y lo que dice `next`
- modificar packages/cli/src/commands/approve.ts — aprobar y rechazar supuestos siguen
- modificar packages/cli/src/commands/scope-decision.ts — decidir el alcance sigue
- modificar packages/cli/src/commands/accept.ts — aceptar sigue
- modificar packages/cli/test/delegate.test.ts — tras decidir en modo delegado, la salida trae la tarjeta siguiente
- modificar packages/cli/test/friction.test.ts — la línea base del modo delegado, con dos comandos menos
- modificar docs/ARCHITECTURE.md — §16 y el modo delegado

## Tareas

- [x] T1: En modo delegado, cada decisión trae la tarjeta siguiente
  - files: packages/cli/src/commands/next.ts, packages/cli/src/commands/approve.ts, packages/cli/src/commands/scope-decision.ts, packages/cli/src/commands/accept.ts, packages/cli/test/delegate.test.ts, packages/cli/test/friction.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3
  - verify: pnpm check
