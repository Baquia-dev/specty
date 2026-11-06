---
kind: standard
epic: 20261106-tests-con-codigo-y-desbloqueo-explicado
slice: C2
---

# Un desbloqueo se pide con el parche y el código que lo sustenta

## Objetivo

Hoy, para desbloquear un test aprobado, al agente le basta con `scope add <test> --reason "<motivo>"`, y la persona decide solo con ese texto. Con este cambio, `scope add` exige además el cambio exacto que se hará al test (`--patch`, un diff unificado) y las líneas que lo justifican (`--evidence <ruta>:<desde>-<hasta>`). Comprueba el parche y la evidencia y los guarda en la solicitud, y el guard da el comando completo. Es el corte C2 de la épica `20261106-tests-con-codigo-y-desbloqueo-explicado` (AC4, AC5, AC6 y AC10 de la épica).

## Fuera de alcance

- Mostrar el parche y la evidencia en la UI, antes y después de decidir: es el corte C3. Tampoco salen en la terminal al decidir con `approve --scope`.
- Que `task done` compare el test con lo que deja el parche aprobado, y volver a comprobar al aprobar que el parche aún se aplica: es el corte C4.
- Las solicitudes de `retro --into`: siguen como hoy, sin parche ni evidencia.
- Las ampliaciones de alcance que no desbloquean un test: siguen con su motivo y nada más.

## Supuestos

- A1: El parche se comprueba sobre la versión bloqueada: Specty exige que cada test pedido siga en disco con el hash de `lockedTests`, y que el parche se aplique con `git apply --check --recount` desde la raíz de la carpeta del cambio. `--recount` no se fía de las cuentas de cada bloque `@@`, que un agente escribe a mano y suele equivocar, y sí exige que cada línea de contexto y cada línea quitada coincidan. El corte C4 aplicará el parche igual.
  - impacto: alto
- A2: Los archivos que toca el parche salen de `git apply --numstat`, y tienen que ser tests que la solicitud pide desbloquear. Un parche que mueve o copia el test nombra otro archivo y se rechaza. No hace falta que toque todos los tests pedidos: uno que no toca queda como está.
  - impacto: medio
- A3: `--patch <archivo>` se lee relativo a la carpeta donde corre el comando, y puede estar fuera del repositorio. `--patch -` lo lee de la entrada estándar. Un archivo que no se puede leer, un parche vacío o un texto que no es un diff se rechazan. El límite de 500 líneas cuenta las del parche entero.
  - impacto: medio
- A4: Una evidencia es de un archivo que git sigue (`git ls-files --error-unmatch`, lo que incluye uno ya añadido al índice): uno nuevo sin añadir se rechaza igual que uno ignorado. Las líneas se leen del archivo en la carpeta del cambio al pedirlo. La solicitud guarda de cada una su ruta, su primera y su última línea y su texto.
  - impacto: medio
- A5: Specty comprueba primero que están `--patch` y `--evidence`, después el parche y al final cada evidencia en orden: la forma, el número de líneas, que git la sigue y que el archivo tiene esas líneas. Dice el primer problema que encuentra. Los rechazos son entradas no válidas (código 1), como el `scope add` sin motivo.
  - impacto: bajo
- A6: Una solicitud que pide un test bloqueado y otras rutas de fuera del alcance sigue siendo una sola solicitud: el parche solo cubre los tests, y las demás rutas se piden como hoy.
  - impacto: bajo
- A7: Los límites de la épica (500 líneas de parche, de 1 a 5 evidencias, 40 líneas por evidencia) van en core (`UNLOCK_LIMITS`), que usan la tarjeta y la CLI, y el esquema de `state.json` rechaza una solicitud con más de 5 evidencias.
  - impacto: bajo
- A8: Al aprobarse un desbloqueo, el `scope.decided` lleva el parche y la evidencia de la solicitud junto a `unlock` y `task`; al rechazarlo, no. Así los cortes C3 y C4 los leen de la auditoría sin tocar `scope-decision.ts` a la vez. Una solicitud de un CLI anterior, sin parche, se aprueba como hoy.
  - impacto: medio

## Criterios de aceptación

- AC1: CUANDO el agente pide con `scope add` desbloquear un test aprobado sin `--patch`, sin ninguna `--evidence` o sin los dos ENTONCES no se crea la solicitud, y la salida dice qué falta, qué es cada opción y el comando completo para pedirlo.
- AC2: CUANDO el guard impide escribir o borrar un test aprobado ENTONCES su SIGUIENTE da el comando completo, con `--reason`, `--patch` y `--evidence`, y explica qué es cada uno.
- AC3: CUANDO el parche no se puede leer, no es un diff, pasa de 500 líneas, toca un archivo que no es un test pedido, o no se aplica a la versión bloqueada del test (o el test ya no está como se bloqueó) ENTONCES `scope add` no crea la solicitud y dice por qué.
- AC4: CUANDO una evidencia no tiene la forma `<ruta>:<desde>-<hasta>`, pasa de 40 líneas, es de un archivo que git no sigue o nombra líneas que el archivo no tiene, o hay más de 5 ENTONCES `scope add` no crea la solicitud y dice cuál y por qué.
- AC5: CUANDO el parche, de un archivo o de la entrada estándar, y la evidencia son válidos ENTONCES la solicitud de `state.json` y su `scope.requested` guardan el parche tal cual y cada evidencia con su ruta, sus líneas y su texto tal como estaba al pedirlo.
- AC6: CUANDO `scope add` lleva `--patch` o `--evidence` y no desbloquea ningún test aprobado ENTONCES no amplía nada y dice que son solo para desbloquear.
- AC7: CUANDO la persona aprueba una solicitud de desbloqueo con parche ENTONCES su `scope.decided` lleva el parche y la evidencia junto a `unlock` y `task`.
- AC8: CUANDO salen los textos nuevos ENTONCES salen en español y en inglés.

