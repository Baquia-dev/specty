---
kind: standard
epic: 20261107-verificacion-sin-repetir
slice: C4
---

# En modo delegado, un cambio normal con su cierre enviado se acepta y cierra en un solo turno

## Objetivo

En modo delegado, un cambio normal se acepta y se cierra en dos pasos. Entre el `accept` y el `close`, main avanza en 22 de 87 cambios, y el cierre vuelve a incorporarlo y a verificar (100 min). Con este cambio, el agente escribe el cierre en aceptación y lo envía con `specty propose`. Después, su `accept` incorpora main, verifica una vez, acepta, archiva y aterriza en un solo turno, sin `specty close`. Sin modo delegado, o cuando decide la persona, todo sigue como hoy.

## Fuera de alcance

- Las épicas y los cambios `quick`: la épica sigue aceptándose y cerrándose en dos pasos, y el rápido ya cierra al aceptar en un turno (corte C2).
- Mantener el turno mientras una persona responde, en la terminal o en la UI.
- «Verificar» de la UI y `specty integrate` (cortes C3 y C1), y `packages/cli/src/server/runs.ts`.
- Que la UI muestre el cierre enviado en aceptación o cambie sus acciones.
- Mostrar en aceptación las observaciones de la revisión que el cierre no cita: siguen saliendo en la fase `closing`, y al archivar pasan a la memoria, como hoy.
- Cambiar cómo `close` cierra un cambio que ya está en `closing`.

## Supuestos

- A1: «Modo delegado» quiere decir `session.delegated` (`specty delegate on`) con el agente como actor del `accept` (`session.actor === "agent"` tras `humanChange`). Es lo que ya distingue `accept` para verificar siempre, y C2 para el turno. La persona, en la terminal o en la UI, es `actor: "human"` aunque el modo esté activo, y acepta como hoy.
  - impacto: alto
- A2: Escribir el cierre en aceptación vale para los cambios con una fase de cierre propia, `standard` y `spike`. No vale para un `quick`, cuyo cierre es el resumen de sus tareas, ni para una épica. Lo decide en un solo sitio `closingInAcceptance(kind, delegated)`, en `core/flow/phases.ts`, y lo leen el guard, `propose` y la tarjeta. `accept` no lo necesita: en aceptación, solo ese `propose` anota `closingSubmittedAt`.
  - impacto: alto
- A3: Con el modo delegado activo, la spec de esos cambios en aceptación es `closing-only`, como en `closing`. `phasePermissions` recibe si se aplica `closingInAcceptance`, y el guard deja escribir `spec.md`, pero no borrarla. Que solo cambie la sección Cierre lo comprueba `propose`, con la misma regla que en `closing` (`closing-outside`, frente a la revisión aprobada). Sin modo delegado, la spec sigue bloqueada en aceptación.
  - impacto: alto
- A4: `propose` en aceptación delegada valida la spec como un cierre (la fase `closing` de `ValidationContext`), anota `closingSubmittedAt` y `spec.proposed` y no cambia de fase. Para eso la máquina admite `propose` desde `acceptance` y deja el cambio en `acceptance`. Su tarjeta dice «Cierre válido.», y su SIGUIENTE es el de la tarjeta de aceptación con el cierre enviado, que pide `specty accept`. El cierre se puede reenviar hasta el `accept`. Sin modo delegado, `propose` en aceptación responde como hoy, que en esa fase no hay nada que proponer.
  - impacto: alto
- A5: En modo delegado, el `accept` del agente de un cambio con el cierre enviado corre entero en el turno de aterrizaje (`closingTurn`), como el rápido de C2. Incorpora main si avanzó, verifica una vez y anota `change.accepted`. En el mismo turno sigue por el camino de `close` (`closeOnTurn`): archiva con `change.closed`, cosecha la memoria del cierre, hace el commit y aterriza. Su tarjeta dice «Cambio aceptado, cerrado y archivado», el texto que ya usa el rápido (`quickClosedLine`).
  - impacto: alto
