---
kind: standard
---

# Las aceptaciones en paralelo no repiten la verificación por un aterrizaje ajeno

## Objetivo

Hoy, con varias aceptaciones en paralelo (los cortes de una épica, en modo delegado), la que choca con la rama principal suelta el turno de aterrizaje y deja el merge al agente. Mientras lo resuelve, y mientras `specty integrate` espera el turno para verificarlo, otras aterrizan: integrate verifica un merge que ya quedó viejo, y el `accept` siguiente vuelve a incorporar la rama principal y a verificar. En la épica 20261107-flujo-configurable-en-la-ui, C15 verificó así cinco veces, unos 20 minutos por vuelta contando la espera. Con este cambio, `specty integrate` toma el turno de aterrizaje antes de verificar. Si la rama principal avanzó, incorpora antes lo nuevo y verifica una sola vez, con todo. En modo delegado sigue además, en ese mismo turno, con el `accept` o el `close` que dejó la incorporación: el cambio aterriza sin que otro aterrice entre medias y sin verificar otra vez. Es la mejora P334 de la memoria.

## Fuera de alcance

- Verificar solo las unidades que tocan los commits nuevos de la rama principal. `verify.units` ya reutiliza las unidades cuyos archivos no cambiaron, y en la épica cada aterrizaje tocaba el core y la UI, de los que dependen todas las unidades: no habría ahorrado ninguna. Bajar de la unidad a los tests afectados por cada archivo es otro cambio.
- Reservar el turno de aterrizaje entre dos comandos, por ejemplo mientras el agente resuelve los conflictos. Un turno sin un proceso vivo que lo tenga pararía a las demás sesiones si el agente abandona, y todas esperarían mientras resuelve.
- Las decisiones de la persona fuera del modo delegado. Entre `specty integrate` y su `accept` o `close` pasa el tiempo que ella tarde, y nadie tiene el turno mientras responde (ARCHITECTURE §9). Si otra sesión aterriza entre medias, su comando vuelve a incorporar y a verificar, como hoy.
- El `accept` delegado de un cambio sin el cierre enviado: acepta sin aterrizar, y su `close` incorpora y verifica de nuevo si la rama principal avanzó, como hoy.
- El reintento del aterrizaje (`internal.retries.landing`) y la cola del turno (`store/turn-queue.ts`), que no cambian. No hay ajustes nuevos.
- La mejora P321 (los tests bloqueados que cambia `specty integrate`), que va en otro cambio.

## Supuestos

- A1: Las vueltas las causan las verificaciones de `specty integrate` sobre una rama principal vieja, no la cola del turno. En la auditoría de C15 (20261107-los-limites-de-lo-que-muestran-los-comandos-y), cada `integration.started` llega con un commit de main distinto, y tras el último `integration.resolved` hay otro `change.verified` antes de `change.accepted`: el del `accept` que volvió a incorporar main. Una aceptación delegada que no choca ya verifica una vez y aterriza en el mismo turno (`closingTurn`).
  - impacto: alto
- A2: `specty integrate` puede tomar el turno de aterrizaje (`landingTurn`) antes de mirar si la rama principal avanzó, y soltarlo al terminar. Es el mismo turno que ya toma para verificar (`runFull`), así que lo tiene además solo lo que tarda un commit y, si main avanzó, un merge. Los marcadores de conflicto y los cambios fuera de la incorporación se comprueban antes, sin turno, para fallar pronto.
  - impacto: alto
- A3: Si la rama principal avanzó, el commit de lo que resolvió el agente puede hacerse sin verificar. Queda en la rama del cambio, y la rama principal solo avanza hasta el merge siguiente, que se verifica o no lo necesita por las razones de hoy (una épica, un cambio sin código o con todas sus unidades ya pasadas). Las tareas ya hacen en la rama del cambio commits que no pasan la verificación completa.
  - impacto: alto
- A4: La rama principal avanzó cuando ya no es antecesora de `MERGE_HEAD`, el commit que se está fusionando (`contains` de `flow/integrate.ts`).
  - impacto: bajo
- A5: En modo delegado, que `specty integrate` siga con `accept` o `close` no da al agente nada que no tenga: su salida ya le pide ejecutarlo él (`runAgainNext`). Solo sigue con el agente (actor `agent`) y el modo delegado activo; la persona en su terminal no.
  - impacto: medio
- A6: El comando que sigue se le pasa a `integrate` desde donde se registra (`commands/agent-commands.ts`), en lugar de importar `accept` y `close` en `commands/integrate.ts`. Los dos importan `pendingIntegration` de ese archivo, y el import haría un ciclo.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO la rama principal avanzó mientras el agente resolvía una incorporación y el agente la termina con `specty integrate` ENTONCES no verifica el merge que quedó viejo: hace el commit de lo que resolvió, incorpora lo nuevo de la rama principal y verifica una sola vez, con todo lo de la rama principal, y lo anota como `change.verified`. La salida dice que la rama principal avanzó y se incorporó otra vez, y la rama principal no se mueve.
- AC2: CUANDO lo nuevo de la rama principal choca con lo que el agente resolvió ENTONCES `specty integrate` hace el commit de lo resuelto, no ejecuta ninguna verificación y deja la nueva incorporación para el agente, con sus conflictos, como la dejaría `accept` o `close`.
- AC3: CUANDO, en modo delegado, el agente termina con `specty integrate` la incorporación que dejó un `accept` con el cierre enviado o un `close` ENTONCES integrate sigue con ese comando sin soltar el turno de aterrizaje: el cambio se acepta (si era `accept`), se cierra y aterriza sin otra verificación, y otra sesión que esperaba el turno aterriza después, encima del cambio. La salida que le pide al agente resolver la incorporación le dice que `specty integrate` seguirá con ese comando, en lugar de pedirle repetirlo.
- AC4: CUANDO no está en modo delegado ENTONCES `specty integrate` no acepta ni cierra: tras el commit pide a la persona que repita `accept` o `close`, como hoy, y ese `accept` no repite la verificación que integrate pasó con el mismo código.
- AC5: CUANDO se leen `docs/ARCHITECTURE.md` (la incorporación, el turno de la verificación completa y las unidades) y `docs/formats.md` (`integration.resolved`) ENTONCES explican que `specty integrate` toma el turno de aterrizaje, que incorpora otra vez la rama principal si avanzó y que en modo delegado sigue con `accept` o `close`.
  - test: manual

