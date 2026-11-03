---
kind: standard
---

# doctor avisa de Astro, los comprobadores de tipos de webpack y Rsbuild, Turborepo y Deno ante las worktrees

## Objetivo

El 2026-11-03 se midieron, con las versiones reales, los servidores de desarrollo y las herramientas de JavaScript que faltaban ante un cambio en `.worktrees/`. Next.js, Angular CLI, Parcel, webpack y Rsbuild sin plugins, Nuxt, SvelteKit (salvo por su Vite), nodemon, `node --watch`, `tsx watch`, la CLI de Nest, pnpm, npm y Nx con la carpeta ignorada no la ven. Sí la ven, desde la carpeta principal:

- Astro, que recarga con el `tsconfig.json` de un cambio y se reinicia con su `astro.config.*`;
- fork-ts-checker-webpack-plugin y el comprobador de tipos de Rsbuild, que recompilan cuando se crea un archivo en un cambio;
- Turborepo con `**` en `pnpm-workspace.yaml`, que falla por paquetes repetidos;
- `deno test` y `deno check`, que ejecutan y comprueban sus archivos.

`doctor` pasa a decir, para cada una, qué añadir y dónde, con una exclusión que funciona desde la carpeta principal y dentro del cambio, con cualquier ruta.

## Fuera de alcance

- Python y los demás lenguajes: van en un cambio propio.
- Metro con Watchman: no se pudo medir (Watchman no está instalado y descargar su binario no se permitió).
- Angular con `NG_BUILD_WATCH_ROOT=1`, y webpack con un `watchOptions.ignored` propio: el ADR lo documenta, `doctor` no lo mira.
- Editar las configuraciones: `doctor` solo avisa (ADR 0018).

## Supuestos

- A1: Las configuraciones están en la raíz del proyecto, como las de Vite y Metro que ya mira `doctor`.
- A2: Turborepo solo falla cuando un patrón de `pnpm-workspace.yaml` empieza por `**`: con `packages/*` no ve la carpeta, medido con Turborepo 2.11.10.
- A3: Un proyecto de Deno se reconoce por `deno.json`, `deno.jsonc` o `deno.lock` en la raíz.

## Criterios de aceptación

- AC1: CUANDO existe `.worktrees/` y hay un `astro.config.*` en la raíz que no la excluye ENTONCES `specty doctor` pide en `vite.server.watch.ignored` de ese archivo la misma función que a Vite y sale con 1; CUANDO una línea la nombra junto a `dirname` ENTONCES dice que Astro la excluye.
- AC2: CUANDO existe `.worktrees/` y `package.json` declara `fork-ts-checker-webpack-plugin` ENTONCES `doctor` pide `"node_modules", ".worktrees"` en `exclude` de `tsconfig.json` y sale con 1; CUANDO `tsconfig.json` o el `webpack.config.*` de la raíz nombran `.worktrees` ENTONCES dice que lo excluye.
- AC3: CUANDO existe `.worktrees/` y `package.json` declara `@rsbuild/plugin-type-check` ENTONCES `doctor` pide en `tools.rspack.watchOptions.ignored` del `rsbuild.config.*` de la raíz una función que compara el principio de la ruta, con las barras invertidas pasadas a `/`, y sale con 1; CUANDO una línea la nombra junto a `dirname` ENTONCES dice que lo excluye.
- AC4: CUANDO existe `.worktrees/`, hay `turbo.json` y un patrón de `pnpm-workspace.yaml` empieza por `**` ENTONCES `doctor` pide `"!.worktrees/**"` en `packages` de ese archivo y sale con 1; CUANDO el archivo nombra `.worktrees`, o sus patrones no empiezan por `**`, ENTONCES no avisa.
- AC5: CUANDO existe `.worktrees/` y hay `deno.json` o `deno.jsonc` sin `.worktrees` ENTONCES `doctor` pide `".worktrees/"` en su `exclude`; CUANDO solo hay `deno.lock` ENTONCES lo pide en `deno.json`; en los dos casos sale con 1, y CUANDO la configuración la nombra ENTONCES dice que Deno la excluye.

## Diseño

- `detect/worktree-tools.ts`: las cinco con la forma de las demás (`name`, `path`, `file`, `add`, `excluded`), en las líneas de `doctor` que ya existen. Astro y Rsbuild usan `anchored` y `usable`, como Vite.
- Astro usa la función de Vite (`VITE_ADD`). Rsbuild usa la misma comparación, pero pasa también la ruta del archivo de `\` a `/`: no se sabe con qué separador se la da su observador nativo en Windows.
- fork-ts-checker se excluye en `tsconfig.json`: resuelve cada entrada de `exclude` contra la carpeta del tsconfig y la compara con `path.relative`. Así va anclada y funciona con cualquier ruta, medido en una carpeta con paréntesis, corchetes y llaves. `node_modules` va en la lista porque un `exclude` propio sustituye al de TypeScript.
- Las dependencias se leen de `dependencies` y `devDependencies` de `package.json`, como `react-native` para Metro.
- Documentación: la tabla y el texto de la medición del ADR 0018, también lo que no reacciona y por qué, y la lista de `doctor` en ARCHITECTURE.

## Archivos

- modificar packages/cli/src/detect/worktree-tools.ts — Astro, fork-ts-checker, el comprobador de tipos de Rsbuild, Turborepo con `**` y Deno
- modificar packages/cli/test/doctor-watchers.test.ts — Astro y los dos comprobadores de tipos, con y sin exclusión
- modificar packages/cli/test/doctor-worktrees.test.ts — Turborepo y Deno, con y sin exclusión
- modificar docs/decisions/0018-worktrees-dentro-del-repositorio.md — la medición de las herramientas de JavaScript y la lista de `doctor`
- modificar docs/ARCHITECTURE.md — lo que comprueba `doctor` ante `.worktrees/`

## Tareas

- [x] T1: `doctor` avisa de Astro y de los comprobadores de tipos de webpack y Rsbuild
  - files: packages/cli/src/detect/worktree-tools.ts, packages/cli/test/doctor-watchers.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/doctor-watchers.test.ts
- [ ] T2: `doctor` avisa de Turborepo y Deno, y la documentación
  - files: packages/cli/src/detect/worktree-tools.ts, packages/cli/test/doctor-worktrees.test.ts, docs/decisions/0018-worktrees-dentro-del-repositorio.md, docs/ARCHITECTURE.md
  - ac: AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/doctor-worktrees.test.ts

## Riesgos

- R1: `worktree-tools.ts` crece de unas 160 a unas 250 líneas. Si pasa del aviso de 300 líneas de código, se propone dividirlo antes de seguir: herramientas de tests y lint por un lado, servidores y observadores por otro.
- R2: Una configuración que excluye la carpeta de otra forma recibe el aviso igual. El aviso no bloquea nada fuera de `doctor`.
