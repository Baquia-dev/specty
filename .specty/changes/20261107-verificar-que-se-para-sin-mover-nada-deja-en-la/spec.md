---
kind: standard
---

# «Verificar» que se para sin mover nada deja en la UI lo que la paró

## Objetivo

Cuando «Verificar» de la UI incorpora main antes de verificar y la incorporación se para sin mover nada (cambios sin commit que el merge cambiaría, una configuración fusionada no válida, otro proceso con el cambio bloqueado o el agente que aún resuelve una incorporación anterior), el motivo solo sale en la salida en vivo, que termina enseguida y desaparece: la sección se queda con el resultado anterior, la persona no ve por qué no hay uno nuevo, y solo «Aceptar» lo vuelve a decir. Con este cambio, el servidor conserva esa ejecución, marcada como parada (`stopped`), hasta que la persona vuelve a pulsar «Verificar», y la sección «Verificación completa» la muestra con su salida mientras el cambio sigue en aceptación y no hay un resultado más nuevo.

## Fuera de alcance

- La incorporación que deja el merge al agente (conflictos o verificación en rojo): el cambio pasa a esperarlo y la bandeja lo dice, como hoy.
- Conservar la parada al reiniciar el servidor: vive en su memoria, como la ejecución en curso.
- La verificación sin merge, que siempre anota su resultado, y «Aceptar», que ya responde con el motivo.

## Supuestos

- A1: La parada vive en la memoria del servidor (`changeRuns`), no en la auditoría: no es un resultado de la verificación, así que formats.md no gana un evento. `GET /api/changes/<id>/run` y el último evento `run` la dan con `stopped: true` cuando no corre otra ejecución del cambio, y la siguiente que empieza la quita.
  - impacto: medio
- A2: Cuenta como parada la incorporación que termina sin el merge hecho y sin dejarlo al agente (el cambio sigue sin `integration`), con algo que decir: lo que devuelve `mergedVerification` con `stopped`. Una que encuentra el cambio ya fuera de aceptación no dice nada y termina como hoy.
  - impacto: medio
- A3: La UI no cuenta una ejecución parada como en curso: el bloque en vivo no sale, «Ejecutar de nuevo» sigue disponible y «Aceptar resultado» dice el resultado anterior. La sección la muestra solo en aceptación y si no hay un resultado posterior a su inicio.
  - impacto: medio
- A4: Los textos nuevos de la sección van en español y en inglés en su componente, como los demás de la UI (`t()`).
  - impacto: bajo
- A5: `server/runs.ts` pasa del aviso de tamaño (306 líneas de código), así que antes de crecer su salida en vivo (`LiveRun`, `Part` y `liveRun`) sale a su propio módulo, `server/run-output.ts`, sin cambiar lo que hace.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO la incorporación de «Verificar» se para sin mover nada (hay cambios sin commit que el merge cambiaría, por ejemplo) ENTONCES su ejecución termina con `stopped` y el motivo en su salida, el servidor la sigue dando así hasta que la persona vuelve a pulsar «Verificar», y esa nueva ejecución ya no la lleva.
- AC2: CUANDO la incorporación de «Verificar» hace el merge, o lo deja al agente ENTONCES su ejecución termina como hoy, sin quedarse.
- AC3: CUANDO la sección «Verificación completa» recibe una ejecución parada con el cambio en aceptación ENTONCES muestra que se paró sin resultado, con su salida, sin el bloque en vivo y con «Ejecutar de nuevo» disponible, y «Aceptar resultado» no dice que está corriendo; CUANDO hay un resultado posterior a su inicio ENTONCES ya no la muestra.

## Diseño