- A6: Si la verificación falla, `accept` se detiene antes de aceptar, como hoy en modo delegado: el cambio sigue en aceptación con su cierre enviado, y nada se archiva ni aterriza. Si lo que falla es el cierre, ya aceptado (por ejemplo, la carpeta principal tiene cambios sin commit), el cambio queda en `closing` con su cierre enviado, y `specty close` lo termina, como hoy.
- A7: Sin el cierre enviado, el `accept` del agente acepta como hoy y deja el cambio en `closing`. El `accept` de la persona también lo deja en `closing`, con o sin cierre enviado y con o sin modo delegado. Si el cierre ya estaba enviado, `close` lo cierra sin redactarlo otra vez.
  - impacto: medio
- A8: Un ajuste pedido con el cierre enviado en aceptación lo descarta. En `adjusting` la spec no admite la sección Cierre (la validación de hoy lo rechaza), así que el agente la quita, y la propuesta del ajuste borra `closingSubmittedAt`: `propose` solo lo conserva cuando envía un cierre. Al volver a aceptación, la tarjeta pide escribirlo otra vez.
  - impacto: medio
- A9: En aceptación delegada, la tarjeta de `next` de esos cambios sin el cierre enviado añade «CÓMO CERRAR», con las mismas líneas que la de `closing`: las secciones y los hallazgos de las tareas. Pide escribir el cierre, enviarlo con `specty propose` y después ejecutar `specty accept`. Con el cierre enviado, pide `specty accept` y recuerda que se puede reenviar. Si se recomienda una revisión independiente, va antes, como hoy. Las líneas de «CÓMO CERRAR» pasan de `cards/work.ts` a `cards/acceptance.ts`, que ya comparte las suyas con las tarjetas de tareas, y `closingCard` las toma de ahí.
- A10: Todo texto nuevo o cambiado está en español y en inglés, en `packages/core/src/cards/`.
- A11: Con este corte, `accept.ts` pasaría del aviso de tamaño (unas 297 líneas de código de 300). Por eso el aceptar-que-cierra va a `flow/closing-turn.ts`, junto a `closeOnTurn`, con una responsabilidad propia: cerrar en el turno de aterrizaje. Ahí van `closingTurn`, el cierre del rápido y el del cambio con su cierre enviado, sin cambiar lo que hacen hoy `close` y el `accept` rápido. Lo llaman `commands/accept.ts` y `commands/finish.ts`.

## Criterios de aceptación

- AC1: CUANDO el modo delegado está activo y un cambio normal está en aceptación sin cierre enviado ENTONCES la tarjeta de `next` pide escribir la sección Cierre, enviarla con `specty propose` y después ejecutar `specty accept`. El guard deja al agente escribir la spec, `propose` rechaza un cambio fuera de la sección Cierre y, si solo cambia el cierre, lo envía sin cambiar de fase.
- AC2: CUANDO el modo delegado está activo, el cambio normal tiene el cierre enviado y el agente ejecuta `specty accept` mientras otra sesión espera el turno para aterrizar ENTONCES Specty incorpora main si avanzó, verifica una sola vez y con el turno, acepta, archiva y aterriza, y la otra sesión no aterriza en medio. La auditoría tiene `change.accepted` y `change.closed`, los pendientes del cierre pasan a la memoria y no hace falta `specty close`.
- AC3: CUANDO en modo delegado el agente ejecuta `specty accept` sin cierre enviado ENTONCES acepta como hoy y el cambio queda en `closing`.
- AC4: CUANDO la verificación del `accept` de AC2 falla ENTONCES el cambio sigue en aceptación con su cierre enviado, y nada se archiva ni aterriza.
- AC5: CUANDO el modo delegado está apagado ENTONCES en aceptación el guard no deja al agente escribir la spec y `propose` no envía nada. Si ya había un cierre enviado, el `accept` de la persona deja el cambio en `closing` y `close` lo cierra.
- AC6: CUANDO salen los textos nuevos o cambiados ENTONCES salen en español y en inglés.
- AC7: CUANDO en modo delegado se pide un ajuste con el cierre enviado en aceptación ENTONCES la propuesta del ajuste ya no lo anota como enviado, y de vuelta en aceptación la tarjeta pide escribirlo otra vez.

