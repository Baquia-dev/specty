---
kind: standard
follows:
  - 20261103-memoria-descartar
---

# El guard no deja a los agentes escribir con git la rama de la memoria

## Objetivo

La memoria de Specty vive en su propia rama (`specty-memory`), y solo los comandos de `specty memory` deberían escribirla: así cada entrada es válida, tiene su commit y respeta que descartar es solo de la persona. Hoy un agente podría saltárselo con git, por ejemplo moviendo la rama con `git update-ref`, borrándola o sacándola en una carpeta para editar sus archivos. Con este cambio, el guard bloquea esos comandos y le dice al agente qué usar. Completa el AC6 de la épica y resuelve la entrada P12 de la memoria.

## Fuera de alcance

- Proteger la rama frente a la persona o frente a git ejecutado fuera de un agente con hooks: el guard solo juzga a los agentes.
- Comandos ofuscados (variables, alias de git, scripts): las reglas de shell del guard son de mejor esfuerzo, como las de `--no-verify`.
- Leer la rama: `git log`, `git show` o `git diff` sobre ella siguen permitidos.

## Supuestos

- A1: Un comando de git escribe la rama si la nombra (como `specty-memory`, `refs/heads/specty-memory` o `heads/specty-memory`, con o sin `+`) en `update-ref` (también con `-d`), en un `branch` que la crea, la borra, la renombra, la copia o la fuerza, en una refspec de `push` a uno u otro lado de `:`, en un `switch` o `checkout` que la saca o la crea, en un `worktree add` que la saca en una carpeta, o como destino de una refspec de `fetch`. `update-ref --stdin`, `push --all` y `push --mirror` cuentan siempre, porque no se sabe qué ramas tocan o las suben todas.
  - impacto: alto
- A2: La rama es la de `memory.branch` de la configuración (por defecto `specty-memory`).
- A3: La regla va después de las de saltarse los hooks y antes de las de commits de código, con su propio motivo en el guard (`memory`). El mensaje remite a `specty memory add`, `done` y `drop`, y dice que subirla es de la persona.

## Criterios de aceptación

- AC1: CUANDO un agente ejecuta un comando de git que escribe, borra, renombra, sube o saca en una carpeta la rama de la memoria de Specty ENTONCES el guard lo bloquea, dice que solo la escriben los comandos de `specty memory` y que subirla es de la persona.
- AC2: CUANDO el comando de git solo lee la rama de la memoria, o escribe otras ramas ENTONCES el guard no lo bloquea por la memoria.

## Diseño

- Core:
  - `guard/git-refs.ts`, nuevo: `writtenRefs(command, args)` da las ramas que un comando de git escribe, borra, sube o saca, normalizadas (sin `+`, `refs/heads/` ni `heads/`), y `*` cuando son todas o no se saben.
  - `guard/git.ts`: `GitEffects` gana `refs`, con lo que da `writtenRefs`.
  - `guard/shell.ts`: `ShellAnalysis` gana `refs`, de todos los comandos de git de la línea.
  - `guard/decide.ts`: `ShellFacts` gana `refs` (opcional), y la regla `memory` bloquea si alguna es `memory.branch` o `*`.
- CLI: `enforce/place.ts` pasa `refs` del análisis a los hechos del guard.

## Archivos

- crear packages/core/src/guard/git-refs.ts — qué ramas escribe, borra, sube o saca un comando de git
- modificar packages/core/src/guard/git.ts — `GitEffects.refs`
- modificar packages/core/src/guard/shell.ts — `ShellAnalysis.refs`
- modificar packages/core/src/guard/decide.ts — la regla `memory`
- modificar packages/cli/src/enforce/place.ts — pasa las ramas al guard
- crear packages/core/test/guard/memory-branch.test.ts — qué comandos de git escriben la rama y la decisión del guard
- crear packages/cli/test/memory-guard.test.ts — el guard de Claude Code ante comandos sobre la rama
- modificar docs/ARCHITECTURE.md — la regla del guard sobre la rama de la memoria

## Tareas

- [x] T1: Qué ramas escribe un comando de git, y la regla del guard
  - files: packages/core/src/guard/git-refs.ts, packages/core/src/guard/git.ts, packages/core/src/guard/shell.ts, packages/core/src/guard/decide.ts, packages/core/test/guard/memory-branch.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/guard && pnpm --filter @baquia-dev/specty-core typecheck && pnpm lint
- [x] T2: El guard recibe las ramas, y la documentación
  - files: packages/cli/src/enforce/place.ts, packages/cli/test/memory-guard.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/memory-guard.test.ts test/enter.test.ts && pnpm typecheck && pnpm lint

## Riesgos

- R1: Un falso positivo bloquea un comando legítimo del agente, como `git push --all` — solo afecta a comandos que suben o tocan todas las ramas, y el mensaje explica que lo haga la persona.
- R2: El guard se vuelve más lento — es análisis de texto del comando, sin llamadas a git.
- R3: Un agente escribe la rama con un comando ofuscado — las reglas de shell son de mejor esfuerzo; `specty memory` sigue leyendo solo entradas válidas.
