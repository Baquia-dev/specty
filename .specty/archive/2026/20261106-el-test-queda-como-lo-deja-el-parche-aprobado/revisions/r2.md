---
kind: standard
epic: 20261106-tests-con-codigo-y-desbloqueo-explicado
slice: C4
---

# El test queda como lo deja el parche aprobado

## Objetivo

Desde el corte C2, un desbloqueo de un test aprobado lleva el parche exacto que se hará al test, pero nada comprueba que el agente lo haga así. Con este cambio, `specty task done` aplica a la versión bloqueada de cada test desbloqueado el parche que aprobó la persona, y no completa la tarea si el test queda distinto: muestra la diferencia y dice cómo seguir. Al aprobar un desbloqueo, Specty vuelve a comprobar que su parche aún se aplica, y el agente puede pedir otro desbloqueo del mismo test si el primero no basta. Es el corte C4 de la épica `20261106-tests-con-codigo-y-desbloqueo-explicado` (AC9 y AC10 de la épica).

## Fuera de alcance

- Mostrar en la UI el parche, la evidencia o la diferencia: es el corte C3.
- Comprobar el parche en `specty check` o en la CI: solo lo comprueba `task done`, con la tarea activa.
- Cambiar qué exige `scope add` para un desbloqueo, o cómo comprueba el parche y la evidencia: sigue como en C2.
- Los tests que desbloquea un ajuste de la spec, y las solicitudes de `retro --into`: siguen como hoy.

## Supuestos

- A1: La versión bloqueada de un test es la del último commit (`git show HEAD:<ruta>`), y solo vale si su hash es el de `lockedTests`. Los tests se confirman al enviarlos y al completar cada tarea, y el agente no hace commits. Si no lo es, `task done` no completa la tarea y dice que no puede comprobar ese test.
  - impacto: alto
- A2: Cada parche se aplica igual que en C2, con `git apply --recount`, pero con `--cached` sobre un índice temporal (`GIT_INDEX_FILE`, en una carpeta temporal del sistema) con el árbol del último commit: no toca la carpeta del cambio ni su índice. Lo que deja el parche se lee de ese índice (`git show :<ruta>`, que falla si lo borra) y se compara con el archivo en disco, texto con texto.
  - impacto: alto
- A3: Cuentan los `scope.decided` aprobados con `unlock` de esa tarea, desde su último `task.started`. De cada test cuenta el último aprobado que lo desbloquea, que sustituye a los anteriores: C2 comprueba cada parche sobre la versión bloqueada, así que uno posterior ya trae el cambio completo, y aplicarlos uno tras otro, como decía la épica, fallaría cuando tocan las mismas líneas. Un test que el desbloqueo nombra y su parche no toca tiene que quedar como se bloqueó.
  - impacto: alto
- A4: Si el último desbloqueo aprobado de un test no lleva parche, porque lo creó un CLI anterior a C2, ese test no se compara (A9 de la épica).
  - impacto: bajo
- A5: La diferencia es la de `git diff --no-index` entre lo que deja el parche, en un archivo temporal, y el test en disco, desde su primer bloque `@@`: `-` es como lo deja el parche y `+`, como está. La tarjeta muestra 40 líneas por test como máximo y cuántas quedan.
  - impacto: medio
- A6: Para pedir otro desbloqueo de un test que ya desbloqueó para la tarea, `scope add` lo trata como un test bloqueado: crea la solicitud y exige el parche y la evidencia. Hoy responde que ya está en el alcance. Como C2 comprueba el parche sobre la versión bloqueada, el agente tiene que volver a dejar el test así antes de pedirlo, y la tarjeta que rechaza la tarea se lo dice.
  - impacto: alto
- A7: Al aprobar un desbloqueo con parche, antes de preguntar a la persona, Specty repite la comprobación de C2 (que el parche toca solo esos tests, que siguen como se bloquearon y que se aplica). Si falla, Specty rechaza la solicitud como actor `specty`, con el motivo en `scope.decided`, como hace con un `retro --into` cuyo preparado cambió, y no amplía el alcance. Al rechazarla la persona no se comprueba, y una solicitud sin parche se aprueba como hoy.
  - impacto: medio
