---
kind: standard
---

# Modo delegado: guard y tarjetas

## Objetivo

Primer paso del modo delegado que pidió el usuario: un interruptor con el que la persona deja que su agente apruebe, acepte, cierre y cancele por ella, con una advertencia al activarlo. Este cambio prepara el core: el guard deja pasar esas acciones cuando la delegación está activa (salvo `specty delegate`, que siempre es de la persona), las tarjetas le dicen al agente que las ejecute él en vez de pedírselas al usuario, y queda escrito el texto de la advertencia. El interruptor de la CLI llega en el cambio siguiente; hasta entonces nadie activa la delegación y nada cambia.

## Fuera de alcance

- El interruptor (`specty delegate on|off`), dónde se guarda y que la CLI ejecute sin TTY las acciones de la persona cuando está activo: es el cambio siguiente, «Modo delegado: interruptor en la CLI».
- La máquina de estados: las transiciones que conceden permisos siguen siendo de la persona; con la delegación, la CLI actuará en su nombre.
- Un interruptor en la UI: llegará cuando la UI tenga su servidor local (§15).
- Una delegación que caduque sola o que cubra solo algunas acciones.

## Supuestos

- A1: Solo la persona activa y desactiva el modo delegado, desde su terminal: será `specty delegate on|off`, con esta advertencia y una confirmación. El guard bloquea siempre `specty delegate` al agente, también con la delegación activa, y no habrá variable de entorno, flag ni campo de `config.yaml` que lo active.
  - impacto: alto
- A2: La delegación cubre todas las acciones de la persona: aprobar la spec (confirmando los supuestos de impacto alto pendientes), aprobar o rechazar ampliaciones de alcance (también en rutas sensibles), aceptar, cerrar e incorporar a la rama principal, y cancelar. La advertencia lo enumera así.
  - impacto: alto
- A3: El interruptor valdrá para el clon entero, con todas sus worktrees, y no se versiona: no llega a otros clones ni al equipo, y sigue activo hasta que la persona lo desactive. La advertencia lo dice.
  - impacto: alto
- A4: Con la delegación, `accept` ejecutará antes la verificación completa y no aceptará si falla, así que la advertencia dice que el agente acepta los resultados que la pasan.
- A5: La auditoría registrará cada acción delegada como del agente, con una marca de delegación (cambio siguiente); la advertencia lo anuncia.

## Criterios de aceptación

- AC1: CUANDO el guard recibe `specty approve`, `accept`, `close`, `cancel` o `reject` con la delegación activa (`delegated: true` en su contexto) ENTONCES lo deja pasar; sin delegación lo bloquea como hoy, con el mismo mensaje.
- AC2: CUANDO el guard recibe `specty delegate`, con o sin delegación, ENTONCES lo bloquea con el mensaje de las acciones de la persona.
- AC3: CUANDO la delegación está activa en el contexto de las tarjetas ENTONCES el `SIGUIENTE:` que hoy pide al usuario una acción le dice al agente que la ejecute él: la spec propuesta y la fase de revisión (`approve`), una solicitud de alcance (`approve --scope <S>`), la aceptación (`accept`) y el cierre propuesto o enviado (`close`); sin delegación, esos textos no cambian.
- AC4: CUANDO la delegación está activa ENTONCES la tarjeta de una decisión registrada termina con «sigue con `specty next`» en vez de pedir a la persona que se lo diga al agente, y la tarjeta de estado añade un bloque MODO DELEGADO que dice cómo desactivarlo.
- AC5: CUANDO la CLI pide la advertencia de activación ENTONCES esta enumera lo que el agente podrá hacer (A2, A4), dice que Specty deja de garantizar que una persona revise cada spec y cada resultado, que la auditoría lo registrará como del agente por delegación y que vale para el clon y sus worktrees hasta `specty delegate off`; y la tarjeta del interruptor confirma la activación o la desactivación. En español y en inglés.
- AC6: CUANDO se genera el bloque de flujo de AGENTS.md ENTONCES la línea de aprobar, aceptar y cerrar dice que el agente solo los ejecuta si `SIGUIENTE:` se lo pide (modo delegado), y el bloque sigue teniendo 8 líneas como máximo.

