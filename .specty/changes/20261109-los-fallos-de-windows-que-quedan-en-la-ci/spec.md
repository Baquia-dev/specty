---
kind: standard
follows:
  - 20261109-los-ultimos-fallos-de-windows-del-ci
---

# Los fallos de Windows que quedan en la CI

## Objetivo

Sigue a 20261109-los-ultimos-fallos-de-windows-del-ci, que arregló los fallos de Windows del guard, de la copia de `install` y del plugin de OpenCode del run 42616529185 (main 5ba0e12). Este cambio arregla los que quedan de ese run (P404). Uno es del producto: el check de vulnerabilidades borra su carpeta temporal en cuanto falla una de sus dos ejecuciones de OSV-Scanner, mientras la otra aún trabaja dentro, y en Windows el borrado falla con EBUSY y tapa el mensaje del escáner. Los demás son de los tests: comparan una ruta de git con `/` con una de Specty con `\`, esperan el `cd` del encargo de la épica con `/`, esperan que `doctor` dé por buenas en Windows formas que allí no valen, y hacen fallar `git add` con un `chmod` que en Windows no impide leer el archivo.

## Fuera de alcance

- Los fallos de Windows que aparezcan en el siguiente run detrás de los que hoy cortan cada test: se verán en ese run.
- Los otros checks que lanzan programas (`secrets`, `code-rules`): lanzan una sola ejecución a la vez.
- Cambiar la tarjeta de la épica: sigue dando la ruta nativa de la carpeta (`cd 'C:\…'`), que Git Bash acepta entre comillas simples.

## Supuestos

- A1: En Windows no se puede borrar una carpeta que es la carpeta actual de un proceso vivo (EBUSY); en macOS y Linux sí. Por eso el check debe esperar a que acaben sus dos ejecuciones de OSV-Scanner antes de borrar la carpeta temporal, aunque una ya haya fallado.
- A2: `git rev-parse --git-path` da en Windows las rutas absolutas con `/`; los helpers de los tests que las comparan con las de Specty las pasan por `resolve`, como hace `fromGit` en el producto.
- A3: `doctor` no da por buenas en Windows las formas de antes (`${import.meta.dirname}/…` en un glob, `${__dirname}` en una expresión regular), porque la ruta lleva `\`, que en un patrón escapa el carácter siguiente; el producto ya lo hace, y el test esperaba lo contrario.
- A4: Un filtro `clean` obligatorio que falla (`filter.<nombre>.required` y `.git/info/attributes`) hace fallar `git add` de ese archivo en cualquier plataforma, también en una worktree y con el índice temporal de una ref de rescate, porque las dos leen la configuración y `info/attributes` de la carpeta común de git.

## Criterios de aceptación

- AC1: CUANDO una de las dos ejecuciones de OSV-Scanner falla y la otra sigue trabajando en su carpeta ENTONCES el check de vulnerabilidades espera a que acabe esa otra antes de borrar su carpeta temporal, y da como motivo el último mensaje del escáner que falló.
- AC2: CUANDO la CI corre en Windows ENTONCES los tests de `delegate`, `switch-log`, `epic-subagents`, `doctor-watchers`, `cancel-folder` y `prune-rescue` comprueban lo mismo que en macOS y Linux, con la forma de la plataforma en las rutas y con un `git add` que falla también allí.
  - test: manual

## Diseño

- `cli/src/check/vulnerabilities.ts`: las dos ejecuciones con `Promise.allSettled`; con las dos acabadas, el `finally` borra la carpeta, y se relanza el primer fallo, en el mismo orden que hoy (primero la de después).
- Tests: `switchOf` y `logOf` resuelven la ruta de git con `resolve`; la tarjeta de la épica admite `\` o `/` alrededor de `.worktrees`; en Windows, `doctor` sigue pidiendo las formas ancladas a Vite y a Metro; `cancel-folder` y `prune-rescue` hacen fallar `git add` de `secreto.txt` con un filtro `clean` (`false`) obligatorio en vez de con `chmod`, que deja de necesitar saltarse con root.

## Archivos

- modificar packages/cli/src/check/vulnerabilities.ts — esperar a las dos ejecuciones antes de borrar la carpeta temporal
- modificar packages/cli/test/check-vulnerabilities.test.ts — un escáner que falla en una carpeta y tarda en la otra (AC1)
- modificar packages/cli/test/delegate.test.ts — `switchOf` con `resolve`
- modificar packages/cli/test/switch-log.test.ts — `logOf` con `resolve`
- modificar packages/cli/test/epic-subagents.test.ts — el `cd` del encargo con `\` o `/`
- modificar packages/cli/test/doctor-watchers.test.ts — las formas de antes, que Windows no admite
- modificar packages/cli/test/cancel-folder.test.ts — `git add` que falla con un filtro `clean`
- modificar packages/cli/test/prune-rescue.test.ts — `git add` que falla con un filtro `clean`
- modificar docs/formats.md — el check de vulnerabilidades espera a sus dos ejecuciones

## Tareas

- [x] T1: El check de vulnerabilidades espera a sus dos ejecuciones
  - files: packages/cli/src/check/vulnerabilities.ts, packages/cli/test/check-vulnerabilities.test.ts, docs/formats.md
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-vulnerabilities.test.ts && pnpm lint && pnpm typecheck
  - type: fix
- [x] T2: Las rutas de git, el encargo de la épica y `doctor` con la forma de cada plataforma
  - files: packages/cli/test/delegate.test.ts, packages/cli/test/switch-log.test.ts, packages/cli/test/epic-subagents.test.ts, packages/cli/test/doctor-watchers.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/delegate.test.ts test/switch-log.test.ts test/epic-subagents.test.ts test/doctor-watchers.test.ts && pnpm lint
  - type: test
- [x] T3: git que no puede guardar el trabajo, en cualquier plataforma
  - files: packages/cli/test/cancel-folder.test.ts, packages/cli/test/prune-rescue.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/cancel-folder.test.ts test/prune-rescue.test.ts && pnpm lint && pnpm typecheck && pnpm knip
  - type: test

## Riesgos

- R1: Aquí no hay Windows: lo que se arregla allí solo se comprueba en la CI. Mitigación: el test del check reproduce el orden en macOS (una ejecución que tarda y comprueba que su carpeta sigue al terminar), y la sesión principal lee el siguiente run.
- R2: Un test que hoy se corta en Windows en su primera aserción puede tener otra detrás que también falle allí. Mitigación: se revisan las aserciones siguientes de cada test con la forma de Windows, y lo que quede lo dirá el siguiente run.
