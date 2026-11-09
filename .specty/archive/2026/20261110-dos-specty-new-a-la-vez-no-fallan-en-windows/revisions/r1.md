---
kind: standard
---

# Dos specty new a la vez no fallan en Windows

## Objetivo

En el run 42652237044 (main 172c8cc) el CI de Windows, ya bloqueante, falló en un solo test: el AC7 de `epic-subagents.test.ts` lanza dos `specty new --worktree` a la vez en el mismo clon y uno salió con código 1, sin que el log muestre su salida. En Windows, dos `new` a la vez se pisan en lo que comparten del clon: la escritura de `.git/config` (git no puede renombrar `config.lock` mientras otro proceso de git lo tiene abierto), las órdenes de git que la leen en ese momento, y la limpieza de uno, que mira `.worktrees/` mientras el otro crea allí su carpeta. Este cambio hace que en Windows dos `new` del mismo clon creen su carpeta, su rama y su cambio uno tras otro, y que el test, si vuelve a fallar, muestre la salida del `new` que falló.

## Fuera de alcance

- Cambiar `new` en Linux y macOS: allí no ha fallado y sigue igual, sin turno.
- Serializar la preparación de la carpeta (`git.setup`, como `pnpm install`): corre fuera del turno, porque puede tardar minutos y no toca lo que comparten.
- Repetir otras órdenes de git o de archivos que no ha fallado en ningún run, ni el `new` sin worktree (`git.worktrees: false`), que cambia de rama en la misma carpeta.
- Hacer configurable la espera del turno.

## Supuestos

- A1: El fallo es de concurrencia entre los dos `new`: el mismo test pasó entero en el run anterior de Windows (42639128089), el corte C1 que corre solo antes nunca ha fallado, y el código 1 sin excepción solo sale de una tarjeta, como la de un git que falló (`gitFailedCard`) o una negativa de `new`; un error de archivos de Node habría roto el test con su traza.
  - impacto: alto
- A2: Hacer esos pasos uno tras otro en Windows quita el fallo aunque no se sepa cuál de ellos falló (la escritura de `.git/config`, una orden de git que la leía o la limpieza que barrió la carpeta del otro): en el test no corre nada más en ese clon.
  - impacto: alto
- A3: Los pasos de creación (limpieza, carpeta, rama, su marca en `.git/config` y el estado del cambio) tardan unos segundos incluso en un runner lento de Windows, así que esperar el turno hasta unos 60 s basta; pasado ese tiempo, `new` sigue sin turno, como hoy.
- A4: El bloqueo de `store/lock.ts` (un archivo creado en exclusiva con un enlace, y el de un proceso que ya no existe no cuenta) funciona en Windows, donde ya lo usa el turno de la verificación completa.

## Criterios de aceptación

- AC1: CUANDO dos `specty new` con worktree corren a la vez en el mismo clon en Windows ENTONCES crean su carpeta, su rama y su cambio uno tras otro: el segundo espera a que el primero termine la limpieza, la carpeta, la rama con su marca y el estado del cambio antes de empezar los suyos; los dos terminan con código 0, cada uno con su carpeta, su rama y su `state.json`, y la preparación de cada carpeta corre después de soltar el turno.
- AC2: CUANDO en Windows otro proceso vivo tiene el turno de `new` durante más tiempo del que `new` lo espera (unos 60 s) ENTONCES `new` sigue sin turno, como hoy; y el turno que dejó un proceso que ya no existe no cuenta.
- AC3: CUANDO `new` corre en Linux o en macOS ENTONCES no toma el turno ni espera: hace lo mismo que hoy.
- AC4: CUANDO el AC7 de `epic-subagents.test.ts` falla porque un `specty new` sale con un código distinto de 0 ENTONCES el fallo muestra lo que ese `new` imprimió en su salida y en su error.

## Diseño

