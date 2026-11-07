---
kind: epic
---

# Las verificaciones limitan sus procesos según la memoria disponible

## Objetivo

Las herramientas de tests arrancan un proceso por núcleo sin mirar la memoria: en el Mac del usuario (14 núcleos, 24 GB), Vitest y `ng test` lanzan 13 de unos 300–370 MB cada uno, una verificación completa llegó a 5,6 GB y la máquina vive en swap (13,7–17,3 GB usados). Con este cambio, Specty calcula al arrancar cada comando de una verificación cuántos procesos le caben, por la memoria disponible, los núcleos y las plazas que ocupa, y pone ese número en las variables de entorno que la persona nombra en `verify.processes.env` (en este repo, `VITEST_MAX_WORKERS`).

## Fuera de alcance

- Que `specty init` proponga la variable de cada herramienta al detectarla (Vitest, pytest-xdist…): otro cambio.
- Los comandos de `specty check` (`checks.commands`), `review.command`, `git.setup` y `git.afterLanding`: no son verificaciones.
- Medir o recortar la memoria mientras el comando corre: el número se calcula una vez, al arrancar cada comando.
- Cambiar `verify.slots`, la prioridad (`internal.exec.priority`) o el turno de la verificación completa.
- Escribir la configuración de las herramientas del proyecto o la entrada de `.specty/config.yaml` de este repo: la añade la persona.

## Supuestos

- A1: Cada verificación cuenta con la parte de la máquina de sus plazas: la de una tarea (también la que comprueba los tests en rojo), 1 de `verify.slots`; la completa, sus unidades y `verify --fresh`, todas. El número es el menor entre los núcleos de esa parte y los procesos de `verify.processes.memoryMiB` que caben en esa parte de la memoria disponible, redondeados hacia abajo y nunca menos de 1. La memoria se mide al arrancar cada comando, así que ya descuenta lo que ocupan las verificaciones en curso y lo demás de la máquina.
  - impacto: alto
- A2: 512 MiB por proceso por defecto: los workers de Vitest y de `ng test` medidos ocupan 300–370 MB, y el resto deja margen para el proceso principal y la cobertura. Con la memoria de ahora (6,7 GB disponibles), la completa sigue con 13 procesos y la de una tarea baja a 6; con la máquina en swap bajan las dos.
  - impacto: alto
- A3: En macOS, la memoria disponible es la que el Monitor de Actividad no cuenta como usada: las páginas libres, las de archivos y las purgables de `vm_stat`, por su tamaño de página. `os.freemem()` solo cuenta las libres (2,5 GB ahora; unos 60 MB con el swap lleno) y `process.availableMemory()` suma las inactivas (9,2 GB ahora), que con el swap lleno hay que comprimir o escribir a disco. En los demás sistemas, y si `vm_stat` falla, la de `process.availableMemory()`, que en Linux es `MemAvailable` y respeta el límite del cgroup.
- A4: Specty no sabe qué variable lee cada herramienta: sin `verify.processes.env` no cambia nada. La persona nombra las suyas (Vitest lee `VITEST_MAX_WORKERS` de forma nativa, también bajo `ng test`: medido aquí, la suite de la UI pasó de 5,38 GB de pico con 15 procesos a 2,93 GB con 4, y siguió en verde).
- A5: Si una de esas variables ya trae en el entorno un entero positivo menor, se queda ese: es una elección de la persona.
- A6: Cada comando de verificación dice en una línea por la salida de error el número, las variables, la memoria disponible, los núcleos y sus plazas, para que la persona sepa por qué tarda más.

## Criterios de aceptación

- AC1: CUANDO `verify.processes.env` nombra variables y corre la verificación de una tarea, la completa o `specty verify --fresh` ENTONCES cada comando recibe en cada variable el mismo número: como mucho los núcleos de su parte de plazas (con 2 plazas, la mitad para la de una tarea y todos para la completa) y nunca menos de 1.
- AC2: CUANDO la memoria disponible de su parte de plazas no llega para más procesos de `verify.processes.memoryMiB` ENTONCES el número baja hasta los que caben, y es 1 si no cabe ninguno.
- AC3: CUANDO una de esas variables ya trae en el entorno un entero positivo menor que el número ENTONCES el comando la recibe con ese valor.
- AC4: CUANDO la configuración no tiene `verify.processes.env` ENTONCES los comandos de verificación no reciben ninguna variable nueva y no sale la línea de AC6.
- AC5: CUANDO Specty mide la memoria disponible en macOS ENTONCES suma las páginas libres, las de archivos y las purgables de `vm_stat` por su tamaño de página; en otro sistema, o si `vm_stat` no da esas cifras, usa `process.availableMemory()`.
- AC6: CUANDO un comando de verificación recibe el número ENTONCES sale por la salida de error una línea, en español y en inglés, con el número, las variables, la memoria disponible en GB, los núcleos y las plazas que ocupa.
- AC7: CUANDO `.specty/config.yaml` da `verify.processes` ENTONCES `env` es una lista de nombres de variable (letras, cifras y `_`, sin empezar por cifra) y `memoryMiB` un entero de 1 o más; sin ellas, ninguna variable y 512, y la página Configuración muestra las dos en Verificación.

