---
kind: standard
---

# Git recuerda unos instantes todas las lecturas que solo dependen de las refs

## Objetivo

Desde 20261105-tests-cli-mas-rapidos, cada comando abre su sesión con un proceso de git y cada `Git` recuerda 2 s su rama, HEAD, la configuración y las worktrees. Medido después en `test/flow.test.ts` (1097 procesos, 86 sesiones), dentro de un comando ya casi nada se repite: lo que queda es una pregunta por comando por la rama (85) y por HEAD (82 y 29 más con `rev-parse HEAD`), y lecturas como la ref de la memoria (47), el `log` de los trailers (42) o la rama destino, que otros flujos repiten. Con este cambio, la pregunta que abre la sesión da también HEAD y la rama, y el `Git` recuerda igual cualquier lectura que solo depende de las refs y la configuración. Es P161.

## Fuera de alcance

- Recordar lo que depende de los archivos de la carpeta o del índice (`diff`, `status`, `ls-files`, `write-tree`, una ruta `:ruta`).
- Juntar en una pregunta las lecturas de la rama destino o de la ref de la memoria.
- Recordar entre dos comandos: cada uno es su propio proceso.

## Supuestos

- A1: `git rev-parse --show-toplevel --git-path specty --git-path common HEAD --abbrev-ref HEAD` da en un proceso la raíz, las dos rutas, el commit de HEAD y su rama (`HEAD` si está suelto). En una rama sin commits falla, y entonces se pregunta como hoy, sin HEAD ni la rama.
  - impacto: alto
- A2: Las respuestas de la apertura cuentan como las de `rev-parse --verify -q HEAD`, `rev-parse HEAD` y `symbolic-ref --short -q HEAD` del mismo `Git`, con los mismos 2 s y las mismas reglas para olvidarlas. Con HEAD suelto, la rama es la respuesta vacía que da hoy `symbolic-ref`.
  - impacto: alto
- A3: Se recuerda, con su resultado entero (también el de un fallo), cualquier lectura de git sin entorno propio ni entrada cuyo comando solo lea refs, objetos o la configuración: `rev-parse`, `log`, `merge-base`, `for-each-ref`, `ls-tree` y `show-ref`, además de `config` que lee, `symbolic-ref` sin valor nuevo y `worktree list`; si nombra una ruta del índice (`:ruta`), no.
  - impacto: alto
- A4: Preparar archivos y crear objetos (`add`, `update-index`, `hash-object`, `commit-tree`, `mktree`) no mueve refs ni escribe la configuración, así que no hace olvidar nada; lo demás sigue como en el cambio anterior.

## Criterios de aceptación

- AC1: CUANDO un comando abre su sesión en un repositorio con commits ENTONCES una sola pregunta a git da también su HEAD y su rama, y el `Git` no las vuelve a preguntar en sus 2 s; sin commits, la sesión se abre igual que antes.
- AC2: CUANDO un mismo `Git` repite en 2 s una lectura que solo depende de las refs, como un `log`, la verificación de una ref, un `merge-base` o un `ls-tree`, sin ejecutar entre medias nada que pueda cambiarla ENTONCES git la responde una sola vez, también si falló.
- AC3: CUANDO entre dos lecturas solo prepara archivos con `add` ENTONCES la segunda no vuelve a preguntar; CUANDO hace un commit o mueve una ref ENTONCES sí, y da la respuesta nueva.
- AC4: CUANDO una lectura nombra una ruta del índice o lleva un entorno propio ENTONCES se pregunta a git cada vez.
- AC5: CUANDO se ejecutan los tests de la CLI ENTONCES pasan sin cambios y `test/flow.test.ts` lanza al menos un 15 % menos procesos de git que los 1097 de hoy.
  - test: manual

## Diseño

- `io/git-memo.ts`: `Recall.keep` da también `remember(key, value)`, para sembrar una respuesta. `recallable(args)` dice si una lectura solo depende de las refs, los objetos o la configuración; `mayChangeRecalled` cuenta además como lecturas `add`, `update-index`, `hash-object`, `commit-tree` y `mktree`.
- `io/git.ts`: el `runner` recuerda por sus argumentos el resultado de toda lectura `recallable` sin `env` ni `input`, y `head`, `branch`, `config` y `worktrees` pasan por ahí en lugar de recordar cada una por su cuenta. `openRepository` hace la pregunta de A1, y si falla la de hoy, y da HEAD y la rama si las tiene; `createGit` las siembra como respuestas de `rev-parse --verify -q HEAD`, `rev-parse HEAD` y `symbolic-ref --short -q HEAD`.
- `session.ts`: le pasa a `createGit` lo que dio `openRepository`.
- Docs: ARCHITECTURE §10, el párrafo de las consultas recordadas.

## Archivos

- modificar packages/cli/src/io/git-memo.ts — qué lecturas se recuerdan y sembrar una respuesta
- modificar packages/cli/src/io/git.ts — recordar las lecturas en el runner y la apertura con HEAD y la rama
- modificar packages/cli/src/session.ts — pasar HEAD y la rama de la apertura
- modificar packages/cli/test/git-memo.test.ts — AC1 a AC4, con tests nuevos
- modificar docs/ARCHITECTURE.md — las lecturas recordadas y la apertura con HEAD y la rama

## Tareas

- [x] T1: La apertura da HEAD y la rama, y el runner recuerda las lecturas de refs
  - files: packages/cli/src/io/git-memo.ts, packages/cli/src/io/git.ts, packages/cli/src/session.ts, packages/cli/test/git-memo.test.ts
  - ac: AC1, AC2, AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/git-memo.test.ts test/git-paths.test.ts test/flow.test.ts test/enter.test.ts test/worktree-hooks.test.ts test/memory.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: perf
- [ ] T2: La documentación de las lecturas recordadas
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: Una lectura recordada podría quedar vieja si otro proceso mueve una ref en esos 2 s — es el margen que ya acepta el cambio anterior, y el propio `Git` olvida todo tras cualquier comando suyo que pueda cambiarla.
