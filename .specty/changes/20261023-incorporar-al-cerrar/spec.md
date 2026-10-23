---
kind: standard
---

# Incorporar al cerrar

## Objetivo

Cuando la persona cierra un cambio (o acepta uno quick), Specty lo incorpora a la rama principal en ese mismo comando, sin que tenga que fusionar a mano. Si la rama principal avanzó mientras tanto, el cambio la absorbe primero en su propia rama y carpeta y se verifica allí, así que la rama principal solo avanza por fast-forward hasta código ya verificado; un conflicto nunca llega a ella. Hoy, tras cada `specty close`, la persona fusiona la rama principal en la del cambio, ejecuta `pnpm check`, avanza la principal y borra la worktree con comandos largos, y eso frena el trabajo en paralelo.

## Fuera de alcance

- Que el agente resuelva los conflictos en la worktree del cambio: necesita una fase de incorporación en core (estado, permisos del guard y tarjeta) y un comando del agente. Es el siguiente cambio de la serie; hasta entonces, un conflicto se resuelve a mano (AC3).
- Configurar la rama destino (`git.target`) y que `new --from <rama>` la fije por cambio.
- Que `specty new` cree siempre una worktree y prepare en ella las dependencias.
- Ejecutar `close` y los demás comandos de la persona desde cualquier carpeta, eligiendo el cambio.
- Incorporar épicas, y el modo `team`, que integra por PR.

## Supuestos

- A1: La rama a la que se incorpora es la rama principal, la misma que usa `new --worktree` como base: la de `origin/HEAD` y, sin remoto, la primera que exista de `init.defaultBranch`, `main` y `master`. Si no existe ninguna, el cierre queda como hoy y el SIGUIENTE pide fusionar la rama.
  - impacto: alto
- A2: Si la rama principal no está contenida en la del cambio, `close` ejecuta en la carpeta del cambio `git merge --no-ff --no-commit <principal>`, verifica con `verify.full` (o `verify.default`; sin ninguno no verifica) y solo con verde hace el commit de merge, con recibo y `Specty-Change`. Después la rama principal avanza por fast-forward: con `git merge --ff-only` en la carpeta donde está, o con `git update-ref` si no está en ninguna.
  - impacto: alto
- A3: Con conflictos o con la verificación en rojo, `close` aborta el merge y no cierra ni archiva nada: la rama y la carpeta quedan como estaban, y la salida lista los archivos en conflicto o la cola de la verificación.
- A4: Tras incorporar, Specty borra la worktree del cambio con `git worktree remove` y conserva la rama. Sin `--force`: si quedan archivos sin seguimiento que git no ignora, la carpeta se queda y la salida lo dice. Lo que corra en ella (la sesión del agente, un servidor de desarrollo) se corta. Si el cambio vivía en la carpeta principal, esa carpeta vuelve a la rama principal.
  - impacto: alto
- A5: Solo se incorporan los cambios `standard` y `quick` con rama y en modo `individual`: un `spike` no se fusiona, un `retro` no tiene rama, y las épicas y el modo `team` quedan como hoy.
- A6: Si la carpeta donde está la rama principal tiene cambios sin commit en archivos con seguimiento, `close` se niega antes de tocar nada, porque el fast-forward podría pisarlos. Si aun así el avance falla (por ejemplo, otra sesión movió la principal entre medias), el cambio queda cerrado y archivado, y volver a ejecutar `specty close` reintenta solo la incorporación.

## Criterios de aceptación

- AC1: CUANDO la persona cierra un cambio cuya rama ya contiene la rama principal ENTONCES la principal avanza por fast-forward hasta el commit de archivo, la carpeta donde está la principal tiene los archivos del cambio, y la salida dice que se incorporó a la principal y el SIGUIENTE ya no pide fusionar la rama.
- AC2: CUANDO la rama principal avanzó y se fusiona sin conflictos ENTONCES antes de archivar queda en la rama del cambio un commit de merge con `Specty-Change` hecho tras pasar la verificación, y después la principal avanza por fast-forward e incluye el trabajo de ambas.
- AC3: CUANDO fusionar la rama principal da conflictos ENTONCES `close` no cierra ni archiva, la carpeta del cambio no queda con un merge en curso y su rama no se mueve, y la salida lista los archivos en conflicto y el SIGUIENTE explica cómo incorporar la principal a mano en esa carpeta y volver a ejecutar `specty close`.
- AC4: CUANDO la fusión es limpia pero la verificación falla ENTONCES ocurre lo mismo que en AC3, con la cola de la salida de la verificación en lugar de la lista de conflictos.
- AC5: CUANDO el cambio vive en una worktree ENTONCES tras incorporarse la carpeta deja de existir y la rama `specty/<id>` sigue; CUANDO vive en la carpeta principal ENTONCES esa carpeta queda en la rama principal y limpia.
- AC6: CUANDO la carpeta donde está la rama principal tiene cambios sin commit en archivos con seguimiento ENTONCES `close` se niega antes de tocar nada y nombra la carpeta y los archivos.
- AC7: CUANDO el cambio ya está cerrado pero su rama no está en la principal ENTONCES `specty close` lo incorpora sin volver a archivarlo, y si ya está en la principal no hay nada pendiente.
- AC8: CUANDO se acepta un cambio quick ENTONCES se incorpora igual que al cerrar uno estándar, y con conflictos el cambio sigue en aceptación.
- AC9: CUANDO el cambio es un `spike`, no tiene rama, el modo es `team` o no hay rama principal ENTONCES el cierre es como hoy y el SIGUIENTE propone fusionar la rama.