## Diseño

- Core, `schema/state.ts`: `UNLOCK_LIMITS` y `UnlockEvidenceSchema` (`path`, `from`, `to`, `text`). `ScopeRequestSchema` gana `patch` y `evidence` (de 1 a 5), opcionales.
- Core, `cards/unlock.ts`, nuevo porque `cards/task.ts` ya tiene 258 líneas: `unlockHow(paths, task, lang, command)` da el comando completo y la explicación de `--patch` y `--evidence`; `UnlockRefusal` y `unlockRefusalCard(refusal, asked, header, ctx)` dan cada rechazo, con el comando para volver a pedirlo. `guard/testing.ts` (`lockedDenial`) usa `unlockHow`, como `guard/decide.ts` usa las negativas de `cards/change-folder.ts`.
- CLI, `flow/unlock-proposal.ts`, nuevo: `unlockProposal(session, state, locked, options)` lee el parche (de un archivo o de la entrada estándar), lo comprueba con `git apply --numstat` y `git apply --check --recount`, y lee cada evidencia. Devuelve el parche y la evidencia, o el `UnlockRefusal`.
- CLI, `commands/scope.ts`: con tests bloqueados en la solicitud, pide `unlockProposal` y guarda lo que devuelve en la solicitud; sin ellos, rechaza `--patch` y `--evidence`. `commands/agent-commands.ts` registra las dos opciones, y `program.ts` le pasa la entrada estándar. `commands/scope-decision.ts` copia el parche y la evidencia al `scope.decided` de un desbloqueo aprobado.

## Archivos

- modificar packages/core/src/schema/state.ts — la solicitud gana `patch` y `evidence`, y los límites del desbloqueo
- crear packages/core/src/cards/unlock.ts — el comando completo de un desbloqueo y sus rechazos
- modificar packages/core/src/cards/index.ts — exporta `unlockRefusalCard` y `UnlockRefusal`
- modificar packages/core/src/index.ts — exporta `UNLOCK_LIMITS` y `UnlockEvidence`
- modificar packages/core/src/guard/testing.ts — el guard da el comando completo del desbloqueo
- crear packages/core/test/cards/unlock.test.ts — el comando del desbloqueo y sus rechazos, en español y en inglés
- crear packages/cli/src/flow/unlock-proposal.ts — comprueba el parche y lee la evidencia de un desbloqueo
- modificar packages/cli/src/commands/scope.ts — exige el parche y la evidencia al desbloquear y los guarda en la solicitud
- modificar packages/cli/src/commands/agent-commands.ts — `scope add --patch` y `--evidence`
- modificar packages/cli/src/program.ts — pasa la entrada estándar a los comandos del agente
- modificar packages/cli/src/commands/scope-decision.ts — el `scope.decided` de un desbloqueo aprobado lleva el parche y la evidencia
- crear packages/cli/test/unlock-request.test.ts — el desbloqueo con parche y evidencia de punta a punta
- modificar packages/cli/test/test-locks.test.ts — sus desbloqueos llevan parche y evidencia, y el guard da el comando completo
- modificar docs/formats.md — `patch` y `evidence` de la solicitud y del `scope.decided`
- modificar docs/ARCHITECTURE.md — `scope add --patch --evidence` y el desbloqueo con parche y evidencia
- modificar docs/decisions/0014-los-tests-como-contrato.md — el desbloqueo se pide con el parche y el código que lo sustenta
- modificar docs/dominio.md — el término «Desbloqueo»

## Tareas

- [x] T1: La solicitud de desbloqueo admite parche y evidencia, y los textos dicen cómo pedirlo y por qué se rechaza
  - files: packages/core/src/schema/state.ts, packages/core/src/index.ts, packages/core/src/cards/unlock.ts, packages/core/src/cards/index.ts, packages/core/src/guard/testing.ts, packages/core/test/cards/unlock.test.ts
  - ac: AC1, AC2, AC3, AC4, AC6, AC8
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/unlock.test.ts test/guard/decide.test.ts test/cards/task.test.ts test/schema/schema.test.ts
  - type: feat