- `cli/src/store/lock.ts`: `lockNewChange(git, holder)` toma `common/specty/locks/new.json` con `lockAt` y las reglas de los demás bloqueos, sin darlo de nuevo dentro del mismo proceso (como el turno de la verificación completa), para que dos `new` del mismo proceso, como los del test, también vayan uno tras otro. El borrador del bloqueo pasa a llamarse `<bloqueo>.<pid>.<uuid>.tmp`: con `<pid>` solo, dos tomas del mismo proceso a la vez escribían y borraban el mismo borrador, y la segunda fallaba con ENOENT.
- `cli/src/flow/new-turn.ts` (nuevo): `onNewTurn(session, run, platform, waits)`. Fuera de `win32` ejecuta `run` sin más. En `win32` intenta el turno; si lo tiene otro, o la toma falla con un error de archivos (EPERM de Windows, por ejemplo), espera la siguiente de `NEW_TURN_WAITS` (desde 50 ms, el doble cada vez hasta 1 s, unos 60 s en total) y lo intenta de nuevo; tras la última, ejecuta `run` sin turno. Con turno, lo suelta al terminar `run`, también tras un fallo. La plataforma y las esperas son parámetros, como `replaceFile` en `io/files.ts`, para probarlo en macOS sin esperar.
- `cli/src/commands/new.ts`: `newInWorktree` saca a `makeWorktree` los pasos de creación (`cleanUp`, el id, la rama, `addWorktree`, `markOrUndo` y `createChange`) y los ejecuta dentro de `onNewTurn`; `prepareWorktree`, el enlace de la sesión y la tarjeta van después, fuera del turno.
- `cli/test/new-turn.test.ts` (nuevo): con un repositorio de prueba, dos `onNewTurn` a la vez con `win32` no se solapan y con `darwin` sí; con el turno tomado por otro que no lo suelta, `run` corre tras las esperas; con el turno de un pid que no existe, lo toma a la primera.
- `cli/test/epic-subagents.test.ts`: el AC7 comprueba el código de cada `new` con su salida y su error como mensaje del `expect`.
- `docs/formats.md` §1 y `docs/ARCHITECTURE.md` §9: el nuevo `locks/new.json` y por qué `new` lo toma solo en Windows.

## Archivos

- modificar packages/cli/src/store/lock.ts — el bloqueo del turno de `new` y un borrador único por toma
- crear packages/cli/src/flow/new-turn.ts — el turno de `new` en Windows, con sus esperas
- crear packages/cli/test/new-turn.test.ts — el turno en Windows, sin turno en otros sistemas, y la espera que se agota (AC1, AC2, AC3)
- modificar packages/cli/src/commands/new.ts — los pasos de creación de la worktree dentro del turno
- modificar packages/cli/test/epic-subagents.test.ts — el AC7 muestra la salida del `new` que falla (AC4)
- modificar docs/formats.md — `locks/new.json`
- modificar docs/ARCHITECTURE.md — el turno de `new` en Windows

## Tareas

- [ ] T1: El turno de `new` en Windows
  - files: packages/cli/src/store/lock.ts, packages/cli/src/flow/new-turn.ts, packages/cli/test/new-turn.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/new-turn.test.ts test/lock.test.ts && pnpm lint
  - type: fix
- [ ] T2: `new` crea la worktree dentro del turno, y el AC7 de los cortes a la vez muestra la salida del `new` que falla
  - files: packages/cli/src/commands/new.ts, packages/cli/test/epic-subagents.test.ts, docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC1, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/epic-subagents.test.ts test/new-locked-config.test.ts test/new-turn.test.ts && pnpm lint && pnpm typecheck
  - type: fix

## Riesgos

- R1: Aquí no hay Windows: el turno solo se prueba de verdad en el CI. Mitigación: el test nuevo lo ejecuta con la plataforma `win32` en macOS, y si el AC7 vuelve a fallar en Windows, ahora muestra la salida del `new` que falló; la sesión principal lee el siguiente run.
- R2: Un `new` que se cuelga con el turno tomado haría esperar al otro unos 60 s. Mitigación: pasado ese tiempo sigue sin turno, como hoy, y el turno de un proceso que ya no existe no cuenta.