## Diseño

Opción elegida: ordenar los aterrizajes con el turno que ya existe, en lugar de verificar menos. La cola del turno ya ordena las aceptaciones que no chocan. Lo que se pierde es la verificación que corre sobre una rama principal vieja, y la que repite el `accept` cuando otro aterrizó entre `specty integrate` y él. Con integrate en el turno y, en modo delegado, siguiendo con el comando, las dos desaparecen. Main nunca recibe código sin verificar: solo avanza por fast-forward hasta el merge verificado.

- Core, `cards/integration.ts` (T1): `resolveIncorporationNext`, en modo delegado, pide resolverla y terminarla con `specty integrate`, que sigue con `again`, sin «vuelve a ejecutar». Una línea nueva, `mergedAgainLine(target, lang)`: la rama principal avanzó mientras se resolvía y se incorporó otra vez antes de verificar. Se exporta en `cards/index.ts`.
- CLI, `commands/integrate.ts` (T2): `integrate(session, resume)`, donde `resume(again)` ejecuta `accept` o `close`. `mergeProblem` deja de verificar: comprueba, sin turno, los marcadores y los cambios fuera de la incorporación. Después, en `landingTurn(session, integrationOf(…), …)`:
  1. Si la rama principal avanzó, el commit de lo resuelto (`integration.resolved`, como hoy) y `mergeTarget(session, plan, change, again, closingFirst(session, change))`. Si no sale bien, su salida: otra incorporación para el agente, o la negativa. Si sale bien, sus líneas, tras la de resuelta y `mergedAgainLine`.
  2. Si no avanzó, la verificación de hoy (`failedVerification`) y el commit.
  3. Con `session.actor === "agent"` y `session.delegated`, `resume(again)` en el mismo turno, con las líneas de integrate delante de sus bloques. Sin ellos, la tarjeta de hoy, con `runAgainNext`.
- CLI, `commands/agent-commands.ts` (T2): registra `integrate` con un `resume` que llama a `accept(session)` o a `close(session)`.
- Tests: `cli/test/integrate-landing.test.ts`, nuevo (AC1 a AC4), con una verificación que anota en `.git/runs` si el código que verifica tiene lo nuevo de main. Para AC3, otra sesión que espera el turno para aterrizar, como en `accept-quick-turn.test.ts`. En `cli/test/delegated-integration.test.ts`, integrate ya cierra el cambio en modo delegado y cambia la salida que pide resolver. `core/test/cards/incorporation.test.ts` comprueba los textos.

## Archivos

- modificar packages/core/src/cards/integration.ts — la salida delegada que pide resolver y la línea de la rama principal que avanzó
- modificar packages/core/src/cards/index.ts — exporta la línea nueva
- modificar packages/core/test/cards/incorporation.test.ts — los textos
- modificar packages/cli/src/commands/integrate.ts — el turno de aterrizaje, la nueva incorporación y el comando que sigue
- modificar packages/cli/src/commands/agent-commands.ts — le pasa a integrate el comando que sigue
- crear packages/cli/test/integrate-landing.test.ts — AC1 a AC4
- modificar packages/cli/test/delegated-integration.test.ts — integrate cierra en modo delegado
- modificar docs/ARCHITECTURE.md — la incorporación, el turno y las unidades
- modificar docs/formats.md — `integration.resolved`

## Tareas

- [x] T1: Los textos de la incorporación que sigue sola
  - files: packages/core/src/cards/integration.ts, packages/core/src/cards/index.ts, packages/core/test/cards/incorporation.test.ts
  - ac: AC1, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/incorporation.test.ts
- [x] T2: `specty integrate` en el turno de aterrizaje
  - files: packages/cli/src/commands/integrate.ts, packages/cli/src/commands/agent-commands.ts, packages/cli/test/integrate-landing.test.ts, packages/cli/test/delegated-integration.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/integrate-landing.test.ts test/delegated-integration.test.ts test/integrate.test.ts test/integrate-turn.test.ts test/integrate-units.test.ts test/close-shared-file.test.ts && pnpm typecheck
- [x] T3: La documentación de la incorporación en el turno de aterrizaje
  - files: docs/ARCHITECTURE.md, docs/formats.md
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/capabilities.test.ts
  - type: docs

## Riesgos

- R1: En modo delegado, integrate tiene el turno también mientras archiva y aterriza (segundos, más `git.afterLanding`), y las demás sesiones esperan eso — es lo mismo que ya esperan con el `accept` delegado que cierra, y mucho menos que una verificación repetida.
- R2: Con todas las unidades ya pasadas, integrate antes no pedía el turno y ahora sí, así que espera a la verificación de otra sesión — es raro, porque el merge resuelto suele traer código que ninguna unidad pasó; se documenta.
- R3: Si integrate deja una incorporación nueva (AC2), lo resuelto ya tiene su commit en la rama, y abortar el merge nuevo no lo deshace — es lo que se quiere: el agente no vuelve a resolver lo mismo, y la incorporación descartada se intenta de nuevo, como hoy.
