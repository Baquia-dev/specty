---
kind: standard
---

# El agente resuelve la incorporación

## Objetivo

Si incorporar la rama principal al cerrar da conflictos, o la verificación falla con el resultado, el merge ya no se aborta. Se queda en la worktree del cambio que lo causa, y el agente lo resuelve allí y lo termina con `specty integrate`. Después, la persona vuelve a ejecutar `specty close` y el cambio llega a `main` como siempre. Hoy la persona tiene que fusionar `main` a mano y resolver ella los conflictos. Este cambio usa lo que la parte anterior puso en core: el estado de la incorporación pendiente, el guard y la tarjeta.

## Fuera de alcance

- Que el agente resuelva el reintento de un cambio ya cerrado (fase `done`): sigue abortándose, con el camino manual.
- Rama destino configurable, `new` siempre en una worktree y los comandos de la persona desde cualquier carpeta: son los siguientes cambios de la serie.
- La UI.

## Supuestos

- A1: Con conflictos, o con la verificación en rojo, al cerrar un cambio o al aceptar uno quick, el merge queda en curso en la carpeta del cambio y no se aborta. Se registra la incorporación pendiente, que guarda como archivos tocables los que cambió cualquiera de los dos lados desde su base común, y la salida le pide a la persona que le diga al agente «continúa» y que vuelva a ejecutar el comando cuando termine.
  - impacto: alto
- A2: El agente la termina con `specty integrate`, que comprueba tres cosas: que no queden marcadores de conflicto en los archivos que estaban en conflicto, que todo lo cambiado esté dentro de los archivos de la incorporación (con sus tests y generados) y que la verificación pase (`verify.full`, o `verify.default`). Si todo está bien, hace el commit de merge con recibo y la marca como resuelta. No cierra el cambio: lo cierra la persona, que antes de confirmar ve el merge del agente.
  - impacto: alto
- A3: Si el merge ya no está en curso (alguien lo abortó), `close` y `accept` descartan la incorporación pendiente y la intentan de nuevo desde el principio, y `specty integrate` pide al usuario volver a ejecutar el comando.
- A4: Mientras el merge del agente sigue en curso, `close` y `accept` se niegan y piden decirle al agente «continúa».
- A5: Los textos nuevos van en la CLI, junto a los de `close`, como en la primera parte de la incorporación.

## Criterios de aceptación

- AC1: CUANDO `close` encuentra conflictos al fusionar la rama principal ENTONCES no cierra ni archiva; el merge queda en curso con los conflictos en la carpeta del cambio; `state.json` registra la incorporación pendiente (motivo `conflicts`, los archivos en conflicto y los que se pueden tocar), y la salida lista los conflictos y pide decirle al agente «continúa» y volver a ejecutar `specty close` cuando termine.
- AC2: CUANDO la fusión es limpia pero la verificación falla ENTONCES ocurre lo mismo que en AC1, con motivo `verify` y con la cola de la verificación en lugar de la lista de conflictos.
- AC3: CUANDO hay una incorporación pendiente ENTONCES `specty next` muestra su tarjeta, `status` dice que espera al agente y el guard solo deja tocar sus archivos.
- AC4: CUANDO el agente ejecuta `specty integrate` y quedan marcadores de conflicto, hay cambios fuera de los archivos de la incorporación o la verificación falla ENTONCES no se hace ningún commit, la salida lo explica con los archivos o la cola de la verificación, y la incorporación sigue pendiente; sin una incorporación pendiente, el comando dice que no hay nada que incorporar.
- AC5: CUANDO el agente ejecuta `specty integrate` y todo está bien ENTONCES se hace el commit de merge (con dos padres y `Specty-Change`, y sin los archivos de `.specty/` que no tenían commit), la incorporación queda marcada como resuelta, y el SIGUIENTE pide al usuario volver a ejecutar `specty close`.
- AC6: CUANDO la persona vuelve a ejecutar `specty close` tras la resolución ENTONCES ve el merge del agente antes de confirmar, y el cambio se cierra, la rama principal avanza por fast-forward y la worktree se borra.
- AC7: CUANDO hay una incorporación pendiente con el merge en curso ENTONCES `close` y `accept` se niegan y piden decirle al agente «continúa»; si el merge ya no está en curso, `close` descarta la incorporación pendiente y la intenta de nuevo.
- AC8: CUANDO se acepta un cambio quick y la incorporación choca ENTONCES ocurre lo mismo que al cerrar, el cambio sigue en aceptación, y tras `specty integrate` el SIGUIENTE pide volver a ejecutar `specty accept`.

## Diseño

- `flow/land.ts` (nuevo): `landChange`, `withIntegration` y el avance de la rama salen de `flow/integrate.ts`, que está en 297 líneas.
- `flow/integrate.ts`:
  - En `closing` o `acceptance`, `absorbTarget` recibe el cambio guardado. Ante conflictos o una verificación en rojo, deja el merge en curso y llama a `leaveForAgent`. En `done` aborta como hasta ahora.
  - `leaveForAgent` calcula los archivos tocables (`git merge-base HEAD <principal>`, y la unión de `git diff --name-only` desde esa base hasta HEAD y hasta la principal, sin `.specty/`). Guarda `integration` con `commitState`, en el evento `integration.started`, y devuelve la salida para la persona.
  - `pendingIntegration(session, change)` sirve a `close` y a `accept`: con el merge en curso (`MERGE_HEAD`) devuelve la negativa (A4); sin él, descarta la incorporación pendiente (`integration.abandoned`) y deja seguir (A3).
