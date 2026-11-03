---
kind: standard
---

# init ignora la carpeta de las worktrees en .gitignore

## Objetivo

Las worktrees de los cambios viven en `.worktrees/` dentro del proyecto (ADR 0018). `specty new` ya la ignora en el clon con `.git/info/exclude`, pero Prettier, y otras herramientas que solo leen `.gitignore`, la siguen viendo. `init` añade `/.worktrees/` a `.gitignore` y lo incluye en el commit de la instalación, para que quede ignorada en todos los clones.

## Fuera de alcance

- Las exclusiones de Vitest, Jest, ESLint y Biome, que no leen `.gitignore`: van en el cambio siguiente.
- Quitar la línea con `uninstall`: puede haber worktrees abiertas, y la línea no molesta.

## Supuestos

- A1: Cuenta como ignorada si `.gitignore` ya tiene `.worktrees`, `.worktrees/`, `/.worktrees` o `/.worktrees/`; si no, `init` añade `/.worktrees/` al final, sin tocar lo demás, y crea el archivo si falta.
  - impacto: alto
- A2: Como el resto de los archivos que escribe `init` y que git sigue, `.gitignore` va en el commit de la instalación, salvo que la persona tuviera cambios suyos en él, que quedan sin commit.

## Criterios de aceptación

- AC1: CUANDO `init` instala Specty en un proyecto cuyo `.gitignore` no ignora `.worktrees` ENTONCES añade `/.worktrees/` al final, dice que lo hizo, y lo incluye en el commit de la instalación; si el archivo no existía, lo crea con esa línea.
- AC2: CUANDO `.gitignore` ya ignora `.worktrees` o `init` se ejecuta otra vez ENTONCES no añade otra línea ni cambia el archivo.

## Diseño

- `install/project-files.ts`: `writeWorktreesIgnore(root, files)` añade la línea donde falta y dice si la escribió.
- `install/install.ts`: `writeProjectFiles` la llama, y añade su línea a lo hecho y `.gitignore` a lo escrito.
- Core: `worktreesIgnoreLine(lang)` en `cards/init.ts`, exportada en `cards/index.ts`.

## Archivos

- modificar packages/cli/src/install/project-files.ts — la línea de `.gitignore`
- modificar packages/cli/src/install/install.ts — `init` la escribe y la incluye en su commit
- modificar packages/core/src/cards/init.ts — el texto de `init`
- modificar packages/core/src/cards/index.ts — exporta el texto
- crear packages/cli/test/init-worktrees.test.ts — `.gitignore` con y sin la línea, y otra vez
- modificar packages/cli/test/init-commit.test.ts — el commit de la instalación lleva `.gitignore`
- modificar docs/ARCHITECTURE.md — lo que escribe y versiona `init`

## Tareas

- [ ] T1: init añade `/.worktrees/` a `.gitignore`
  - files: packages/cli/src/install/project-files.ts, packages/cli/src/install/install.ts, packages/core/src/cards/init.ts, packages/core/src/cards/index.ts, packages/cli/test/init-worktrees.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/init-worktrees.test.ts && pnpm typecheck && pnpm lint
- [ ] T2: El commit de la instalación lleva `.gitignore`, y la documentación
  - files: packages/cli/test/init-commit.test.ts, docs/ARCHITECTURE.md
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/init-commit.test.ts && pnpm lint

## Riesgos

- R1: Otros tests comparan la lista exacta de lo que `init` escribe o su salida — la verificación completa al aceptar los destapa.
