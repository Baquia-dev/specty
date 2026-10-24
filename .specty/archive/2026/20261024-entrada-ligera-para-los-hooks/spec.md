---
kind: standard
---

# Entrada ligera para los hooks

## Objetivo

Los hooks del agente llaman a `specty guard` antes de cada acción y después de cada comando, y los de git a `specty hook` en cada commit; hoy cada llamada carga el bundle entero de la CLI (1,7 MB), aunque ARCHITECTURE §2 dice que el guard y los hooks usan un punto de entrada mínimo. Con este cambio lo usan de verdad: no cargan commander, los prompts, el servidor, los comandos ni los instaladores. Además, core importa zod de forma que el bundle deja fuera lo que no usa (sus traducciones y su JSON Schema, unos 575 KB), lo que aligera también el de la UI. En un prototipo medido el 2026-10-24, el guard de un `Bash` pasó de 123 a 101 ms de mediana.

## Fuera de alcance

- Reducir las llamadas a git del guard, que son la otra mitad de su tiempo.
- Las entradas ligeras de core para la UI (`@baquia-dev/specty-core/i18n` y similares): el índice de core no cambia.
- Cambiar los comandos que instalan los hooks: siguen siendo `specty guard --tool <id>` y `specty hook <nombre>`.

## Supuestos

- A1: Con `import * as z from "zod"`, esbuild y el builder de Angular eliminan las exportaciones de zod que nadie usa, y con `import { z } from "zod"` no pueden, porque `z` es un objeto; medido con esbuild: 741 KB frente a 166 KB para el mismo esquema.
  - impacto: alto
- A2: esbuild parte el bundle en `dist/` (`splitting`, solo con ESM): `specty.mjs` sigue siendo la entrada, y sus trozos (`chunk-*.mjs`) van en la misma carpeta, para que `import.meta.url` siga apuntando a `dist/` (lo usa `specty ui` para encontrar `dist/ui`).
  - impacto: alto
- A3: Una invocación de los hooks que no tenga su forma exacta (`guard --tool <id>`, `guard --tool=<id>` o `hook <nombre> [args…]`) pasa por la CLI completa, que la responde como hoy, con su ayuda y sus errores.
- A4: Los hooks no preguntan nunca, así que su terminal no carga los prompts: solo sabe si hay una persona en la terminal, como la de siempre.

## Criterios de aceptación

- AC1: CUANDO se construye la CLI ENTONCES el bundle no lleva las traducciones de zod.
- AC2: CUANDO se ejecuta `specty guard --tool <id>` o `specty hook <nombre>` ENTONCES responden lo mismo que antes (salida, errores y código), y lo que cargan no incluye commander, `@clack/prompts`, `program.ts` ni el servidor.
- AC3: CUANDO los argumentos no tienen la forma exacta de los hooks (por ejemplo, `specty guard` sin `--tool`) ENTONCES responde la CLI completa, como hoy.
- AC4: CUANDO se construye la CLI otra vez ENTONCES en `dist/` no quedan trozos de builds anteriores.

## Diseño

- Core: `schema/config.ts`, `schema/state.ts` y `spec/frontmatter.ts` importan `* as z from "zod"`.
- `enforce/entry.ts` (nuevo): `guardCommand` y `hookCommand`, lo que hacían las acciones de `guard` y `hook` en `enforce/commands.ts`, que ahora las llaman; y `runHook(argv, base)`, que reconoce la forma exacta de los hooks, arma el entorno con una terminal sin prompts y los ejecuta, o devuelve `undefined`.
- `main.ts` no importa nada de forma estática: si el primer argumento es `guard` o `hook`, carga `enforce/entry` e intenta `runHook`; si no, o si devuelve `undefined`, carga `program`, la terminal y la invocación, como hasta ahora.
- `build.mjs`: `splitting: true`, trozos `[name]-[hash]` en `dist/`, borra los `chunk-*.mjs` que la build no generó, y `--metafile <archivo>` guarda el metafile de esbuild para los tests.

## Archivos