- `commands/integrate.ts` (nuevo): `specty integrate`, solo para el agente y sin preguntas.
  1. Busca marcadores (`<<<<<<<`, `=======`, `>>>>>>>` a principio de línea) en los archivos que estaban en conflicto.
  2. Comprueba que lo cambiado frente a HEAD esté dentro de los archivos de la incorporación, con `classifyPath`.
  3. Ejecuta la verificación.
  4. Prepara todo salvo `.specty/` y hace el commit de merge con recibo.
  5. Guarda `resolved`, en el evento `integration.resolved`.
- `program.ts`: el comando `integrate`.
- `enforce/guard.ts`: `GuardChange.integration` mientras está pendiente.
- `flow/views.ts`: `ChangeView.integration` mientras está pendiente.
- `commands/status.ts`: la espera usa `phasePermissions(…, isIntegrating(state))`.
- `commands/finish.ts` y `commands/accept.ts`: llaman a `pendingIntegration` antes de confirmar. Con la incorporación ya resuelta, `close` muestra con `terminal.note` el merge del agente y los archivos que estaban en conflicto.
- `test/support.ts`: recibe los ayudantes `inWorktree` y `toClosing`, para usarlos desde dos archivos de pruebas.

## Archivos

- crear packages/cli/src/flow/land.ts — avance de la rama principal y salida de la carpeta, fuera de `integrate.ts`
- modificar packages/cli/src/flow/integrate.ts — el merge con conflictos queda para el agente
- crear packages/cli/src/commands/integrate.ts — `specty integrate`
- modificar packages/cli/src/program.ts — registrar `integrate`
- modificar packages/cli/src/enforce/guard.ts — la incorporación pendiente llega al guard
- modificar packages/cli/src/flow/views.ts — la incorporación pendiente llega a la tarjeta de `next`
- modificar packages/cli/src/commands/status.ts — con una incorporación pendiente, espera al agente
- modificar packages/cli/src/commands/finish.ts — `close` con una incorporación pendiente o resuelta
- modificar packages/cli/src/commands/accept.ts — `accept` de un quick con una incorporación pendiente
- modificar packages/cli/test/support.ts — ayudantes compartidos para llevar un cambio al cierre en su worktree
- modificar packages/cli/test/integrate.test.ts — conflictos y verificación en rojo ya no abortan
- crear packages/cli/test/resolve.test.ts — el agente resuelve y la persona cierra, de punta a punta
- modificar docs/ARCHITECTURE.md — §6: `specty integrate`; §9: el merge queda para el agente
- modificar docs/formats.md — §4: eventos `integration.started`, `integration.resolved` y `integration.abandoned`

## Tareas

- [x] T1: Sacar el avance de la rama principal a `flow/land.ts`
  - files: packages/cli/src/flow/land.ts, packages/cli/src/flow/integrate.ts, packages/cli/src/commands/finish.ts, packages/cli/src/commands/accept.ts
  - ac: —
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/integrate.test.ts test/flow.test.ts
  - type: refactor
- [ ] T2: El merge con conflictos o en rojo queda para el agente
  - files: packages/cli/src/flow/integrate.ts, packages/cli/src/commands/finish.ts, packages/cli/src/commands/accept.ts, packages/cli/test/support.ts, packages/cli/test/integrate.test.ts
  - ac: AC1, AC2, AC7, AC8
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/integrate.test.ts
- [ ] T3: El agente ve la incorporación pendiente
  - files: packages/cli/src/enforce/guard.ts, packages/cli/src/flow/views.ts, packages/cli/src/commands/status.ts, packages/cli/test/resolve.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/resolve.test.ts
- [ ] T4: `specty integrate` y el cierre tras la resolución
  - files: packages/cli/src/commands/integrate.ts, packages/cli/src/program.ts, packages/cli/src/commands/finish.ts, packages/cli/test/resolve.test.ts
  - ac: AC4, AC5, AC6, AC8
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/resolve.test.ts test/integrate.test.ts
- [ ] T5: Documentar que el agente resuelve la incorporación
  - files: docs/ARCHITECTURE.md, docs/formats.md
  - ac: —
  - verify: pnpm check
  - type: docs

## Riesgos

- R1: El agente resuelve un conflicto mal pero con la verificación en verde — la persona ve el merge del agente antes de confirmar el cierre, y el guard le impide tocar archivos fuera de la incorporación.
- R2: El merge en curso deja la carpeta del cambio en un estado que otras herramientas (un `git pull`, un `ng serve`) ven a medias — es la misma carpeta del cambio, que nadie más usa, y la tarjeta de `next` lo explica.
- R3: Esta rama parte de la del cambio anterior (core), aún sin incorporar — la base es la de ese cambio, y al cerrar se incorpora `main` con él dentro.
