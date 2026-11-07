---
kind: standard
---

# Incorporar main no cambia un test aprobado sin el desbloqueo de la persona

## Objetivo

Mientras el agente resuelve una incorporación de main, un test aprobado (`lockedTests`) solo cambia como lo funde git con la versión de main o con el desbloqueo que decide la persona, como en una tarea (ADR 0014). El guard ya no lo abre por estar entre los archivos que junta el merge, `specty integrate` no hace el commit si cambió de otra forma, y el desbloqueo se pide y se aprueba con la incorporación en curso, sin abortar el merge, sin `specty adjust` y sin repetir la aceptación.

## Fuera de alcance

- Volver a bloquear con su hash nuevo un test aprobado que main cambia en un merge que sale solo, sin pasar por `specty integrate` (en `accept` o `close`).
- `tests-locked` durante una incorporación pendiente: sigue mirando solo los tests desbloqueados para una tarea activa.
- La UI: no cambia; la persona decide la solicitud con `specty approve --scope` o `specty reject --scope` en su terminal.
- Las incorporaciones que se descartan (merge abortado a mano) no borran sus solicitudes pendientes: la persona las sigue pudiendo decidir.

## Supuestos

- A1: «Resolver un conflicto» de un test aprobado es dejarlo como lo funde git con la versión de main: lo que git junta solo y, en cada bloque en conflicto, el lado del cambio, el de main o los dos, que es lo que da `git merge-file` con `--ours`, `--theirs` o `--union` sobre la base común, la versión aprobada del último commit y la de main. Es determinista (ADR 0001) y no añade ninguna línea que no esté en una de las dos versiones ya aprobadas (el contrato del cambio y el código de main, que pasó su propio flujo). Un test que main no cambió solo puede quedar como se aprobó, y cualquier otra edición, como reescribir una aserción (el caso de C18), cambia el contrato y la decide la persona. Se descarta «basta con mostrarlo en la aceptación», porque se ve después del commit de merge y en modo delegado nadie lo mira, y «cualquier línea de uno de los dos lados», porque deja borrar aserciones.
  - impacto: alto
- A2: Para un archivo de texto sin atributos de merge propios, `git merge-file` funde los bloques sin conflicto igual que el merge de git; si no coincide, el agente pide el desbloqueo.
- A3: Una incorporación pendiente solo existe en `acceptance` o `closing`, sin tarea activa. La solicitud de desbloqueo se anota con la última tarea del spec que lista alguno de esos tests en `files` o, si ninguna, con la última tarea, porque el esquema exige una; `--task` no cuenta en ella.
- A4: Con la incorporación pendiente, el parche se comprueba sobre la versión aprobada del último commit y no sobre el disco, que puede llevar la versión de main o marcadores; el agente lo escribe desde esa versión hasta la final, con lo que traiga main.

## Criterios de aceptación

- AC1: CUANDO hay una incorporación pendiente y el agente intenta escribir un test aprobado que git no dejó en conflicto ni la persona desbloqueó para ella ENTONCES el guard lo rechaza como test aprobado, con el comando completo para pedir su desbloqueo sin `--task`, y los demás archivos que junta el merge siguen abiertos.
- AC2: CUANDO git dejó en conflicto un test aprobado al incorporar main ENTONCES el guard deja escribirlo para resolver el conflicto.
- AC3: CUANDO, con la incorporación pendiente, el agente ejecuta `specty scope add <test aprobado> --reason … --patch … --evidence …` ENTONCES se crea la solicitud de desbloqueo con su parche y su evidencia, el merge sigue en curso y el cambio espera a la persona; una ruta que no es un test aprobado se rechaza.
- AC4: CUANDO la persona aprueba esa solicitud con `specty approve --scope S<n>` ENTONCES el test queda abierto para el guard durante esa incorporación; sin una persona en la terminal, la aprobación se rechaza.
- AC5: CUANDO `specty integrate` encuentra un test aprobado distinto de su versión aprobada y no desbloqueado para la incorporación, porque main no lo cambió o porque no quedó como lo funde git ENTONCES no hace el commit, el merge sigue en curso y la salida nombra el test y el comando para pedir su desbloqueo.
- AC6: CUANDO main cambió un test aprobado y queda como lo funde git, sin conflicto o con cada conflicto resuelto tomando un lado o los dos ENTONCES `specty integrate` hace el commit de merge y `lockedTests` guarda el hash de esa versión.
- AC7: CUANDO un test desbloqueado para la incorporación no queda como lo deja el parche aprobado ENTONCES `specty integrate` no hace el commit y dice que no quedó como su parche; CUANDO queda así ENTONCES hace el commit y `lockedTests` guarda su hash nuevo.

## Diseño