## Diseño

- `guard/human.ts` (nuevo): `HUMAN_COMMANDS` se mueve aquí desde `decide.ts`, que lo reexporta, junto a `delegate`, que ninguna delegación abre; `humanDenial(specty, ctx)` devuelve el motivo y el siguiente paso, o nada. `decide.ts` está en 295 de 300 líneas y así gana margen.
- `delegated?: boolean` en `GuardContext` y en `CardContext`: la persona delegó sus decisiones. Es opcional, así que la CLI compila sin cambios y, hasta el cambio siguiente, nadie lo activa.
- Cada `SIGUIENTE:` afectado elige su texto con `ctx.delegated`. En la tarjeta de decisión, «sigue con `specty next`» vale tanto si la lee el agente como si la lee la persona.
- `delegationWarning(ctx)` (las líneas de la advertencia) y `delegationCard(on, ctx)` viven en `cards/human.ts` y se exportan en `index.ts`.
- ADR 0010: el modo delegado, qué cambia respecto a la 0006 y por qué solo lo activa la persona. ARCHITECTURE §4 (invariante) y §10 (modelo de confianza) remiten a ella, y formats.md §8 recoge la línea nueva del bloque de flujo.

## Archivos

- crear packages/core/src/guard/human.ts — las acciones de la persona, `delegate` y la delegación
- modificar packages/core/src/guard/decide.ts — `delegated` en el contexto; usa `guard/human.ts`
- modificar packages/core/test/guard/decide.test.ts — con y sin delegación, y `delegate`
- crear docs/decisions/0010-modo-delegado.md — la decisión y su relación con la 0006
- modificar docs/ARCHITECTURE.md — §4 invariante y §10 modelo de confianza
- modificar packages/core/src/cards/view.ts — `delegated` en el contexto de las tarjetas
- modificar packages/core/src/cards/flow.ts — spec propuesta, cierre propuesto y solicitud de alcance
- modificar packages/core/src/cards/next.ts — fase de revisión
- modificar packages/core/src/cards/work.ts — aceptación y cierre enviado
- crear packages/core/test/cards/delegated.test.ts — tarjetas con y sin delegación, en los dos idiomas
- modificar packages/core/src/cards/human.ts — advertencia, tarjeta del interruptor, decisión y estado
- modificar packages/core/src/agents-md.ts — la línea de aprobar, aceptar y cerrar
- modificar packages/core/src/index.ts — exporta la advertencia y la tarjeta del interruptor
- modificar docs/formats.md — §8: la línea nueva del bloque de flujo

## Tareas

- [x] T1: El guard respeta la delegación
  - files: packages/core/src/guard/human.ts, packages/core/src/guard/decide.ts, packages/core/test/guard/decide.test.ts, docs/decisions/0010-modo-delegado.md, docs/ARCHITECTURE.md
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/guard/decide.test.ts
- [x] T2: Las tarjetas del agente con la delegación
  - files: packages/core/src/cards/view.ts, packages/core/src/cards/flow.ts, packages/core/src/cards/next.ts, packages/core/src/cards/work.ts, packages/core/test/cards/delegated.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/delegated.test.ts
- [x] T3: La advertencia, las tarjetas de la persona y AGENTS.md
  - files: packages/core/src/cards/human.ts, packages/core/src/agents-md.ts, packages/core/src/index.ts, packages/core/test/cards/delegated.test.ts, docs/formats.md
  - ac: AC4, AC5, AC6
  - verify: pnpm check

## Riesgos

- R1: Un `SIGUIENTE:` mal elegido haría que el agente actuara por la persona sin delegación, o que se parara teniéndola — cada tarjeta afectada se prueba con y sin `delegated`, y sin él los textos no cambian.
- R2: Las dos incorporaciones en curso también tocan el guard y las tarjetas, así que puede haber conflictos al cerrar — se resuelven en este cambio al incorporarse (§9), y sacar las acciones de la persona a `guard/human.ts` reduce las líneas en común.