- [x] T2: `scope add` exige y comprueba el parche y la evidencia de un desbloqueo
  - files: packages/cli/src/flow/unlock-proposal.ts, packages/cli/src/commands/scope.ts, packages/cli/src/commands/agent-commands.ts, packages/cli/src/program.ts, packages/cli/test/unlock-request.test.ts
  - ac: AC1, AC3, AC4, AC5, AC6
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/unlock-request.test.ts test/retro-into.test.ts test/commands-named.test.ts
  - type: feat
- [x] T3: Aprobar un desbloqueo deja el parche y la evidencia en la auditoría
  - files: packages/cli/src/commands/scope-decision.ts, packages/cli/test/test-locks.test.ts
  - ac: AC2, AC7
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/test-locks.test.ts test/unlock-request.test.ts && pnpm typecheck && pnpm lint
  - type: feat
- [x] T4: La documentación cuenta el desbloqueo con parche y evidencia
  - files: docs/formats.md, docs/ARCHITECTURE.md, docs/decisions/0014-los-tests-como-contrato.md, docs/dominio.md
  - ac: AC1, AC3, AC4, AC5, AC7
  - verify: pnpm sources
  - type: docs

## Riesgos

- R1: `--recount` acepta un parche cuyas cuentas no cuadran, y otro lector de diffs podría pintarlo mal — la UI del corte C3 lo lee con su propio visor; si hace falta, Specty puede guardar el parche normalizado en un cambio aparte.
- R2: `test-locks.test.ts` pide desbloqueos sin parche y dejaría de pasar — se cambia en este corte, y es el único test de `packages/cli/test` que pide uno (búsqueda de `scope add` sobre un test de `lockedTests`).
- R3: Leer la entrada estándar con `--patch -` espera si nadie la cierra — los agentes corren sin terminal y la cierran; sin `--patch -`, no se lee.

## Cierre

### Resumen

Para desbloquear un test aprobado, `scope add` exige ahora `--patch` (el cambio exacto al test, como diff unificado, de un archivo o de la entrada estándar con `-`) y de 1 a 5 `--evidence <ruta>:<desde>-<hasta>`. `flow/unlock-proposal.ts` comprueba que el parche no pasa de 500 líneas, que solo toca tests que se piden, que cada uno sigue con su hash de `lockedTests` y que se aplica con `git apply --check --recount`. Cada evidencia tiene que ser de un archivo que git sigue, de 40 líneas como máximo y con líneas que existen. La solicitud y su `scope.requested` guardan el parche y las líneas tal como estaban, y al aprobarla el `scope.decided` los lleva junto a `unlock` y `task`. Los rechazos y el comando completo están en `cards/unlock.ts`, en español y en inglés, y el guard da ese comando al impedir cambiar un test aprobado. `--patch` y `--evidence` sin desbloqueo se rechazan. formats.md, ARCHITECTURE.md, el ADR 0014 y dominio.md («Desbloqueo») lo cuentan.

### Desviaciones

- El primer `task done` de T2 falló por `function-lines`: `agentCommands` y `taskCommands` pasaban de 50 líneas. `agentCommands` recibe ahora el entorno (`env` y `stdin`) en lugar de un parámetro más, y `taskCommands` se partió en `taskDoneCommand` y `scopeAddCommand`.
- Para no pasar de la complejidad 10, la decisión de desbloqueo de `scopeAdd` va en `unlockOf` (`commands/scope.ts`), y lo que guarda el `scope.decided` de un desbloqueo aprobado, en `unlockDecided` (`commands/scope-decision.ts`). El diseño no los preveía.
- Antes de enviar los tests, el código se probó en una copia de la carpeta del cambio, fuera del repositorio, porque un test aprobado mal escrito solo lo desbloquea la persona. En el cambio no quedó nada de esa copia.
- El gate 2 lo aprobó la persona: el `specty approve` del agente en modo delegado lo rechazó el clasificador de permisos de Claude Code (dos veces, como «Self-Approval»).

### Decisiones

- El parche se comprueba con `git apply --recount`, que no se fía de las cuentas de cada bloque `@@` (un agente las escribe a mano) y sí de cada línea de contexto y quitada. El corte C4 tiene que aplicarlo igual, como dicen formats.md y ARCHITECTURE.md.
- Los archivos que toca el parche salen de `git apply --numstat`, y basta con que todos sean tests pedidos: no hace falta que toque todos, porque uno que no toca queda como está.
- La evidencia solo sale de archivos que git sigue (`git ls-files --error-unmatch`): uno nuevo sin añadir al índice se rechaza igual que uno ignorado, para no copiar secretos al estado.
- El `scope.decided` de un desbloqueo aprobado lleva ya el parche y la evidencia, para que C3 y C4 los lean de la auditoría sin tocar `scope-decision.ts` a la vez.
- Las negativas van en `cards/unlock.ts` y no en `cards/task.ts`, y `unlockHow` da a la vez el comando y la explicación de las opciones a la tarjeta y al guard (`guard/testing.ts`).

### Pendientes

- P210: al decidir un desbloqueo en la terminal con `approve --scope`, la nota solo muestra las rutas y el motivo; falta enseñar el parche y la evidencia.