- A8: `task done` lo comprueba tras el alcance de la tarea y antes de los archivos largos, `specty check` y la verificación, así que un test distinto no gasta la verificación.
  - impacto: bajo
- A9: Los textos nuevos van en una tarjeta propia, `cards/unlock-check.ts`, porque `cards/task.ts` (258 líneas) y `cards/unlock.ts` (230) se acercan al aviso de 300. El motivo de un rechazo al aprobar reutiliza los textos de C2 (`whyNot` de `cards/unlock.ts`, que se exporta como `unlockProblem`).
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO el agente completa una tarea con un test desbloqueado que no quedó exactamente como lo deja el parche aprobado ENTONCES `task done` no la completa, el test sigue desbloqueado para la tarea y la salida muestra la diferencia entre como lo deja el parche y como está, y dice que lo deje como el parche o que pida otro desbloqueo, con el comando completo.
- AC2: CUANDO el test quedó como lo deja el parche aprobado ENTONCES `task done` completa la tarea y vuelve a bloquear el test con su versión nueva, como hoy; CUANDO el parche lo borra y ya no está ENTONCES la completa y el test deja de estar bloqueado.
- AC3: CUANDO el parche aprobado borra el test y sigue en disco, o lo deja y ya no está ENTONCES `task done` no completa la tarea y dice cuál de las dos.
- AC4: CUANDO la persona aprobó para la tarea más de un desbloqueo del mismo test ENTONCES `task done` lo compara con lo que deja el último aprobado.
- AC5: CUANDO el último desbloqueo aprobado de un test no lleva parche ENTONCES `task done` no compara ese test.
- AC6: CUANDO la versión del test en el último commit no es la que bloqueó su hash ENTONCES `task done` no completa la tarea y dice que no puede comprobar ese test.
- AC7: CUANDO el agente pide desbloquear un test que ya desbloqueó para la tarea ENTONCES `scope add` crea otra solicitud, con su parche y su evidencia, que decide la persona.
- AC8: CUANDO la persona aprueba un desbloqueo cuyo test ya no está como se bloqueó, o cuyo parche ya no se aplica ENTONCES Specty rechaza la solicitud con el motivo en `scope.decided`, no amplía el alcance de la tarea y la salida dice por qué.
- AC9: CUANDO salen los textos nuevos ENTONCES salen en español y en inglés.

## Diseño

- Core, `cards/unlock-check.ts`, nuevo: `UnlockMismatch` (`different` con su `diff`, `kept`, `missing` y `unverifiable` con un `detail` opcional), `unlockMismatchCard(mismatches, task, header, ctx)` y, para la aprobación, `unlockStaleCard(header, request, refusal, ctx)` y `unlockStaleReason(refusal, lang)`.
- Core, `cards/unlock.ts`: `whyNot` se exporta como `unlockProblem(refusal, lang)`, para que el rechazo al aprobar diga lo mismo que `scope add`.
- CLI, `flow/unlock-check.ts`, nuevo: `unlockMismatches(session, change, task)` lee la auditoría, elige el último desbloqueo aprobado de cada test, comprueba que el test del último commit es la versión bloqueada, aplica el parche en un índice temporal, compara lo que deja con el disco y saca la diferencia con `git diff --no-index`. Borra su carpeta temporal al terminar.
- CLI, `commands/task.ts`: `checkedDiff` pide `unlockMismatches` tras el alcance y devuelve `unlockMismatchCard` si hay alguna.
- CLI, `flow/unlock-proposal.ts`: exporta su comprobación del parche como `checkUnlockPatch`.
- CLI, `commands/scope-decision.ts`: al aprobar un desbloqueo con parche, `checkUnlockPatch`; si falla, Specty rechaza la solicitud con el mismo camino que ya rechaza un `retro --into` cuyo preparado cambió.
- CLI, `commands/scope.ts`: `askedFor` trata como bloqueado un test de `lockedTests` aunque ya esté en las ampliaciones de la tarea.