- modificar packages/core/src/schema/config.ts — zod como espacio de nombres
- modificar packages/core/src/schema/state.ts — zod como espacio de nombres
- modificar packages/core/src/spec/frontmatter.ts — zod como espacio de nombres
- crear packages/cli/src/enforce/entry.ts — los comandos de los hooks sin el resto de la CLI
- modificar packages/cli/src/enforce/commands.ts — `guard` y `hook` llaman a `entry.ts`
- modificar packages/cli/src/main.ts — los hooks van a su entrada; lo demás, a la CLI completa
- crear packages/cli/test/hooks-entry.test.ts — `runHook` responde como la CLI completa y deja pasar lo demás
- modificar packages/cli/build.mjs — bundle partido, sin trozos viejos, y `--metafile`
- modificar packages/cli/test/bundle.test.ts — lo que cargan los hooks y que el bundle partido funciona
- modificar docs/ARCHITECTURE.md — la entrada de los hooks (§2) y su rendimiento (§10)

## Tareas

- [x] T1: Core importa zod como espacio de nombres
  - files: packages/core/src/schema/config.ts, packages/core/src/schema/state.ts, packages/core/src/spec/frontmatter.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-core test
  - type: perf
- [x] T2: Los hooks tienen su propia entrada
  - files: packages/cli/src/enforce/entry.ts, packages/cli/src/enforce/commands.ts, packages/cli/src/main.ts, packages/cli/test/hooks-entry.test.ts
  - ac: AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/hooks-entry.test.ts test/enforce.test.ts
  - type: perf
- [x] T3: El bundle partido
  - files: packages/cli/build.mjs, packages/cli/test/bundle.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC4
  - verify: pnpm check
  - type: build

## Riesgos

- R1: Un trozo que falte en el paquete o en `dist/` rompería todos los comandos — `files: ["dist"]` los incluye, el test de bundle ejecuta el bundle partido, y la build borra solo los trozos que no generó.
- R2: Un import estático nuevo desde `enforce/` hacia la CLI volvería a cargarlo todo sin que nadie lo note — el test de bundle recorre los imports del metafile y falla si los hooks llegan a commander, los prompts, `program.ts` o el servidor.

## Cierre

### Resumen

Los hooks cargan solo su entrada. `main.ts` ya no importa nada de forma estática: con `guard --tool <id>`, `guard --tool=<id>` o `hook <nombre> [args…]` carga `enforce/entry.ts` y los ejecuta con una terminal sin prompts; con cualquier otra cosa carga la CLI completa. `enforce/commands.ts` llama a las mismas funciones (`guardCommand`, `hookCommand`), así que las dos rutas responden igual, y un test lo comprueba. `build.mjs` parte el bundle en `dist/` y borra los trozos de builds anteriores. Core importa zod como espacio de nombres, y el bundle de la CLI baja de 1,70 a 1,14 MB, sin las traducciones de zod. Medido el 2026-10-24, el guard de un `Bash` bajó de 123 a 101 ms de mediana en un prototipo sin carga, y de 359 a 244 ms con la máquina cargada por otras sesiones.

### Desviaciones

- **Los trozos no se llaman todos `chunk-*.mjs` (A2):** los de los imports dinámicos llevan el nombre de su módulo (`entry-*`, `program-*`…), así que la build borra cualquier `.mjs` de `dist/` que no haya generado.
- **El test no exige que los hooks dejen fuera `install/`:** `install/agents.ts` entra porque `flow/worktree.ts` importa de él la lista `AGENT_HOOK_FILES`. El test comprueba lo que dice AC2 (commander, los prompts, `program.ts` y el servidor) y además `commands/init.ts`.

### Decisiones

- **Una sola implementación de cada comando de hook:** las acciones de commander y `runHook` llaman a `guardCommand` y `hookCommand`, así que no hay dos versiones que se puedan separar.
- **El test recorre el metafile de esbuild, no los tiempos:** los tiempos varían con la carga de la máquina; el grafo de imports no.
- **El índice de core no cambia:** el bundle ya deja fuera los módulos de core que no se usan (`sideEffects: false`), y así este cambio no choca con los de otras sesiones en `core/src/index.ts`.

### Pendientes

- **`AGENT_HOOK_FILES` fuera de `install/agents.ts`:** así los hooks dejarían de cargar ese módulo y jsonc-parser (unos 9 KB).
- **Las llamadas a git del guard** son ahora la mayor parte de su tiempo: agruparlas o evitar las que no hacen falta para cada evento.