- Guard: la regla `locked` va antes que la de la incorporación. Con una incorporación pendiente, `lockedOf` deja abiertos solo los tests aprobados de `integration.conflicts` y de `integration.unlocked`; el SIGUIENTE da `scope add` sin `--task` (`unlockHow` con la tarea opcional).
- Estado: `integration.unlocked` (opcional), los tests aprobados que la persona desbloqueó para esa incorporación. Se va con la incorporación si se descarta, así que un merge abortado no deja ningún test desbloqueado.
- `scope add` con la incorporación pendiente solo acepta tests aprobados, con `--patch` y `--evidence`; el resto se rechaza como fuera de la implementación. `checkUnlockPatch` comprueba el hash y el parche sobre la versión del último commit (`git apply --check --cached` en un índice temporal). `approve --scope` y `reject --scope` deciden solicitudes pendientes también fuera de `implementing`; aprobada con la incorporación pendiente, el test pasa a `integration.unlocked` en lugar de a la tarea.
- `specty integrate`, tras los marcadores y lo de fuera y antes de verificar, mira cada test de `lockedTests`: vale si es su versión aprobada, si main lo cambió y es una de las fusiones de A1, o si está desbloqueado para la incorporación y queda como su parche (el último desbloqueo aprobado desde `integration.started`, con la comprobación de `task done`). Si no, no hace el commit y da los tests y la diferencia con el parche. Con el commit, `lockedTests` guarda el hash de cada test como queda, y uno que el parche borró deja de estar bloqueado.

## Archivos

- modificar packages/core/src/guard/decide.ts — la regla de los tests aprobados antes que la de la incorporación pendiente
- modificar packages/core/src/guard/testing.ts — el SIGUIENTE de un test aprobado sin tarea durante la incorporación
- modificar packages/core/src/cards/unlock.ts — el comando del desbloqueo sin `--task` cuando no hay tarea
- modificar packages/core/src/cards/unlock-check.ts — por qué `integrate` no hace el commit: tests aprobados cambiados, o que no quedan como su parche
- modificar packages/core/src/cards/index.ts — exporta el texto nuevo de `integrate`
- modificar packages/core/src/schema/state.ts — `integration.unlocked`
- modificar packages/cli/src/enforce/guard.ts — con la incorporación pendiente, solo se abren los tests aprobados en conflicto o desbloqueados para ella
- modificar packages/cli/src/commands/scope.ts — `scope add` de un test aprobado con la incorporación pendiente
- modificar packages/cli/src/commands/scope-decision.ts — decidir solicitudes fuera de `implementing`; aprobada, abre el test para la incorporación
- modificar packages/cli/src/flow/unlock-proposal.ts — con la incorporación pendiente, el parche se comprueba sobre la versión del último commit
- modificar packages/cli/src/flow/unlock-check.ts — qué comprueba `integrate` de cada test aprobado, y su hash al hacer el commit
- modificar packages/cli/src/commands/integrate.ts — la comprobación de los tests aprobados antes de verificar y su nuevo bloqueo con el commit
- crear packages/cli/test/integrate-locked.test.ts — tests de los criterios
- modificar docs/ARCHITECTURE.md — incorporación pendiente, desbloqueo e `integrate`
- modificar docs/formats.md — `integration.unlocked`, la solicitud de una incorporación y `lockedTests`
- modificar docs/decisions/0014-los-tests-como-contrato.md — los tests aprobados en una incorporación

## Tareas

- [ ] T1: El guard no abre un test aprobado durante la incorporación salvo si quedó en conflicto
  - files: packages/core/src/guard/decide.ts, packages/core/src/guard/testing.ts, packages/core/src/cards/unlock.ts, packages/cli/src/enforce/guard.ts, packages/cli/test/integrate-locked.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/integrate-locked.test.ts -t "AC[12]:" && pnpm lint
- [ ] T2: Con la incorporación pendiente, el agente pide el desbloqueo y la persona lo aprueba
  - files: packages/core/src/schema/state.ts, packages/cli/src/commands/scope.ts, packages/cli/src/commands/scope-decision.ts, packages/cli/src/flow/unlock-proposal.ts, packages/cli/src/enforce/guard.ts, packages/cli/test/integrate-locked.test.ts, docs/formats.md
  - ac: AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/integrate-locked.test.ts -t "AC[34]:" && pnpm lint
- [ ] T3: `specty integrate` solo hace el commit con cada test aprobado como se aprobó, como lo funde git o como su parche, y lo vuelve a bloquear
  - files: packages/cli/src/commands/integrate.ts, packages/cli/src/flow/unlock-check.ts, packages/core/src/cards/unlock-check.ts, packages/core/src/cards/index.ts, packages/cli/test/integrate-locked.test.ts, docs/ARCHITECTURE.md, docs/decisions/0014-los-tests-como-contrato.md
  - ac: AC5, AC6, AC7
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/integrate-locked.test.ts test/integrate.test.ts test/unlock-done.test.ts && pnpm typecheck && pnpm lint && pnpm knip

## Riesgos

- R1: `git merge-file` no coincide con el merge de git en algún caso (A2) — el agente pide el desbloqueo, que es el camino seguro, y la salida se lo da completo.
- R2: decidir solicitudes fuera de `implementing` cambia `approve --scope` y `reject --scope` en otras fases — solo se abre cuando hay solicitudes pendientes, que fuera de `implementing` solo crea una incorporación; los tests de las solicitudes existentes siguen pasando.
