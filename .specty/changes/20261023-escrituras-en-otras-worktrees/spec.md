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
- [ ] T2: El guard separa las rutas de otras worktrees
  - files: packages/cli/src/io/git.ts, packages/cli/src/flow/worktree.ts, packages/cli/src/enforce/guard.ts, packages/cli/test/worktrees.test.ts
  - ac: AC1, AC2, AC3, AC4, AC5
  - verify: pnpm check

## Riesgos

- R1: Si la worktree propia se tomara por otra, el guard bloquearía todas las escrituras de la sesión — la propia se reconoce por su ruta real y gana los empates, y los tests cubren la carpeta principal, una hermana y una anidada.
- R2: Una llamada más a git en cada evento con rutas suma latencia al guard — solo se hace cuando la acción tiene rutas, y se mide con el CLI compilado antes de cerrar.