## Archivos

- crear packages/core/src/cards/unlock-check.ts — la tarjeta de un test que no quedó como su parche y la del desbloqueo que Specty rechaza al aprobarlo
- modificar packages/core/src/cards/unlock.ts — exporta `unlockProblem`
- modificar packages/core/src/cards/index.ts — exporta las tarjetas nuevas y `UnlockMismatch`
- crear packages/core/test/cards/unlock-check.test.ts — esas tarjetas, en español y en inglés
- crear packages/cli/src/flow/unlock-check.ts — compara cada test desbloqueado con lo que deja su parche aprobado
- modificar packages/cli/src/commands/task.ts — `task done` no completa una tarea con un test distinto de su parche
- crear packages/cli/test/unlock-done.test.ts — `task done` con tests desbloqueados, de punta a punta
- modificar packages/cli/src/flow/unlock-proposal.ts — exporta `checkUnlockPatch`
- modificar packages/cli/src/commands/scope-decision.ts — vuelve a comprobar el parche al aprobar un desbloqueo
- modificar packages/cli/src/commands/scope.ts — otro desbloqueo de un test ya desbloqueado para la tarea
- crear packages/cli/test/unlock-again.test.ts — la comprobación al aprobar y el segundo desbloqueo, de punta a punta
- modificar docs/formats.md — el rechazo de Specty al aprobar un desbloqueo cuyo parche ya no vale
- modificar docs/ARCHITECTURE.md — lo que comprueba `task done` de un test desbloqueado, el segundo desbloqueo y la comprobación al aprobar
- modificar docs/decisions/0014-los-tests-como-contrato.md — el test queda como lo deja el parche aprobado
- modificar docs/dominio.md — el término «Desbloqueo»

## Tareas

- [x] T1: Los textos de un test que no quedó como su parche y del desbloqueo que se rechaza al aprobarlo
  - files: packages/core/src/cards/unlock-check.ts, packages/core/src/cards/unlock.ts, packages/core/src/cards/index.ts, packages/core/test/cards/unlock-check.test.ts
  - ac: AC1, AC3, AC6, AC8, AC9
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/unlock-check.test.ts test/cards/unlock.test.ts
  - type: feat
- [x] T2: `task done` exige que cada test desbloqueado quede como lo deja su parche aprobado
  - files: packages/cli/src/flow/unlock-check.ts, packages/cli/src/commands/task.ts, packages/cli/test/unlock-done.test.ts
  - ac: AC1, AC2, AC3, AC4, AC5, AC6
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/unlock-done.test.ts test/test-locks.test.ts
  - type: feat
- [x] T3: Al aprobar un desbloqueo se vuelve a comprobar su parche, y un test desbloqueado se puede volver a pedir
  - files: packages/cli/src/flow/unlock-proposal.ts, packages/cli/src/commands/scope-decision.ts, packages/cli/src/commands/scope.ts, packages/cli/test/unlock-again.test.ts
  - ac: AC7, AC8
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/unlock-again.test.ts test/unlock-request.test.ts test/test-locks.test.ts && pnpm typecheck && pnpm lint
  - type: feat
- [x] T4: La documentación cuenta qué comprueba `task done` de un test desbloqueado
  - files: docs/formats.md, docs/ARCHITECTURE.md, docs/decisions/0014-los-tests-como-contrato.md, docs/dominio.md
  - ac: AC1, AC4, AC7, AC8
  - verify: pnpm sources
  - type: docs

## Riesgos

- R1: Un agente que ya aplicó a mano parte de un parche y pide otro desbloqueo choca con la comprobación de C2 (el test ya no está como se bloqueó) — la tarjeta que rechaza la tarea le dice que vuelva a dejar el test como se bloqueó, y dónde está esa versión (`git show HEAD:<ruta>`).
- R2: Un test bloqueado que no se confirmó (por ejemplo, cambiado tras enviarlo y antes de aprobarlo) no está en el último commit, y `task done` no puede comprobarlo — la tarjeta lo dice y pide parar y explicárselo al usuario; con el flujo normal no pasa, porque `specty propose` confirma los tests al enviarlos.
- R3: `git apply --cached` escribe en la base de objetos de git los blobs de lo que deja el parche — son objetos sueltos que nadie referencia, y `git gc` los limpia como los de un `git add` que no se confirma.