## Diseño

- Core, `flow/phases.ts`: `closingInAcceptance(kind, delegated)`, y `phasePermissions(phase, submitted, integrating, delegated)`, que en `acceptance` con `delegated` da la spec `closing-only`. `flow/machine.ts`: `propose` desde `acceptance` lleva a `acceptance`. `guard/spec.ts` y `guard/decide.ts`: `specDenial` recibe el `delegated` del contexto del guard y el `kind` del cambio. `index.ts` exporta `closingInAcceptance`.
- Tarjetas: `cards/acceptance.ts` recibe de `cards/work.ts` las líneas de «CÓMO CERRAR» (y los hallazgos de las tareas) y añade el bloque y el SIGUIENTE de la aceptación delegada; `closingCard` las importa de ahí.
- CLI, `commands/propose.ts`: en `acceptance` con `closingInAcceptance`, la propuesta es un cierre (`closing` para validar, `closingSubmittedAt`) y la fase sigue en `acceptance`; la tarjeta toma el SIGUIENTE de la de aceptación. Fuera de un cierre, la propuesta no conserva `closingSubmittedAt`.
- CLI, `flow/closing-turn.ts` (nuevo): `closingTurn`, que en modo delegado ejecuta el `accept` entero en `landingTurn` cuando el cambio es rápido o tiene el cierre enviado; `closeQuick`, que sale de `accept.ts`; `closeOnTurn`, que sale de `commands/finish.ts` y recibe, si viene de `accept`, las líneas de la aceptación; y `closeAccepted`, que con el cambio ya en `closing` sigue por `closeOnTurn` en el mismo turno. `commands/accept.ts`, tras anotar `change.accepted`, llama a `closeAccepted` si el actor es el agente y el cierre está enviado.
- Tests de core: `test/flow/machine.test.ts` (la tabla, con `propose` desde `acceptance`) y `test/closing-ahead.test.ts` (`phasePermissions`, el guard con y sin modo delegado y para `quick` y épica, y las tarjetas en español y en inglés). En la CLI, `test/closing-ahead.test.ts` (AC1, AC5 y AC7) y `test/accept-quick-turn.test.ts`, que ya simula otra sesión en la cola del turno y cuenta las verificaciones en `$(git rev-parse --git-common-dir)/runs`, con los casos de AC2 a AC4 para un cambio normal.

## Archivos

- modificar packages/core/src/flow/phases.ts — `closingInAcceptance` y la spec `closing-only` en aceptación delegada
- modificar packages/core/src/flow/machine.ts — `propose` desde `acceptance` deja el cambio en `acceptance`
- modificar packages/core/src/guard/spec.ts — `specDenial` con el modo delegado y el tipo del cambio
- modificar packages/core/src/guard/decide.ts — pasa el modo delegado del contexto a `specDenial`
- modificar packages/core/src/index.ts — exporta `closingInAcceptance`
- modificar packages/core/src/cards/acceptance.ts — «CÓMO CERRAR» compartido, y el bloque y el SIGUIENTE de la aceptación delegada
- modificar packages/core/src/cards/work.ts — `closingCard` toma de `acceptance.ts` las líneas de «CÓMO CERRAR»
- modificar packages/core/test/flow/machine.test.ts — la tabla, con `propose` desde `acceptance`
- crear packages/core/test/closing-ahead.test.ts — permisos, guard y tarjetas de la aceptación delegada, en español y en inglés
- modificar packages/cli/src/commands/propose.ts — el cierre se envía en aceptación delegada sin cambiar de fase, y fuera de un cierre no se conserva
- crear packages/cli/src/flow/closing-turn.ts — cerrar en el turno de aterrizaje: `closingTurn`, `closeQuick`, `closeOnTurn` y `closeAccepted`
- modificar packages/cli/src/commands/accept.ts — con el cierre enviado y el agente como actor, acepta y cierra en el mismo turno
- modificar packages/cli/src/commands/finish.ts — `close` usa `closeOnTurn` de `flow/closing-turn.ts`
- crear packages/cli/test/closing-ahead.test.ts — AC1, AC5 y AC7
- modificar packages/cli/test/accept-quick-turn.test.ts — AC2, AC3 y AC4 con un cambio normal
- modificar docs/ARCHITECTURE.md — §4 (la spec y `propose` en aceptación delegada) y §9 (el `accept` que cierra en un turno)
- modificar docs/formats.md — §1 (quién tiene el turno) y §3 (`closingSubmittedAt` en aceptación)

