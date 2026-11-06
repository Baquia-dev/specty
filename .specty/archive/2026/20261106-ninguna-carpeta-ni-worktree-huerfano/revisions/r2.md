---
kind: epic
---

# Ninguna carpeta ni worktree huérfano

## Objetivo

Hoy quedan carpetas y worktrees huérfanos por cuatro vías (P198): una herramienta que escribe en la carpeta de un cambio ya quitada la vuelve a crear, sin git; la ligadura de una conversación a su carpeta la retiene un día aunque la conversación haya terminado; git guarda registros de worktrees cuya carpeta ya no existe, que Specty nunca poda; y quedan carpetas vacías en `.specty/changes/`. Además, la carpeta de un cambio terminado con algo sin commit no se quita nunca. Con esta épica, el guard no deja recrear esas carpetas, el fin de una conversación libera la suya, la limpieza poda y quita todo lo huérfano guardando antes lo que tenga en una ref de rescate, y `doctor` y `status` dicen si queda algo.

## Fuera de alcance

- Quitar la carpeta de un cambio abierto, o la de uno terminado en la que trabaja una conversación viva según el guard: siguen quedándose.
- Borrar ramas: la limpieza de ramas de `prune` sigue igual.
- Las carpetas fuera de `.worktrees/` y de la carpeta hermana `<repo>.worktrees/` (ADR 0018): Specty no barre otras.
- La UI: no muestra los huérfanos.
- Borrar las refs de rescate: quedan hasta que la persona las borre.

## Supuestos

- A1: Una carpeta fantasma es una entrada de `.worktrees/` o de la carpeta hermana (`formerWorktreesHome`) que no es una worktree registrada en git. Una escritura de un agente dentro de una (herramienta de archivos, o lo que el análisis del shell sabe que escribe o borra) se niega; hoy el guard la atribuye a la carpeta principal y la descarta porque git ignora `.worktrees/`, o la descarta por estar fuera de toda worktree.
  - impacto: alto
- A2: La negativa de A1 dice que esa carpeta ya no es la de ningún cambio (se quitó al cerrarlo o cancelarlo, o se borró) y pide salir de ella y seguir en la carpeta principal, como el SIGUIENTE de `close` (en Claude Code, `ExitWorktree`). Si el nombre es el de un cambio abierto que perdió su carpeta, propone `specty restore <id>`.
  - impacto: medio
- A3: Cuando la herramienta del agente avisa de que su conversación terminó (hoy, `SessionEnd` de Claude Code, también con `/clear`), el guard no borra su ligadura (`common/specty/sessions/<id>.json`), porque sirve para devolverla a su carpeta si se reanuda: la marca con `ended`. La limpieza no cuenta una ligadura con `ended`; un `SessionStart` de esa misma conversación (`resume`) le quita la marca. Las herramientas sin ese aviso siguen con el plazo de un día.
  - impacto: alto
- A4: La limpieza (`specty prune`, y también al final de `new`, `close` y `cancel`) ejecuta `git worktree prune` (git no poda las bloqueadas), quita las carpetas de cambios terminados aunque tengan algo sin commit, barre las carpetas fantasma de `.worktrees/` y de la carpeta hermana, borra la carpeta hermana si queda vacía, y quita las carpetas sin archivos de `.specty/changes/` en la carpeta principal y en cada worktree. No toca una carpeta fantasma con el nombre de un cambio abierto que perdió la suya: la recupera `specty restore`.
  - impacto: alto
- A5: Antes de quitar algo que tiene archivos que git no ignora y que no están en un commit, la limpieza los guarda en una ref de rescate, `refs/specty/rescue/<nombre>/<AAAAMMDDHHMMSS>`: un commit hecho con un índice temporal (`GIT_INDEX_FILE`), con la carpeta como árbol de trabajo (`--work-tree`) y `commit-tree`, sin tocar ninguna rama ni el índice de nadie. Encima del commit de la rama si la carpeta era una worktree; sin padre si era una carpeta fantasma. Lo que git ignora se va con la carpeta. Si el rescate falla, la carpeta queda y la salida dice por qué. `cancel` sigue guardando lo suyo en la rama del cambio, como hoy.
  - impacto: alto
- A6: `specty doctor` avisa de cada tipo de huérfano con cuántos hay y remite a `specty prune`, y cuenta las refs de rescate con cómo ver una (`git log -p <ref>`) y recuperarla (`git worktree add <carpeta> <ref>`); `specty status` añade una línea con el total y `specty prune`. Sin huérfanos no dicen nada.
  - impacto: medio
- A7: Todo texto nuevo está en español y en inglés, en `packages/core/src/cards/`.

## Criterios de aceptación

