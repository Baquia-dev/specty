---
kind: standard
---

# Una verificación no arranca en una carpeta donde ya corre otra de Specty

## Objetivo

La unidad `ui` de la verificación completa falló en `accept` porque otro Vitest de la misma carpeta de cambio seguía usando la carpeta de cobertura (P144). En main sigue abierto: las plazas de `verify.slots` solo cuentan cuántas verificaciones corren en el clon, no en qué carpeta, y los comandos del proyecto que ejecuta `specty check` (formato, lint, tipos y tests) no pasan por ellas. Con este cambio, una verificación de Specty no arranca en una carpeta donde corre otra de otro proceso: espera a que acabe y lo dice, y los comandos de `specty check` esperan igual a la verificación de su carpeta y la marcan mientras corren, con el mismo registro de las plazas.

## Fuera de alcance

- Los comandos que siguen vivos después de que su proceso de Specty muriera (matado desde fuera): su archivo deja de contar al morir el proceso, como hoy. Queda como pendiente.
- Dar a los comandos de `specty check` plazas o el entorno de `verify.processes`: siguen sin ser verificaciones.
- Que dos `specty check` a la vez en la misma carpeta se esperen entre sí.
- El turno de la verificación completa (`full-verification.json` y su cola), que no cambia.

## Supuestos

- A1: P144 sigue abierta en main: `commandCheck` (`check/commands.ts`) ejecuta los comandos del proyecto con `execute`, sin `inSlots`, y `inSlots` (`store/verify-slots.ts`) solo mira las plazas libres; así, el `pnpm test` de un `specty check --changed` (a mano, en el `task done` de una tarea sin verificación o al terminar el turno con la marca de `check --install`) corre a la vez que la verificación completa de `accept` en la misma carpeta, y dos verificaciones de una plaza en la misma carpeta también pueden juntarse.
  - impacto: alto
- A2: La carpeta de una verificación es la `folder` de su archivo en `locks/verify-slots/`, la raíz de la sesión (`session.root`), y todos los procesos la calculan igual a partir de git, así que basta compararla como texto.
  - impacto: medio
- A3: Un comando de verificación que a su vez ejecuta Specty en su carpeta (por ejemplo, un `verify.full` con `specty check --all`) desciende del proceso dueño del archivo de esa verificación; si lo esperara, se esperaría a sí mismo hasta `verify.timeoutSec`. Los antecesores de un proceso salen de la tabla de `ps -A -o pid=,ppid=` que ya usa `endTree`, y donde no hay `ps` (Windows) solo cuenta el padre (`process.ppid`).
  - impacto: medio
- A4: Un comando de `specty check` no es una verificación (formats.md §6): no ocupa plazas, no hace la cola de las plazas y no espera a otro comando de `check`; solo espera a las verificaciones de su carpeta y la marca mientras corre con un archivo de peso 0 en `locks/verify-slots/`. Si no puede escribir ese archivo, como en un sandbox que no deja escribir en `.git`, corre igualmente sin marca.
  - impacto: medio
- A5: Una verificación ya primera en la cola que espera a que su carpeta quede libre hace esperar a las que llegaron detrás, como ya hace la que espera más plazas de las libres: es raro y dura lo que tarde un comando de esa misma carpeta.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO una verificación de Specty (la de una tarea, la que comprueba los tests en rojo o la completa) va a empezar en una carpeta donde corre la verificación de otro proceso vivo ENTONCES no arranca su comando hasta que esa acaba, aunque haya plazas libres, dice una sola vez por la salida de error qué comando corre en esa carpeta y desde cuándo, y después corre; si la otra corre en otra carpeta y queda una plaza libre, corre en el acto y no dice nada, como hoy.
- AC2: CUANDO `specty check` va a ejecutar un comando del proyecto en una carpeta donde corre la verificación de otro proceso vivo ENTONCES espera a que acabe, lo dice una sola vez por la salida de error y después lo ejecuta; mientras un comando de `specty check` de otro proceso corre en una carpeta, una verificación que llega a ella espera a que acabe; y aunque las verificaciones de otras carpetas ocupen todas las plazas, `specty check` ejecuta sus comandos en el acto, sin avisar, y su marca no ocupa plaza.
- AC3: CUANDO la verificación que corre en la carpeta es de este mismo proceso o de uno que lo lanzó, directa o indirectamente ENTONCES ni una verificación ni un comando de `specty check` la esperan por la carpeta.
- AC4: CUANDO se leen formats.md §1 y ARCHITECTURE §9 ENTONCES explican que una verificación no arranca en una carpeta donde corre otra de otro proceso, la marca de peso 0 de los comandos de `specty check`, quién no cuenta (el propio proceso y los que lo lanzaron) y cómo se resuelven dos que llegan a la vez.
  - test: manual

## Diseño

- `store/verify-slots.ts`: cada archivo de `locks/verify-slots/` que se lee lleva su nombre, que empieza por su hora de llegada. `inSlots` empieza solo si, además de caber en las plazas, ningún archivo ajeno corre en su carpeta (ajeno: de otro proceso que no sea uno de sus antecesores). Tras escribir el suyo vuelve a mirar: si un archivo ajeno de su carpeta tiene un nombre anterior al suyo, lo borra y sigue esperando, así que de dos que llegan a la vez corre la que escribió antes. Avisa una vez de la carpeta (`verifyFolderWaitNote`) y una vez de las plazas. `inFolder(session, command, run)` hace lo mismo para un comando de `specty check`, sin cola ni plazas: espera a que ninguna verificación ajena (peso 1 o más) corra en su carpeta, escribe un archivo de peso 0 mientras corre y, si no puede escribirlo, corre sin él. Un archivo de peso 0 se lee como 0, y no como 1. Los antecesores solo se buscan cuando hay un archivo de otro proceso en la carpeta.
- `io/exec.ts`: `ancestors()`, los procesos que lanzaron este, del padre hacia arriba, con la misma tabla de `ps` de `endTree`.
- `check/commands.ts`: `commandCheck` ejecuta su comando dentro de `inFolder`.
- core `cards/lock.ts`: `verifyFolderWaitNote(running, lang)`, exportado en `cards/index.ts`.
- Docs: formats.md §1 (el archivo de peso 0 y la regla de la carpeta) y el párrafo «Plazas de verificación» de ARCHITECTURE §9.