## Diseño

- `core/schema/verify.ts`: `verify.processes` resuelto siempre, `{ env: [], memoryMiB: 512 }` por defecto.
- `core/settings/catalog.ts` y `core/cards/settings.ts`: `verify.processes.env` (lista) y `verify.processes.memoryMiB` (número) en la sección Verificación, con su nombre y descripción en es/en.
- `core/cards/processes.ts` (nuevo): `processBudgetNote(view, lang)`, la línea de AC6.
- `cli/io/memory.ts` (nuevo): `availableMemory(cwd)` y el lector puro de la salida de `vm_stat`.
- `cli/flow/process-budget.ts` (nuevo): `processBudget(...)`, el cálculo puro de A1, y `budgetedEnv(session, places)`, que mide, calcula, dice la línea y devuelve el entorno con las variables.
- `cli/flow/live-run.ts`: cada comando arranca con `budgetedEnv`: una plaza con tarea, todas sin ella (la completa y las unidades que ya tienen las plazas); `cli/commands/verify.ts`: los intentos de `verify --fresh` fuera de un cambio, con todas.

## Cortes

- C1: Cada comando de verificación recibe en las variables de verify.processes un número de procesos según sus núcleos y sus plazas
  - ac: AC1, AC3, AC4, AC7
- C2: El número de procesos baja cuando la memoria disponible no alcanza para más
  - ac: AC2, AC5
  - depends: C1
- C3: La verificación dice cuántos procesos usa y por qué
  - ac: AC6
  - depends: C1

## Riesgos

- R1: Con menos procesos, una suite tarda más y puede rozar `verify.timeoutSec` — la línea de AC6 dice el número, y `memoryMiB` lo ajusta; la suite de la UI con 2 procesos tardó 90–115 s frente a 108 s con 13.
- R2: Una medida que sobrestime la memoria en otro sistema deja el número como hoy — en Linux `MemAvailable` es la medida del propio kernel, y en el resto `process.availableMemory()` nunca da más que la memoria libre.
- R3: Dos verificaciones que arrancan a la vez miden la misma memoria — cada una toma solo la parte de sus plazas.

## Cierre

### Resumen

Cada comando de una verificación recibe en las variables de `verify.processes.env` cuántos procesos puede lanzar, y lo dice. Se aplica a la verificación de una tarea, la de los tests en rojo, la completa y cada una de sus unidades, `specty verify --fresh` y la completa de la UI.

- C1 (cbc8a05) añadió `verify.processes` (`env` y `memoryMiB`, 512 por defecto) y el número por núcleos × plazas / `verify.slots`. Una variable que ya trae un entero menor se queda con el suyo.
- C2 (6765424) lo baja a los procesos de `memoryMiB` que caben en la parte de la memoria disponible que le toca. La memoria se mide en macOS con `vm_stat` (libres + archivos + purgables) y en el resto con `process.availableMemory()`.
- C3 (a60cdc0) lo dice en una línea por la salida de error, en es/en, con el número, las variables, la memoria en GB, los núcleos y las plazas.

La persona añadió `verify.processes.env: ["VITEST_MAX_WORKERS"]` a este repo (350f004). Medido aquí: con `VITEST_MAX_WORKERS=2`, la suite de la UI bajó de 5,38 GB a 2,93 GB de pico y siguió en verde. Siguen abiertos en la memoria P358 (`settings/catalog.ts` y `cards/settings.ts` pasan del aviso de 300 líneas) y P364 (la trazabilidad de C2 cuenta para su AC1 los tests de `memory.test.ts`).

### Desviaciones

- La épica empezó como un cambio normal. Se canceló y se volvió a crear con `specty new --kind epic`, con la misma spec.
- C3 se hizo después de C2, no en paralelo: su línea dice la memoria que mide C2.
- C2 escribió por error sus tests en `packages/cli/test/memory.test.ts`, que ya tenía los de `specty memory`. Con el desbloqueo S1 de la persona, ese archivo volvió a su versión de main, y los tests de C2 están en `available-memory.test.ts`.

### Decisiones

- La completa que lanza la UI (`server/runs.ts`) también recibe el número, aunque el Diseño no la nombraba: es «la completa».
- La línea la dice `budgetedEnv`, no cada sitio que arranca un comando: sale una vez por comando en todos.
- Los tests usan variables propias (`PROCESOS_A`, `PROCESOS_B`) y `memoryMiB: 1` donde esperan los núcleos, para no depender de la memoria ni de las variables de quien los ejecuta.

### Pendientes

- Ninguno nuevo.