## Diseño

- `flow/integrate.ts` (nuevo):
  - `integrationOf(session, state)` aplica A1 y A5 y devuelve la rama principal, la del cambio, la carpeta donde está la principal (de `git worktrees()`) y si la carpeta del cambio es la principal; o nada si no se incorpora.
  - `absorbTarget(session, plan)` comprueba A6 y hace A2 hasta el commit de merge. Devuelve si hubo merge (y su commit) o el motivo del rechazo: conflictos (`git diff --name-only --diff-filter=U`, y luego `git merge --abort`), verificación roja o carpeta de la principal con cambios.
  - `landChange(session, plan)` avanza la principal (A2) y deja la carpeta (A4). Si algo falla, lo devuelve como aviso y no lanza.
  - Los textos van en la CLI, junto a los de `close`, como los de `new --worktree`: con core, el cambio pasaría de 2 módulos.
- `flow/worktree.ts`: exporta `mainBranch`.
- `commands/finish.ts`: `close` llama a `absorbTarget` tras la confirmación y antes de la transición; si se rechaza, devuelve el bloqueo sin tocar el estado. Tras `commitArchive`, llama a `landChange` y pasa a `closedCard` la rama solo si no se incorporó. Con el cambio en `done` y su rama fuera de la principal, pide confirmación y hace `absorbTarget` y `landChange` (A6, AC7).
- `commands/accept.ts`: `closeQuick` hace lo mismo antes de escribir el cierre; si se rechaza, el cambio sigue en aceptación.
- La verificación se ejecuta en la carpeta del cambio, con `verify.timeoutSec`, y su cola se muestra con `terminal.note` como en `accept`.

## Archivos

- crear packages/cli/src/flow/integrate.ts — absorber la rama principal, verificar, avanzarla y dejar la carpeta
- modificar packages/cli/src/flow/worktree.ts — exportar `mainBranch`
- modificar packages/cli/src/commands/finish.ts — `close` incorpora el cambio y reintenta si quedó cerrado sin incorporar
- modificar packages/cli/src/commands/accept.ts — el quick se incorpora al aceptar
- crear packages/cli/test/integrate.test.ts — pruebas de punta a punta con worktrees reales
- modificar packages/cli/test/flow.test.ts — el cierre estándar y el quick ahora dejan la carpeta en la rama principal
- modificar docs/ARCHITECTURE.md — §9: incorporación al cerrar; §6: lo que hacen `close` y `accept`

## Tareas

- [x] T1: Incorporar el cambio al cerrar
  - files: packages/cli/src/flow/integrate.ts, packages/cli/src/flow/worktree.ts, packages/cli/src/commands/finish.ts, packages/cli/test/integrate.test.ts, packages/cli/test/flow.test.ts
  - ac: AC1, AC2, AC5, AC9
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/integrate.test.ts test/flow.test.ts
- [x] T2: Conflictos, verificación en rojo, principal con cambios y reintento
  - files: packages/cli/src/flow/integrate.ts, packages/cli/src/commands/finish.ts, packages/cli/test/integrate.test.ts
  - ac: AC3, AC4, AC6, AC7
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/integrate.test.ts
- [x] T3: Incorporar el quick al aceptar
  - files: packages/cli/src/commands/accept.ts, packages/cli/test/integrate.test.ts, packages/cli/test/flow.test.ts
  - ac: AC8
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/integrate.test.ts test/flow.test.ts
- [x] T4: Documentar la incorporación
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm check
  - type: docs

## Riesgos

- R1: Borrar la worktree corta lo que corre en ella, como la sesión del agente o un servidor de desarrollo — A4 lo hace explícito, se pide confirmar al aprobar, y la salida dice la carpeta en la que seguir.
- R2: La verificación tras el merge (en este repo, `pnpm check`) tarda minutos en la terminal de la persona — solo corre cuando la rama principal avanzó; si no, el avance es un fast-forward sin verificar de nuevo, porque el código es el aceptado.
- R3: Otra sesión mueve la rama principal entre la verificación y el avance — `update-ref` con el valor anterior y `merge --ff-only` fallan sin pisar nada, y A6 deja reintentarlo con `specty close`.