## Tareas

- [x] T1: En aceptación delegada, el guard deja escribir el cierre y la tarjeta lo pide antes de `accept`
  - files: packages/core/src/flow/phases.ts, packages/core/src/flow/machine.ts, packages/core/src/guard/spec.ts, packages/core/src/guard/decide.ts, packages/core/src/index.ts, packages/core/src/cards/acceptance.ts, packages/core/src/cards/work.ts, packages/core/test/flow/machine.test.ts, packages/core/test/closing-ahead.test.ts
  - ac: AC1, AC5, AC6
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/closing-ahead.test.ts test/flow/machine.test.ts test/cards/delegated.test.ts test/guard/decide.test.ts && pnpm lint
- [x] T2: `propose` envía el cierre en aceptación delegada sin cambiar de fase
  - files: packages/cli/src/commands/propose.ts, packages/cli/test/closing-ahead.test.ts
  - ac: AC1, AC5, AC7
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/closing-ahead.test.ts && pnpm lint
- [x] T3: En modo delegado, `accept` con el cierre enviado acepta, archiva y aterriza en un solo turno
  - files: packages/cli/src/flow/closing-turn.ts, packages/cli/src/commands/accept.ts, packages/cli/src/commands/finish.ts, packages/cli/test/accept-quick-turn.test.ts
  - ac: AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/accept-quick-turn.test.ts test/close-turn.test.ts test/close-harvest.test.ts test/closing-ahead.test.ts && pnpm typecheck && pnpm lint && pnpm knip
- [x] T4: ARCHITECTURE y formats.md cuentan el cierre enviado en aceptación delegada y el `accept` que cierra en un turno
  - files: docs/ARCHITECTURE.md, docs/formats.md
  - ac: —
  - verify: grep -q 'en modo delegado, solo la sección Cierre' docs/ARCHITECTURE.md && grep -q 'en aceptación, en modo delegado' docs/formats.md
  - type: docs

## Riesgos

- R1: Mantener el turno durante todo el aceptar-que-cierra bloquea a las demás sesiones más tiempo. Mitigación: solo se añaden el archivado y el aterrizaje, que tardan segundos, porque la verificación ya tenía el turno, y solo en modo delegado, donde nadie espera una respuesta.
- R2: Un cierre escrito antes de aceptar puede no recoger lo que trae la incorporación de main. Mitigación: el agente puede reenviarlo con `propose` hasta el `accept`, y la incorporación aparece en las líneas del aterrizaje, como hoy.
- R3: Abrir la spec en aceptación delegada podría dejar al agente tocar otras secciones. Mitigación: es la misma regla `closing-only` que hoy rige en `closing`, y `propose` rechaza cualquier cambio fuera del cierre; los tests cubren la aceptación con y sin modo delegado, y para `quick` y épica.
- R4: Mover `closeOnTurn` y `closeQuick` a `flow/` podría cambiar sin querer lo que hacen `close` y el `accept` rápido. Mitigación: se mueven sin cambiar su cuerpo, y la verificación de T3 ejecuta también los tests del `accept` rápido, `close-turn` y `close-harvest`.
