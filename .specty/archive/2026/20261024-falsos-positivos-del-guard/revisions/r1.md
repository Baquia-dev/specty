---
kind: standard
---

# Falsos positivos del guard

## Objetivo

El guard deja de bloquear tres comandos legítimos que hoy para: leer `core.hooksPath` con `git config --get`, hacer `git commit` en otro repositorio tras un `cd`, y `2>&1)` al final de un subshell, que hoy cuenta como una escritura en el archivo `&1)`. De paso, lo que corre dentro de un subshell se analiza: hoy `(git commit -m x)` se cuela porque el programa se lee como `(git`.

## Fuera de alcance

- Las sustituciones dentro de comillas dobles (`"$(…)"`) y las comillas invertidas: siguen sin analizarse.
- Los grupos con llaves (`{ …; }`).
- Un repositorio anidado dentro de la carpeta del cambio: un commit allí se sigue juzgando como de este repositorio.
- Otras formas de quitar `core.hooksPath`, como `git config --remove-section core`.

## Supuestos

- A1: Un commit en una carpeta que el análisis no sabe ubicar (una variable, `cd -`, `cd` sin destino) se sigue juzgando aquí, como hoy: es mejor un falso positivo que dejar pasar un commit de código de este repositorio.
  - impacto: alto
- A2: Dónde corre un commit se decide por su ruta, sin preguntar a git, porque cuando llega el hook la carpeta del otro repositorio puede no existir todavía (`mkdir /tmp/x && cd /tmp/x && git init && git commit …`).
- A3: Un commit en otra worktree de este repositorio se sigue juzgando aquí: una sesión no trabaja en la worktree de otro cambio, y el `pre-commit` de esa worktree también lo pararía.
- A4: `git config --unset core.hooksPath` sigue contando como saltarse los hooks, porque husky y lefthook dependen de ese valor; solo leerlo deja de contar.

## Criterios de aceptación

- AC1: CUANDO `git config` solo lee `core.hooksPath` (`--get`, `--get-all`, `--get-regexp`, `--list`, `get`, o la clave sola: `git config core.hooksPath`) ENTONCES el guard no lo toma por saltarse los hooks.
- AC2: CUANDO `git config` cambia `core.hooksPath` (`git config core.hooksPath x`, `--add`, `--replace-all`, `--unset`, `--unset-all`, `set` o `unset`) ENTONCES el guard lo sigue bloqueando.
- AC3: CUANDO un `git commit` corre, tras un `cd` o con `git -C`, en una carpeta fuera de todas las worktrees del repositorio ENTONCES el guard no lo juzga como un commit de este repositorio, aunque aquí haya código gobernado sin commit.
- AC4: CUANDO un `git commit` corre aquí, en otra worktree del repositorio o en una carpeta que el análisis no sabe ubicar ENTONCES se bloquea como hoy.
- AC5: CUANDO un comando abre un subshell o una sustitución fuera de comillas (`(specty next 2>&1 || npx -y @baquia-dev/specty next 2>&1) | head -60`, `echo $(pwd)`) ENTONCES `2>&1)` no cuenta como escritura, y lo de dentro se analiza: `(git commit -m x)` se bloquea igual que `git commit -m x`.
- AC6: CUANDO un subshell hace `cd` ENTONCES la carpeta no cambia fuera de él: en `(cd /tmp) && echo hi > src/app.ts` la escritura se juzga en `src/app.ts`.

## Diseño

- `tokenize` (`guard/tokens.ts`): fuera de la aritmética, `(` y `)` terminan la palabra y el comando, y salen como piezas propias que marcan dónde abre y cierra un subshell. Devuelve piezas: un comando (sus tokens), `"("` o `")"`. `((` sigue siendo aritmética, y dentro de ella los paréntesis sueltos son parte de la expresión.
- `analyzeShell` (`guard/shell.ts`) lleva una pila de carpetas: `(` guarda la actual y `)` la recupera; un `)` sin pareja no cambia nada.
- Cada entrada de `commits` lleva `directory` cuando un `cd` o `git -C` la mueven a una carpeta que el análisis sabe nombrar (relativa a donde empieza el comando, o absoluta); sin `directory`, corre donde empieza o en una carpeta desconocida (A1).
- El análisis de los argumentos de git pasa a `guard/git.ts`, para que `shell.ts` no pase de 300 líneas. `git config` cuenta como saltarse los hooks solo si nombra `core.hooksPath` y no se limita a leerlo: lee con `get` o `list` como subcomando, con `--get*` o `--list`, o con la clave sola; escribe con dos argumentos o con `--add`, `--replace-all`, `--unset*`, `set` o `unset`.
- El guard del CLI (`enforce/guard.ts`) ubica la carpeta de cada commit con `placePaths`: si queda fuera de todas las worktrees, ese commit no cuenta (A2, A3). `committedGoverned` solo se calcula si queda algún commit que cuente.

## Archivos

- modificar packages/core/src/guard/tokens.ts — `(` y `)` como piezas del subshell
- modificar packages/core/src/guard/shell.ts — pila de carpetas y carpeta de cada commit
- crear packages/core/src/guard/git.ts — argumentos de git: commits, `-C` y `git config` que solo lee
- modificar packages/core/test/guard/shell.test.ts — un caso por cada forma
- modificar packages/cli/src/enforce/guard.ts — los commits fuera de las worktrees no cuentan
- modificar packages/cli/test/enforce.test.ts — los tres falsos positivos de punta a punta
- modificar docs/ARCHITECTURE.md — subshells, commits en otra carpeta y `core.hooksPath` (§10)

## Tareas

- [ ] T1: Subshells, commits en otra carpeta y `git config` en el análisis de shell
  - files: packages/core/src/guard/tokens.ts, packages/core/src/guard/shell.ts, packages/core/src/guard/git.ts, packages/core/test/guard/shell.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC5, AC6
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/guard/shell.test.ts
  - type: fix
- [ ] T2: El guard no juzga commits de otros repositorios
  - files: packages/cli/src/enforce/guard.ts, packages/cli/test/enforce.test.ts
  - ac: AC1, AC3, AC4, AC5
  - verify: pnpm check
  - type: fix

## Riesgos

- R1: Tomar por subshell un paréntesis que no lo es haría analizar como comando algo que no lo es, o perder un `cd` — los paréntesis de la aritmética siguen dentro de ella, un `)` sin pareja no mueve la carpeta, y AC6 prueba que el `cd` de un subshell no se escapa.
- R2: Un commit de este repositorio tomado por uno de fuera se colaría — solo cuenta como de fuera si su carpeta se puede nombrar y está fuera de todas las worktrees (A1, A3), y los recibos del `pre-commit` siguen parando cualquier commit sin `task done`.
