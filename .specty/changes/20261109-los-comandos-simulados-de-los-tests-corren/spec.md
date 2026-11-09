---
kind: standard
follows:
  - 20261109-specty-lanza-en-windows-las-herramientas-del
---

# Los comandos simulados de los tests corren también en cmd.exe

## Objetivo

Sigue a 20261109-specty-lanza-en-windows-las-herramientas-del. En el run 42601745517 de la CI, varios tests del CLI fallan en `windows-latest` porque sus comandos simulados (de verificación, de las unidades, de `git.setup` y de la verificación en vivo) usan la sintaxis de `sh`, que `cmd.exe`, la shell del sistema en Windows, no entiende: `"$(git rev-parse --git-common-dir)"`, `sleep` y `echo` cuyo texto exacto se comprueba (en `cmd.exe`, `echo listo > x` escribe `listo \r\n`). Además, el test de `internal.exec.priority` espera leer 15, una prioridad que Windows no tiene. Con este cambio, esos comandos los hace Node y corren igual en `sh` y en `cmd.exe`, sin cambiar lo que comprueba cada test.

## Fuera de alcance

- El producto: las verificaciones y `git.setup` siguen siendo líneas de la shell del sistema, como hoy.
- Lo que falla en Windows solo por las rutas de git con `/` (otro cambio).
- Los tests que ya pasan en Windows con `echo … && exit N`, cuya salida se comprueba recortada.
- Confirmar en la CI de Windows lo que arregló el cambio anterior (P399): lo hace la sesión principal con el siguiente run.

## Supuestos

- A1: Un comando `node -e "…"` con el código entre comillas dobles y sin `$`, comillas invertidas, `%` ni comillas dobles dentro corre igual en `sh` y en `cmd.exe`, y `node "<script>"` también; dentro de las comillas dobles, `cmd.exe` no interpreta `&`, `|`, `<`, `>` ni paréntesis.
  - impacto: alto
- A2: `git rev-parse --git-common-dir`, que el comando simulado lanzaba con `$(…)`, lo puede lanzar el propio Node con `execFileSync` desde la misma carpeta y da la misma carpeta (relativa a ella o absoluta), así que el script la resuelve igual que antes.
  - impacto: medio
- A3: En Windows las prioridades son clases: la 15 de `internal.exec.priority` cae en «por debajo de lo normal», que `os.getPriority` lee como 10; el producto ya la aplica, y el test debe esperar lo que el sistema lee.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO un test del CLI usa como verificación, unidad de `verify.units`, `git.setup` o verificación en vivo un comando simulado ENTONCES el comando no usa `$(…)`, `sleep` ni `echo` cuyo texto exacto se comprueba, sino Node, y el test comprueba lo mismo que antes en macOS y en Linux.
  - test: manual
- AC2: CUANDO el test de `internal.exec.priority` corre en Windows ENTONCES espera la prioridad que Windows lee para 15 (10, «por debajo de lo normal»); fuera de Windows, como hoy.
  - test: manual
- AC3: CUANDO un test simula el `pnpm` que prepara la carpeta de un cambio ENTONCES lo escribe con `writeTool` (`test/tools.ts`), que en Windows le pone su `.cmd`.
  - test: manual

## Diseño

- `test/tools.ts`: `COMMON_DIR`, la expresión de JavaScript, solo con comillas simples, que da la carpeta común de git con `execFileSync("git", ["rev-parse", "--git-common-dir"])`, para los `node -e` y los scripts de los tests.
- Los scripts de verificación simulada (`verify.cjs`, `mover.js`, `count.js`) calculan su carpeta común con `COMMON_DIR` en vez de leerla de su primer argumento; los `node -e` de las unidades usan `COMMON_DIR` en vez de `process.argv[1]`.
- `verify-merge`: el `echo … && sleep 2 && …` pasa a un `node -e` que escribe la línea, espera 2 s y anota la ejecución.
- `live-run`: `echo uno && sleep 2 && echo dos` pasa a un `node -e` que escribe `uno`, espera y escribe `dos`.
- `worktrees`: `git.setup` escribe `preparado.txt` con Node, y el `pnpm` falso se escribe con `writeTool`.
- `verify-priority`: la prioridad esperada para 15 es 10 en Windows.

## Archivos

- modificar packages/cli/test/tools.ts — `COMMON_DIR` para los comandos simulados
- modificar packages/cli/test/verify-priority.test.ts — la prioridad que lee Windows para 15
- modificar packages/cli/test/live-run.test.ts — la verificación en vivo con Node en vez de `echo` y `sleep`
- modificar packages/cli/test/worktrees.test.ts — `git.setup` con Node y el `pnpm` falso con `writeTool`
- modificar packages/cli/test/accept-quick-turn.test.ts — la verificación simulada sin `$(…)`
- modificar packages/cli/test/close-moved.test.ts — la verificación simulada sin `$(…)`
- modificar packages/cli/test/incorporation-units.test.ts — las unidades simuladas sin `$(…)`
- modificar packages/cli/test/integrate-landing.test.ts — la verificación simulada sin `$(…)`
- modificar packages/cli/test/integrate-units.test.ts — las unidades simuladas sin `$(…)`
- modificar packages/cli/test/integrate.test.ts — la verificación simulada sin `$(…)`
- modificar packages/cli/test/no-code.test.ts — la verificación simulada sin `$(…)`
- modificar packages/cli/test/server/verify-merge.test.ts — la verificación simulada sin `$(…)`, `echo` ni `sleep`
- modificar packages/cli/test/server/verify-units.test.ts — las unidades simuladas sin `$(…)`

## Tareas

- [x] T1: La carpeta común, la preparación, la verificación en vivo y la prioridad, también en `cmd.exe`
  - files: packages/cli/test/tools.ts, packages/cli/test/verify-priority.test.ts, packages/cli/test/live-run.test.ts, packages/cli/test/worktrees.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/verify-priority.test.ts test/live-run.test.ts test/worktrees.test.ts && pnpm lint
  - type: test
- [x] T2: Las verificaciones simuladas de la aceptación y el cierre, sin `$(…)`
  - files: packages/cli/test/accept-quick-turn.test.ts, packages/cli/test/close-moved.test.ts, packages/cli/test/incorporation-units.test.ts, packages/cli/test/integrate-landing.test.ts, packages/cli/test/integrate-units.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/accept-quick-turn.test.ts test/close-moved.test.ts test/incorporation-units.test.ts test/integrate-landing.test.ts test/integrate-units.test.ts && pnpm lint
  - type: test
- [ ] T3: Las verificaciones simuladas de la incorporación y de la UI, sin `$(…)`
  - files: packages/cli/test/integrate.test.ts, packages/cli/test/no-code.test.ts, packages/cli/test/server/verify-merge.test.ts, packages/cli/test/server/verify-units.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/integrate.test.ts test/no-code.test.ts test/server/verify-merge.test.ts test/server/verify-units.test.ts && pnpm lint && pnpm typecheck && pnpm knip
  - type: test

## Riesgos

- R1: Aquí no hay Windows: que los comandos corran en `cmd.exe` solo se comprueba en la CI de Windows. Mitigación: los comandos solo usan `node` con su código entre comillas dobles, sin caracteres que `cmd.exe` interprete ahí; la sesión principal lee el siguiente run.
