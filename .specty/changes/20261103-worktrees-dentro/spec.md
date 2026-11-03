---
kind: standard
---

# Las worktrees de los cambios, dentro del proyecto

## Objetivo

`specty new` crea cada cambio en `<carpeta principal>/.worktrees/<id>`, dentro del proyecto, en lugar de junto a él (ADR 0018). Así cualquier agente o editor que solo trabaja en la carpeta del proyecto, como Antigravity en Zed, alcanza la carpeta del cambio sin que la persona haga nada. Git ignora esa carpeta en el clon, para que la principal nunca la muestre como sin seguimiento. ADR 0018 pasa a aceptada con las mediciones de Go, Maven, Gradle, SwiftPM, Cargo y Flutter.

## Fuera de alcance

- Que `init` añada `.worktrees/` a `.gitignore` (lo necesita Prettier): va en el cambio siguiente.
- Las exclusiones de Vitest, Jest, ESLint y Biome en los proyectos de JavaScript: van en otro cambio.
- Mover las worktrees de los cambios ya abiertos: se quedan donde están.
- Una clave para volver a la ubicación de antes: sin los permisos por agente, las herramientas con sandbox no la alcanzarían.

## Supuestos

- A1: La carpeta es `.worktrees`, en la raíz de la carpeta principal, y `new` la ignora en el clon con `/.worktrees/` en `.git/info/exclude`, que comparten todas las worktrees; la línea no se repite.
  - impacto: alto
- A2: Specty encuentra cada worktree con `git worktree list`, esté donde esté, así que un cambio abierto junto a la carpeta principal sigue funcionando.
- A3: El guard ya da cada archivo a la worktree que lo contiene más de cerca, así que un archivo de `.worktrees/<id>` es de ese cambio y no de la carpeta principal, aunque git lo ignore allí.
- A4: Este repositorio ignora `.worktrees/` en su `.gitignore` y Biome la excluye, como ya hace con `.claude`.

## Criterios de aceptación

- AC1: CUANDO `specty new` crea un cambio en su propia carpeta ENTONCES la carpeta es `<carpeta principal>/.worktrees/<id>`, `.git/info/exclude` ignora `/.worktrees/` una sola vez, y la carpeta principal queda sin cambios para git.
- AC2: CUANDO un agente de la carpeta principal escribe un archivo dentro de `.worktrees/<id>` ENTONCES el guard lo deniega como archivo de otro cambio.
- AC3: CUANDO Antigravity, con la carpeta principal como espacio de trabajo, ejecuta `specty enter <id>` ENTONCES entra en el cambio, porque su carpeta está dentro de ese espacio de trabajo.
- AC4: CUANDO un cambio abierto vive en la carpeta de antes, junto a la principal ENTONCES `specty status` lo lista y `specty enter` entra en él.

## Diseño

- `flow/worktree.ts`: `worktreesHome` da `<carpeta principal>/.worktrees`; `addWorktree` añade `/.worktrees/` a `.git/info/exclude` si falta.
- Tests: la carpeta de un cambio pasa a `.worktrees/<id>` en los ayudantes (`folderOf` y los `home` de cada archivo) y en los textos que la muestran relativa (`.worktrees/<id>`). Los tests de Antigravity con una carpeta fuera de su alcance le dan un espacio de trabajo que no la contiene.
- Este repositorio: `/.worktrees/` en `.gitignore` y `!.worktrees` en `biome.json`.
- Documentación: ARCHITECTURE §9 «Carpeta», formats §6 y ADR 0018 aceptada.

## Archivos

- modificar packages/cli/src/flow/worktree.ts — la carpeta de las worktrees, dentro del proyecto e ignorada
- crear packages/cli/test/worktrees-inside.test.ts — la carpeta nueva, el guard, Antigravity y los cambios de antes
- modificar packages/cli/test/support.ts — `folderOf` en `.worktrees/<id>`
- modificar packages/cli/test/worktrees.test.ts — la carpeta de las worktrees, dentro
- modificar packages/cli/test/epic.test.ts — la carpeta de las worktrees, dentro
- modificar packages/cli/test/status-json.test.ts — la carpeta relativa del cambio
- modificar packages/cli/test/memory-resolves.test.ts — la carpeta relativa del cambio
- modificar packages/cli/test/anywhere.test.ts — la carpeta relativa del cambio
- modificar packages/cli/test/antigravity.test.ts — un espacio de trabajo que no alcanza la carpeta del cambio
- modificar packages/cli/test/codex.test.ts — la carpeta del cambio donde `new` copia los hooks
- modificar packages/cli/test/opencode-install.test.ts — la carpeta del cambio donde `new` copia el plugin
- modificar .gitignore — ignora `.worktrees/`
- modificar biome.json — excluye `.worktrees`
- modificar docs/ARCHITECTURE.md — §9 «Carpeta»
- modificar docs/formats.md — `git.worktrees` y la carpeta de las worktrees
- modificar docs/decisions/0018-worktrees-dentro-del-repositorio.md — aceptada, con las mediciones nuevas

## Tareas

- [x] T1: La carpeta de las worktrees, dentro del proyecto e ignorada
  - files: packages/cli/src/flow/worktree.ts, packages/cli/test/worktrees-inside.test.ts, packages/cli/test/support.ts, packages/cli/test/worktrees.test.ts, packages/cli/test/epic.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/worktrees-inside.test.ts test/worktrees.test.ts test/epic.test.ts && pnpm typecheck && pnpm lint
- [ ] T2: Los textos y las carpetas de los demás tests, y la documentación
  - files: packages/cli/test/status-json.test.ts, packages/cli/test/memory-resolves.test.ts, packages/cli/test/anywhere.test.ts, packages/cli/test/antigravity.test.ts, packages/cli/test/codex.test.ts, packages/cli/test/opencode-install.test.ts, .gitignore, biome.json, docs/ARCHITECTURE.md, docs/formats.md, docs/decisions/0018-worktrees-dentro-del-repositorio.md
  - ac: AC1, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/status-json.test.ts test/memory-resolves.test.ts test/anywhere.test.ts test/antigravity.test.ts test/codex.test.ts test/opencode-install.test.ts && pnpm lint

## Riesgos

- R1: Las herramientas de JavaScript de la carpeta principal (Vitest, Jest, ESLint, Biome sin `.gitignore`) ven las copias del proyecto mientras hay cambios abiertos — medido en ADR 0018; sus exclusiones van en otro cambio.
- R2: Go con un `go.work` sin versionar en la carpeta principal falla dentro de la worktree — medido en ADR 0018; queda anotado allí.
