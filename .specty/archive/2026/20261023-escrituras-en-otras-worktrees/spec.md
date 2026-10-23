---
kind: standard
follows:
  - 20261023-cambios-en-paralelo-con-worktrees
---

# Escrituras en otras worktrees

## Objetivo

El guard impide que un agente cambie archivos de otra worktree del repositorio: cada cambio en paralelo se edita solo desde la sesión abierta en su carpeta. Hoy el guard descarta todo lo que queda fuera de la carpeta del agente, así que un agente puede escribir en la carpeta hermana de otro cambio sin que nada lo frene en el momento. Además, una worktree anidada (como las de `.claude/worktrees/`) se juzga como si fuera código propio.

## Fuera de alcance

- Documentar la regla en ARCHITECTURE §10: con core y la CLI, la documentación sería un tercer módulo. Irá en el siguiente cambio que toque docs.
- Los commits hechos tras un `cd` a otra worktree u otro repositorio: el guard sigue mirando los cambios de esta carpeta (pendiente aparte).
- La comprobación tras cada comando de Bash: solo ve esta carpeta, así que lo que un intérprete escriba en otra worktree no se detecta en el momento.
- Los agentes sin hooks del guard (Codex, Gemini CLI…): les quedan los hooks de git y el CI.
- Las rutas con variables sin expandir o tras un `cd` a un destino desconocido: siguen sin juzgarse.

## Supuestos

- A1: Se bloquea cualquier escritura o borrado en otra worktree, aunque git ignore allí el archivo, la ruta no esté gobernada o la carpeta actual no tenga cambio activo, porque una sesión trabaja solo en su carpeta.
  - impacto: alto
- A2: Cada ruta pertenece a la worktree cuya carpeta la contiene más de cerca, así que una worktree anidada es dueña de sus archivos y, desde ella, la carpeta principal es otra worktree.
- A3: Las rutas se comparan tal como las da la herramienta, resueltas contra su `cwd`, como ya hace el guard; la worktree propia se reconoce por su ruta real y gana los empates.
- A4: Las lecturas no se juzgan: leer otra worktree, por ejemplo para comparar, sigue permitido.
- A5: Las worktrees se listan con `git worktree list` solo cuando la acción tiene rutas: es una llamada a git más por evento, dentro del objetivo de p95 < 200 ms.

## Criterios de aceptación

- AC1: CUANDO un agente escribe o borra con sus herramientas un archivo de otra worktree del repositorio ENTONCES el guard lo bloquea nombrando esa carpeta y su rama, y el SIGUIENTE le pide trabajar en su propia carpeta, haya o no un cambio activo en ella.
- AC2: CUANDO un comando de shell escribe o borra en otra worktree (por ejemplo, `echo x > ../otra/src/a.ts`) ENTONCES el guard lo bloquea igual.
- AC3: CUANDO la ruta está en una worktree anidada dentro de la carpeta actual (por ejemplo, `.claude/worktrees/x/src/a.ts`) ENTONCES cuenta como otra worktree, y desde la anidada la carpeta principal también.
- AC4: CUANDO la ruta está en la propia carpeta, o fuera de cualquier worktree del repositorio, ENTONCES el guard decide como hoy.
- AC5: CUANDO el agente es Cursor ENTONCES la escritura en otra worktree se rechaza con `permission: deny` y el mismo motivo.

## Diseño

- `core/src/guard/worktrees.ts` (nuevo): `ForeignPath` (la ruta, la carpeta de la worktree que la contiene y su rama, si no está desacoplada) y `foreignDenial(foreign, lang)`, que devuelve el motivo y el siguiente paso.
- `core/src/guard/decide.ts`: las acciones de escritura y borrado y `ShellFacts` llevan `foreign` (opcional, para no tocar a quien no lo usa), y hay una regla nueva, `worktree`. Se decide antes que las rutas propias y sin mirar la fase (A1).
- `cli/src/io/git.ts`: `worktrees()` devuelve carpeta y rama (`branch refs/heads/…` del formato `--porcelain`), y `resolved` se exporta para reconocer la worktree propia.
- `cli/src/flow/worktree.ts`: `placePaths(git, rutas)` asigna cada ruta absoluta a la worktree más profunda que la contiene (A2 y A3). Las de la propia salen como rutas relativas; las de otra, como `ForeignPath`; las que no tienen dueño se descartan, como hoy.
- `cli/src/enforce/guard.ts`: `inRepo` usa `placePaths`, sigue descartando lo que git ignora en la carpeta propia y devuelve aparte las rutas de otras worktrees, que `resolveAction` añade a la acción.