## Cierre

### Resumen

`specty task done` ya no completa una tarea si un test desbloqueado no queda como lo deja su parche aprobado. `flow/unlock-check.ts` busca, de cada test que sigue en `lockedTests`, el último desbloqueo aprobado para la tarea desde su último `task.started`. Comprueba que la versión del último commit tiene el hash bloqueado, aplica el parche con `git apply --cached --recount` en un índice temporal (`GIT_INDEX_FILE`) y compara el resultado con el archivo en disco. Si no coincide, o el parche borra el test y sigue, o lo deja y falta, la tarjeta de `cards/unlock-check.ts` muestra la diferencia (`git diff --no-index`, 40 líneas por test) y da el comando para pedir otro desbloqueo. Si falta la versión bloqueada, pide parar. Esto ocurre tras el alcance y antes de `specty check` y la verificación. Al aprobar un desbloqueo, `approve --scope` repite la comprobación del parche de C2 (`checkUnlockPatch`): si ya no vale, Specty rechaza la solicitud (actor `specty`) con el motivo. Además, `scope add` acepta otra solicitud para un test ya desbloqueado en la tarea, y su parche sustituye al anterior. Los textos están en español y en inglés. formats.md, ARCHITECTURE.md §8, el ADR 0014 y dominio.md («Desbloqueo») lo explican.

### Desviaciones

- Para cada test cuenta el último desbloqueo aprobado, y no todos aplicados uno tras otro como decía el A8 de la épica (A3): C2 comprueba cada parche sobre la versión bloqueada, así que aplicarlos en cadena fallaría si tocan las mismas líneas.
- Además de `unlockProblem`, `cards/unlock.ts` exporta el tipo `UnlockPatchRefusal`. `checkUnlockPatch` lo devuelve, y la tarjeta y el motivo del rechazo al aprobar lo reciben. El diseño no lo preveía.
- Specty ya rechazaba un `retro --into` cuyo preparado cambió (`rejectStaleRetro`). Ese camino pasa a ser `staleRequest` y `rejectStale`, que también sirven para el desbloqueo, sin que `decideScope` gane complejidad.
- El código se probó en una copia temporal de la carpeta del cambio, fuera del repositorio, antes de enviar los tests, porque un test aprobado mal escrito solo lo desbloquea la persona. No quedó nada de esa copia. En el caso del parche que borra el test, este pone otro test del criterio en un archivo propio para que `criteria-tested` no falle.
- El agente aprobó la spec y los tests en modo delegado, y el clasificador de permisos no lo rechazó. La aceptación la hizo la persona.

### Decisiones

- La versión bloqueada de un test es la del último commit (`git show HEAD:<ruta>`), y vale solo si su hash es el de `lockedTests` (A1). Si no lo es, `task done` no completa la tarea y pide parar y explicárselo al usuario, en lugar de no compararlo.
- De cada test cuenta el último desbloqueo aprobado para la tarea, que sustituye a los anteriores, y uno sin parche (de un CLI anterior) deja ese test sin comparar (A3, A4). Un test que el desbloqueo nombra y su parche no toca tiene que quedar como se bloqueó.
- Un test ya desbloqueado para la tarea se puede volver a pedir, con parche y evidencia (A6). Como C2 comprueba el parche sobre la versión bloqueada, el agente lo deja antes como se bloqueó, y la tarjeta que rechaza la tarea se lo dice.
- El parche se aplica con `--cached` en un índice temporal, en una carpeta temporal del sistema que se borra al terminar (A2): no se tocan ni la carpeta del cambio ni su índice.

### Pendientes

- Ninguno.