- `server/run-output.ts` (nuevo): `KEPT`, `EVERY`, `Going`, `LiveRun`, `Part` y `liveRun`, tal como estaban en `runs.ts`; `liveRun` recibe solo lo que usa (`going` y `heard`).
- `server/merged-run.ts`: `mergedVerification` devuelve sus líneas y si se paró sin mover nada: la espera de `pendingIntegration`, el bloqueo ocupado, o un `mergeTarget` que no hizo el merge y tras el que el cambio no tiene `integration`.
- `server/runs.ts`: `Run` gana `stopped?: true`. `runMerged`, si la incorporación se paró, guarda la ejecución con `stopped` (`stops`) y la oye como última, sin `undefined`. `current` la da tras la que corre y la de una tarea; `started` la borra al lanzar otra.
- UI: `RunRecord.stopped` (`data/progress.ts`), validado en `isRun`. `FullVerification` separa la ejecución en vivo de la parada y muestra esta con su hora y su salida; `fullStateOf` no cuenta una parada como en curso.

## Archivos

- crear packages/cli/src/server/run-output.ts — la salida en vivo de una ejecución, fuera de `runs.ts`
- modificar packages/cli/src/server/runs.ts — usa `run-output.ts`; conserva la ejecución parada de la incorporación
- modificar packages/cli/src/server/merged-run.ts — dice si la incorporación se paró sin mover nada
- modificar packages/cli/test/server/verify-merge.test.ts — la incorporación parada se conserva hasta el siguiente «Verificar»
- modificar packages/ui/src/data/progress.ts — `RunRecord.stopped`
- modificar packages/ui/src/data/server-answers.ts — `isRun` valida `stopped`
- modificar packages/ui/src/acceptance/full-verification.ts — muestra la ejecución parada
- modificar packages/ui/src/acceptance/result-dialogs.ts — una ejecución parada no está corriendo
- modificar packages/ui/src/acceptance/full-verification.test.ts — la sección muestra la ejecución parada, y `fullStateOf` no la cuenta como en curso
- modificar docs/ui.md — la sección conserva lo que paró «Verificar»
- modificar docs/ARCHITECTURE.md — «Verificación completa desde la UI»: la ejecución parada

## Tareas

- [x] T1: La salida en vivo de una ejecución pasa a su propio módulo
  - files: packages/cli/src/server/runs.ts, packages/cli/src/server/run-output.ts
  - ac: —
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server/runs.test.ts test/server/runs-turn.test.ts test/server/live.test.ts test/server/verify-merge.test.ts && pnpm lint
  - type: refactor
- [ ] T2: El servidor conserva la incorporación de «Verificar» que se para sin mover nada
  - files: packages/cli/src/server/runs.ts, packages/cli/src/server/merged-run.ts, packages/cli/test/server/verify-merge.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/server/verify-merge.test.ts test/server/runs.test.ts && pnpm lint
  - type: fix
- [ ] T3: La sección «Verificación completa» muestra la ejecución parada
  - files: packages/ui/src/data/progress.ts, packages/ui/src/data/server-answers.ts, packages/ui/src/acceptance/full-verification.ts, packages/ui/src/acceptance/result-dialogs.ts, packages/ui/src/acceptance/full-verification.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty-ui exec vitest run src/acceptance/full-verification.test.ts src/acceptance/acceptance-actions.test.ts && pnpm typecheck && pnpm lint
  - type: fix
- [ ] T4: La documentación cuenta la ejecución parada
  - files: docs/ui.md, docs/ARCHITECTURE.md
  - ac: AC1, AC3
  - verify: grep -q 'se paró sin resultado' docs/ui.md && grep -q 'ejecución parada' docs/ARCHITECTURE.md
  - type: docs

## Riesgos

- R1: Una parada que ya no vale (la persona hizo el commit y aceptó desde la terminal) seguiría a la vista. Mitigación: la sección solo la muestra en aceptación y sin un resultado posterior, con su hora; y «Ejecutar de nuevo» la quita.
- R2: Otro consumidor de las ejecuciones la tomaría por una en curso. Mitigación: solo la verificación completa de un cambio puede pararse así, y sus dos consumidores en la UI (`FullVerification` y `fullStateOf`) la distinguen; Progreso solo mira las de cada tarea.