## Archivos

- crear packages/core/src/guard/worktrees.ts — `ForeignPath` y el motivo del bloqueo
- modificar packages/core/src/guard/decide.ts — campo `foreign` en las acciones y regla `worktree`
- modificar packages/core/src/index.ts — exportar `ForeignPath`
- modificar packages/core/test/guard/decide.test.ts — casos de la regla
- modificar packages/cli/src/io/git.ts — `worktrees()` con carpeta y rama; exportar `resolved`
- modificar packages/cli/src/flow/worktree.ts — `placePaths`: a qué worktree pertenece cada ruta
- modificar packages/cli/src/enforce/guard.ts — separar las rutas de otras worktrees
- modificar packages/cli/test/worktrees.test.ts — el guard de punta a punta, con Claude Code y Cursor

## Tareas

- [x] T1: La regla de otras worktrees en core
  - files: packages/core/src/guard/worktrees.ts, packages/core/src/guard/decide.ts, packages/core/src/index.ts, packages/core/test/guard/decide.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/guard/decide.test.ts
- [x] T2: El guard separa las rutas de otras worktrees
  - files: packages/cli/src/io/git.ts, packages/cli/src/flow/worktree.ts, packages/cli/src/enforce/guard.ts, packages/cli/test/worktrees.test.ts
  - ac: AC1, AC2, AC3, AC4, AC5
  - verify: pnpm check

## Riesgos

- R1: Si la worktree propia se tomara por otra, el guard bloquearía todas las escrituras de la sesión — la propia se reconoce por su ruta real y gana los empates, y los tests cubren la carpeta principal, una hermana y una anidada.
- R2: Una llamada más a git en cada evento con rutas suma latencia al guard — solo se hace cuando la acción tiene rutas, y se mide con el CLI compilado antes de cerrar.

## Cierre

### Resumen

El guard bloquea que un agente escriba o borre en otra worktree del repositorio, con sus herramientas o por shell (`echo >` y `rm`), y nombra la carpeta y la rama de esa worktree. Cubre una carpeta hermana, una anidada como `.claude/worktrees/x` y, desde una anidada, la carpeta principal. Dentro de la propia carpeta y fuera de cualquier worktree decide como antes. Responde en el formato de cada agente: salida 2 en Claude Code y `permission: deny` en Cursor. Con el CLI compilado, en este repo con tres worktrees, el p95 del guard pasa de 100 a 110 ms, dentro del objetivo de 200.

### Desviaciones

- **Ninguna respecto al plan.** La primera verificación de T2 falló en un test de la UI ajeno al cambio (`toast.test.ts`, por un timeout de 5 s) con la máquina a carga 17 por tres sesiones en paralelo; ese test pasa aislado, y al repetir la verificación pasó todo.

### Decisiones

- **`foreign` es opcional en las acciones:** así no cambian la comprobación tras cada comando de Bash (`decideAfterShell`) ni nadie que construya acciones sin rutas ajenas.
- **La regla vive en su propio archivo de core (`guard/worktrees.ts`),** porque `decide.ts` ya rozaba el máximo de 300 líneas; queda en 291.
- **La worktree propia se reconoce por su ruta real y gana los empates,** mientras que las rutas de la herramienta se comparan tal como llegan, como ya hacía el guard (A3).
- **Una worktree desacoplada se nombra solo por su carpeta,** porque no tiene rama.
- **A1, confirmado al aprobar:** se bloquea todo lo que está en otra worktree, aunque git lo ignore allí o la carpeta actual no tenga un cambio activo.

### Pendientes

- **La línea de ARCHITECTURE §10 sobre esta regla:** el límite de 2 módulos la dejó fuera. Propuesta: que las rutas no gobernadas, como `docs/` y `*.md`, no cuenten como módulo.
- **Los commits tras un `cd` a otra worktree u otro repositorio** se siguen juzgando con los cambios de esta carpeta.
- **Lo que un intérprete escribe en otra worktree** no lo ve la comprobación tras cada comando de Bash, que solo mira esta carpeta.
- **Un test de la UI inestable con carga:** `toast.test.ts` falsea `setTimeout` antes de `whenStable()`; si los falseara después de `render()`, sería determinista.
- **`specty status` y los comandos de la persona sobre todas las worktrees,** eligiendo el cambio por su fase: el siguiente cambio de la serie.