- AC1: CUANDO un agente escribe o borra, con su herramienta de archivos o con un comando de shell, dentro de una carpeta de `.worktrees/` o de la carpeta hermana que no es una worktree registrada ENTONCES el guard lo niega antes de que ocurra, y la negativa dice que esa carpeta ya no es la de ningún cambio y le pide salir de ella y seguir en la carpeta principal, o `specty restore <id>` si es la de un cambio abierto sin carpeta.
- AC2: CUANDO un agente escribe dentro de una worktree registrada de `.worktrees/`, o fuera de esas dos carpetas ENTONCES el guard lo juzga como hasta ahora.
- AC3: CUANDO la herramienta del agente avisa de que su conversación terminó ENTONCES la carpeta a la que estaba ligada ya no se queda por ella en la limpieza; CUANDO esa conversación se reanuda ENTONCES vuelve a contar y `next` la sigue devolviendo a su carpeta.
- AC4: CUANDO se ejecuta `specty prune`, o terminan `new`, `close` o `cancel`, y git tiene registros de worktrees cuya carpeta ya no existe ENTONCES esos registros desaparecen (salvo los bloqueados), sin que dejen de detectarse los cambios abiertos sin carpeta, y la salida de `prune` dice cuántos.
- AC5: CUANDO la limpieza encuentra la carpeta de un cambio terminado con algo sin commit, y ninguna conversación viva trabaja en ella ENTONCES guarda eso en una ref de rescate encima del commit de su rama, quita la carpeta, y la salida nombra la ref y cómo recuperarla.
- AC6: CUANDO en `.worktrees/` o en la carpeta hermana hay una carpeta fantasma que no es la de un cambio abierto sin carpeta ENTONCES la limpieza guarda en una ref de rescate lo que git no ignora de ella, si hay algo, y la borra; y borra la carpeta hermana si queda vacía. CUANDO es la de un cambio abierto sin carpeta ENTONCES no la toca.
- AC7: CUANDO una carpeta de `.specty/changes/` no tiene ningún archivo ENTONCES la limpieza la borra.
- AC8: CUANDO el rescate de una carpeta falla ENTONCES la carpeta y lo que tiene se quedan, y la salida dice por qué.
- AC9: CUANDO hay huérfanos de algún tipo (registros sin carpeta, carpetas de cambios terminados, carpetas fantasma, carpetas vacías de `.specty/changes/`) ENTONCES `specty doctor` avisa de cada tipo con cuántos hay y remite a `specty prune`, y `specty status` lo dice en una línea; CUANDO no hay ninguno ENTONCES no dicen nada.
- AC10: CUANDO hay refs de rescate ENTONCES `specty doctor` dice cuántas, con cómo ver una y recuperarla.
- AC11: CUANDO salen los textos nuevos ENTONCES salen en español y en inglés.

## Diseño

- C1, guard: `enforce/place.ts` separa, de las rutas que escribe o borra una acción, las que caen en una carpeta fantasma (`.worktrees/<nombre>` o `<repo>.worktrees/<nombre>` sin worktree registrada) y se las pasa a core como un hecho nuevo; core (`guard/`) las niega con una regla propia y su texto en `cards/`. `store/local.ts` lee y escribe `ended` en la ligadura; `enforce/guard.ts` la marca en el evento de fin de conversación y la desmarca en el `SessionStart` de esa conversación; `workingFolders` (`flow/prune.ts`) no cuenta las marcadas.
- C2, limpieza: `flow/orphans.ts`, nuevo, encuentra los huérfanos de cada tipo (lo reutiliza C3); `flow/rescue.ts`, nuevo, guarda una carpeta en una ref de rescate; `flow/prune.ts` (`removeFinished`) los usa, y `commands/prune.ts`, `new`, `close` y `cancel` llaman a la limpieza. `pruneCard` dice lo nuevo.
- C3, avisos: `commands/doctor.ts` y `commands/status.ts` cuentan los huérfanos con `flow/orphans.ts` y las refs de rescate; sus textos en `cards/`.
- Docs: ARCHITECTURE §9 (la limpieza y el guard), formats.md §1 (`ended` en `sessions/`, las refs de rescate) y la salida de `prune`.

## Cortes

- C1: El guard no deja recrear carpetas quitadas y el fin de una conversación libera la suya
  - ac: AC1, AC2, AC3, AC11
- C2: La limpieza no deja huérfanos y rescata lo que tienen
  - ac: AC4, AC5, AC6, AC7, AC8, AC11
  - depends: C1
- C3: doctor y status dicen si quedan huérfanos y refs de rescate
  - ac: AC9, AC10, AC11
  - depends: C2

## Riesgos

- R1: Barrer una carpeta de `.worktrees/` que no es de Specty (algo que la persona puso allí) — se rescata antes en una ref, así que no se pierde; ADR 0018 hace de `.worktrees/` la carpeta de Specty.
- R2: Una carpeta fantasma grande (con dependencias que git no ignora) hace lento el rescate o la ref pesada — git solo guarda lo que no ignora; la salida dice el tamaño si pasa de un umbral, a decidir en C2.
- R3: Podar los registros de git rompe la detección de los cambios abiertos sin carpeta o `specty restore` — un cambio sin carpeta se detecta por su rama, no por el registro, y `restore` ya quita esos registros; C2 lo comprueba con un test.
- R4: Marcar `ended` en `/clear` hace que la limpieza quite una carpeta a la que la conversación nueva querría volver — tras `/clear` la conversación es otra y no estaba ligada; la de antes, si se reanuda, recupera su ligadura.
