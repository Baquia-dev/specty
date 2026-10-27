---
kind: standard
---

# Las rutas de Specty usan / también en Windows

## Objetivo

En Windows, Specty muestra con `\` las rutas relativas que en Linux y macOS muestra con `/`: el diff y la lista de `check --install`, la carpeta de cada cambio en `status` y en la nota de un comando de la persona, la carpeta de `export` y los archivos de gentle-ai de `doctor`. Las specs y la documentación usan siempre `/`, y la CI de Windows falla por eso. Además, el hook `WorktreeCreate` compara la carpeta que preparó `specty new` con la lista de git, que en Windows la escribe `C:/…` mientras Node la escribe `C:\…`: nunca coinciden, y `EnterWorktree` acaba en `.claude/worktrees/<nombre>` en vez de en la carpeta del cambio.

## Fuera de alcance

- Los fallos de Windows que no son de separadores: el test que enlaza `git` y `npm` en un `PATH` propio, el de Prisma con un `node_modules/.bin/prisma` sin `.cmd`, el plazo de `check` que no corta el comando, y `close` desde la carpeta principal, que no borra la carpeta del cambio. Necesitan el log completo de la CI, que pide autenticación.
- Las rutas absolutas: se muestran como las da el sistema (`C:\…` en Windows).
- Las comparaciones de carpetas de los adaptadores de agentes (Codex, Cursor, Windsurf, OpenCode, Gemini CLI): en Windows solo añaden un `cd` a la misma carpeta, que no cambia el resultado.
- Ejecutar la CI de Windows: se verifica al final, con la versión 1.

## Supuestos

- A1: Basta con convertir a `/` el resultado de `relative()` donde se muestra o se compara con rutas de git; `join()` y `resolve()` siguen con el separador del sistema para leer y escribir archivos.
  - impacto: alto
- A2: Un test que sustituye `node:path` por `path.win32` (`vi.mock`) prueba en macOS y Linux lo que hacen las funciones de rutas en Windows, sin tocar el sistema de archivos.
- A3: En Windows, `resolve()` normaliza una ruta de git (`C:/a/b`) a la forma de Node (`C:\a\b`); en Linux y macOS deja igual una ruta absoluta ya normalizada.

## Criterios de aceptación

- AC1: CUANDO una función de rutas de `store/paths.ts` recibe rutas de Windows (`C:\repo` o `C:/repo`) ENTONCES devuelve la ruta relativa con `/` (`.specty/config.yaml`, `../repo.worktrees/x`), y la ruta entera cuando queda fuera de la raíz.
- AC2: CUANDO `check --install` muestra o aplica sus ediciones, `status` lista los cambios de otras carpetas, un comando de la persona avisa de la carpeta del cambio, `export` muestra la carpeta de salida o `doctor` muestra un archivo de gentle-ai ENTONCES usan esa ruta relativa con `/`, y en Linux y macOS su salida no cambia.
- AC3: CUANDO `WorktreeCreate` recibe el nombre de un cambio cuya carpeta preparó `specty new` ENTONCES la reconoce aunque git escriba la ruta con otro separador, y en Linux y macOS sigue entrando en ella.

## Diseño

`store/paths.ts` ya da la ruta relativa al repositorio con `/` (`RepoPaths.relative`). Gana dos funciones libres: `posixRelative(from, to)`, que es `relative()` con `/`, y `shownPath(root, path)`, que es la ruta tal como la lee la persona: relativa a la raíz con `/`, o entera fuera de ella, como ya hacían `init` y `uninstall` cada uno por su lado. `RepoPaths.relative`, `init`, `uninstall`, `check/install-plan`, `export`, `status`, `commands/human` y `detect/gentle-ai` las usan. `namedWorktree` compara las carpetas tras `resolve()`.

## Archivos

- modificar packages/cli/src/store/paths.ts — `posixRelative` y `shownPath`
- crear packages/cli/test/paths.test.ts — las dos funciones con `path.win32`
- modificar packages/cli/src/check/install-plan.ts — la ruta de cada edición con `shownPath`
- modificar packages/cli/src/commands/init.ts — `shown` pasa a `shownPath`
- modificar packages/cli/src/commands/uninstall.ts — `described` usa `shownPath`
- modificar packages/cli/src/commands/export.ts — `shownFolder` usa `shownPath`
- modificar packages/cli/src/commands/status.ts — la carpeta de cada cambio con `posixRelative`
- modificar packages/cli/src/commands/human.ts — la carpeta de la nota con `posixRelative`
- modificar packages/cli/src/detect/gentle-ai.ts — `shown` con `shownPath`, también bajo `~/`
- modificar packages/cli/src/enforce/worktree-hooks.ts — `namedWorktree` compara las carpetas tras `resolve()`

## Tareas

- [x] T1: Las funciones de rutas con `/` en cualquier sistema
  - files: packages/cli/src/store/paths.ts, packages/cli/test/paths.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/paths.test.ts
- [x] T2: Las rutas de los archivos que tocan `check --install`, `init` y `uninstall`, con `/`
  - files: packages/cli/src/check/install-plan.ts, packages/cli/src/commands/init.ts, packages/cli/src/commands/uninstall.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-install.test.ts test/check-ignores.test.ts test/check-agent-stop.test.ts test/init-commit.test.ts test/install.test.ts test/uninstall.test.ts
- [x] T3: Las carpetas de `status`, `export` y los comandos de la persona, y los archivos de gentle-ai, con `/`
  - files: packages/cli/src/commands/export.ts, packages/cli/src/commands/status.ts, packages/cli/src/commands/human.ts, packages/cli/src/detect/gentle-ai.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/anywhere.test.ts test/export.test.ts test/gentle-ai.test.ts
- [x] T4: `WorktreeCreate` reconoce la carpeta preparada con cualquier separador
  - files: packages/cli/src/enforce/worktree-hooks.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/worktree-hooks.test.ts

## Riesgos

- R1: Quedan rutas con `\` que la auditoría no vio, porque la CI solo muestra 10 fallos por paso — se verá en la CI de Windows con la versión 1, que ya no bloquea.