## Archivos

- modificar packages/core/src/cards/lock.ts — el aviso de la espera por la carpeta
- modificar packages/core/src/cards/index.ts — exportar el aviso
- crear packages/core/test/cards/folder-wait.test.ts — el texto del aviso, en español y en inglés
- modificar packages/cli/src/io/exec.ts — los antecesores de este proceso
- modificar packages/cli/src/store/verify-slots.ts — la carpeta en las plazas y la marca de los comandos de `specty check`
- crear packages/cli/src/store/verify-folder.test.ts — AC1, AC2 y AC3 en las plazas
- modificar packages/cli/src/check/commands.ts — los comandos del proyecto dentro de `inFolder`
- crear packages/cli/test/check-folder.test.ts — AC2 y AC3 en `specty check`
- modificar docs/formats.md — el archivo de peso 0 y la regla de la carpeta
- modificar docs/ARCHITECTURE.md — la regla de la carpeta en las plazas

## Tareas

- [x] T1: Una verificación espera a la de otro proceso en su carpeta, y lo dice
  - files: packages/core/src/cards/lock.ts, packages/core/src/cards/index.ts, packages/core/test/cards/folder-wait.test.ts, packages/cli/src/io/exec.ts, packages/cli/src/store/verify-slots.ts, packages/cli/src/store/verify-folder.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/folder-wait.test.ts test/cards/lock.test.ts && pnpm --filter @baquia-dev/specty exec vitest run src/store/verify-folder.test.ts src/store/verify-slots.test.ts src/store/turn-queue.test.ts && pnpm lint
  - type: fix
- [x] T2: Los comandos de `specty check` esperan a la verificación de su carpeta y la marcan mientras corren
  - files: packages/cli/src/check/commands.ts, packages/cli/test/check-folder.test.ts
  - ac: AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-folder.test.ts test/check-commands.test.ts && pnpm lint && pnpm typecheck
  - type: fix
- [x] T3: La documentación de la regla de la carpeta
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC4
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: Una verificación que espera a su carpeta por un archivo que nunca se libera se quedaría parada. Mitigación: el archivo de un proceso que ya no existe no cuenta, como hoy, y el comando de quien lo tiene se corta a los `verify.timeoutSec`.
- R2: Un comando de verificación que ejecuta Specty en su propia carpeta se esperaría a sí mismo. Mitigación: los archivos del propio proceso y de sus antecesores no cuentan (AC3).
- R3: `specty check` dentro de un sandbox que no deja escribir en `.git` dejaría de ejecutar sus comandos. Mitigación: sin poder escribir la marca, corre sin ella.

## Cierre

### Resumen

P144 seguía abierta en main: las plazas solo contaban cuántas verificaciones corren en el clon, y los comandos del proyecto de `specty check` no pasaban por ellas. Ahora `inSlots` (`store/verify-slots.ts`) no empieza mientras otro proceso tiene un archivo en `locks/verify-slots/` con su misma carpeta, aunque haya plazas libres, y lo dice una vez con `verifyFolderWaitNote`; de dos que llegan a la vez corre la que escribió antes su archivo. Los comandos de `specty check` corren en `inFolder`: esperan a la verificación de otro proceso en su carpeta y la marcan mientras corren con un archivo de peso 0, que no ocupa plaza. No cuentan los archivos del propio proceso ni los de sus antecesores (`ancestors` en `io/exec.ts`, con la tabla de `ps` de `endTree`). formats.md §1 y ARCHITECTURE §9 («Una verificación por carpeta») lo explican.

### Desviaciones

- El test del aviso en core (`packages/core/test/cards/folder-wait.test.ts`) se escribió en T1 y no en la fase de tests: la verificación de T1 encadena con `&&` los tests de core y los del CLI, así que el fallo en rojo de core cortaba la cadena antes de que corrieran los del CLI, y `propose` pedía que la salida nombrara `verify-folder.test.ts`. El texto en español del aviso ya lo fijaban los tests bloqueados del CLI.
- El aviso de las plazas solo nombra las verificaciones que las ocupan, no las marcas de peso 0 de `specty check`.

### Decisiones

- Los antecesores se buscan una vez por proceso y solo cuando hay un archivo de otro proceso en la carpeta, así que el camino normal no lanza `ps`.
- La verificación que, primera en la cola, espera a su carpeta no deja pasar a las de detrás, como ya hacía la que espera más plazas de las libres (A5).
- El aviso CWE-78 de `check/commands.ts` es la misma llamada a `execute` con shell de antes, movida dentro de `inFolder`.

### Pendientes

- Un comando de verificación que sigue vivo después de que su proceso de Specty muriera (matado desde fuera) ya no cuenta: su archivo deja de contar con el proceso, y otra verificación puede arrancar en esa carpeta mientras él sigue. Se podría guardar también el pid del comando en el archivo, o cortar el árbol del comando cuando Specty recibe SIGTERM o SIGINT.
