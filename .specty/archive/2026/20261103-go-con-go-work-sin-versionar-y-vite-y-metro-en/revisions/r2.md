---
kind: standard
---

# Go con go.work sin versionar, y Vite y Metro, en las worktrees de dentro

## Objetivo

Con un `go.work` sin versionar en la carpeta principal, Go no funciona en la worktree de un cambio: dentro del proyecto encuentra el de la carpeta principal y falla, y fuera no encuentra ninguno; pasa igual en las de Claude Code (`.claude/worktrees/`). `specty new` copia `go.work` y `go.work.sum` a la worktree, sin que entren en el cambio. Además, Vite y Metro en la carpeta principal reaccionan a lo que pasa en `.worktrees/` (Vite recarga la página cuando cambia un `tsconfig.json` de un cambio o se crea uno; Metro envía al móvil una actualización vacía por cada archivo, que muestra «Refreshing...» y borra LogBox), y `specty doctor` dice qué añadir a su configuración para excluirla sin romperlos dentro de la worktree.

## Fuera de alcance

- Un `go.work` en una subcarpeta, o con rutas `use` fuera del repositorio (`../shared`): Go no lo encuentra desde la worktree, y tampoco funcionaba en la ubicación de antes.
- Un mecanismo general para copiar archivos sin versionar a las worktrees, como `.worktreeinclude` de Claude Code.
- Editar las configuraciones de Vite y Metro: `doctor` avisa, como con Vitest, Jest, ESLint y Biome.
- Otros servidores de desarrollo (webpack, Next.js, Angular CLI, Parcel) y Metro con Watchman, sin medir.

## Supuestos

- A1: Solo se copian `go.work` y `go.work.sum` de la raíz de la carpeta principal: Go los busca subiendo de carpeta, y desde `.worktrees/<id>` llega a la raíz de la principal, no a sus subcarpetas. Se copian de la carpeta principal aunque `new` se ejecute desde otra worktree, si git no los sigue y la worktree nueva no los tiene.
- A2: Copiarlos es una excepción concreta de Go, como la de `#include` de C en las reglas: entre las herramientas medidas en ADR 0018, es la única que necesita un archivo sin versionar que solo está en la carpeta principal.
  - impacto: alto
- A3: Si la copia no está ignorada, `new` añade `/go.work` o `/go.work.sum` a `.git/info/exclude`, que comparten todas las worktrees, porque `task done` rechaza un archivo sin versionar fuera del alcance. También los oculta en la carpeta principal, donde ya estaban sin versionar; para versionarlos después hay que quitar esa línea o usar `git add -f`, y la tarjeta de `new` lo dice.
  - impacto: alto
- A4: Vite (`server.watch.ignored`) y Metro (`resolver.blockList`) comparan sus exclusiones con rutas absolutas: un patrón sin anclar, como `"**/.worktrees/**"` o `/\/\.worktrees\/.*/`, excluye también la propia carpeta cuando corren dentro de la worktree (medido el 2026-11-03: Vite 8.3.5 deja de observar sus archivos y Metro 0.87.2 responde 404 al bundle). Por eso `doctor` pide la ruta anclada a la carpeta de la configuración. Vitest, Jest, ESLint y Biome comparan rutas relativas a su raíz (Vitest 5.1.0 con `"**/.worktrees/**"` ejecuta sus tests dentro de la worktree).
- A5: Para Vite y Metro, una configuración excluye la carpeta si una de sus líneas nombra `.worktrees` y `dirname` (`import.meta.dirname`, `__dirname`); para Vitest en `vite.config.*`, si una línea nombra `.worktrees` sin `dirname`. Vitest se da por configurado en `vite.config.*` cuando no hay `vitest.config.*` y el archivo tiene una clave `test:`.
- A6: Metro está en el proyecto si la raíz tiene `metro.config.*` o `package.json` depende de `react-native` (Expo sin personalizar no tiene ese archivo); sin archivo, el aviso nombra `metro.config.js`, que la persona crea.

## Criterios de aceptación

- AC1: CUANDO la carpeta principal tiene `go.work` y `go.work.sum` sin versionar ENTONCES `specty new` los copia a la worktree con el mismo contenido y su tarjeta los nombra bajo «WORKSPACE DE GO COPIADO».
- AC2: CUANDO esos archivos no están ignorados ENTONCES `new` añade `/go.work` y `/go.work.sum` a `.git/info/exclude`, la tarjeta lo dice y `git status` de la worktree no los muestra; CUANDO `.gitignore` ya los ignora ENTONCES no añade esas líneas.
- AC3: CUANDO `go.work` está versionado, o no existe, ENTONCES `new` no copia nada de Go ni lo nombra.
- AC4: CUANDO existe `.worktrees/` y el `vite.config.*` de la raíz no la excluye ENTONCES `specty doctor` pide `` `${import.meta.dirname}/.worktrees/**` `` en `server.watch.ignored` y, si ese archivo configura Vitest y no hay `vitest.config.*`, `"**/.worktrees/**"` en `test.exclude`; sale con 1.
- AC5: CUANDO existe `.worktrees/` y Metro (su `metro.config.*`, o `react-native` en `package.json` sin él) no la excluye ENTONCES `doctor` pide ``new RegExp(`^${__dirname}/\\.worktrees/`)`` en `resolver.blockList` de ese archivo, o de `metro.config.js`; sale con 1.
- AC6: CUANDO Vite y Metro tienen su exclusión anclada y Vitest la suya ENTONCES `doctor` dice que excluyen `.worktrees/` y no avisa; CUANDO Vite solo tiene `"**/.worktrees/**"` ENTONCES `doctor` sigue pidiendo la anclada.

## Diseño

- `flow/worktree.ts`: tras los hooks, `addWorktree` copia el workspace de Go (`go.work`, `go.work.sum`) de la carpeta principal si git no lo sigue y la worktree no lo tiene, y lo ignora en `.git/info/exclude` si `git check-ignore` no lo ignora ya; la línea se escribe con el mismo código que `/.worktrees/`. Devuelve los hooks y el workspace copiados.
- `commands/new.ts`: pasa el workspace a la tarjeta.
- `core/src/cards/new.ts`: `WorktreeCreated.workspace` (opcional: los archivos y si se ignoraron en el clon), en una sección propia, en español e inglés.
- `detect/worktree-tools.ts`: Vite, Vitest en `vite.config.*` y Metro, con la forma de las demás (`name`, `path`, `file`, `add`, `excluded`), en las líneas de `doctor` que ya existen.
- Documentación: ARCHITECTURE (§9 Carpeta y Hooks, y lo que comprueba `doctor`) y ADR 0018: la medición de Vite y Metro, la de Go corregida (falla igual en las tres ubicaciones y `GOWORK=off` solo sirve si los módulos no se importan entre sí) y la decisión.

## Archivos

- modificar packages/cli/src/flow/worktree.ts — copiar el workspace de Go e ignorarlo en el clon
- modificar packages/cli/src/commands/new.ts — pasar el workspace copiado a la tarjeta
- modificar packages/core/src/cards/new.ts — la sección del workspace de Go copiado
- modificar packages/core/test/cards/new.test.ts — la sección, en español e inglés
- crear packages/cli/test/worktree-go-work.test.ts — la copia sin versionar, ignorada o versionada
- modificar packages/cli/src/detect/worktree-tools.ts — Vite, Vitest en `vite.config.*` y Metro
- crear packages/cli/test/doctor-watchers.test.ts — los avisos de Vite y Metro, con y sin exclusión
- modificar docs/ARCHITECTURE.md — la copia del workspace de Go y lo que comprueba `doctor`
- modificar docs/decisions/0018-worktrees-dentro-del-repositorio.md — la medición de Vite y Metro, la de Go corregida y la decisión

## Tareas

- [x] T1: `new` copia el workspace de Go sin versionar a la worktree
  - files: packages/cli/src/flow/worktree.ts, packages/cli/src/commands/new.ts, packages/core/src/cards/new.ts, packages/core/test/cards/new.test.ts, packages/cli/test/worktree-go-work.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/new.test.ts && pnpm --filter @baquia-dev/specty exec vitest run test/worktree-go-work.test.ts
- [x] T2: `doctor` avisa de Vite y Metro ante `.worktrees/`, y la documentación
  - files: packages/cli/src/detect/worktree-tools.ts, packages/cli/test/doctor-watchers.test.ts, docs/ARCHITECTURE.md, docs/decisions/0018-worktrees-dentro-del-repositorio.md
  - ac: AC4, AC5, AC6
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/doctor-watchers.test.ts test/doctor-worktrees.test.ts

## Riesgos

- R1: Si la ruta del proyecto tiene caracteres especiales de glob o de expresión regular (paréntesis, corchetes) o barras invertidas (Windows), la exclusión anclada no coincide: Vite y Metro siguen viendo `.worktrees/` como hoy, sin romper nada — el ADR lo dice.
- R2: Una configuración que excluye la carpeta de otra forma recibe el aviso igual, o una que nombra `.worktrees` y `dirname` en la misma línea sin excluirla no lo recibe — el aviso no bloquea nada fuera de `doctor`.

## Cierre

### Resumen

`specty new` copia a la worktree `go.work` y `go.work.sum` cuando la carpeta principal los tiene sin versionar y la worktree no los recibe con la rama. Si nada los ignora, añade `/go.work` y `/go.work.sum` a `.git/info/exclude`, con el mismo código que `/.worktrees/`, para que `task done` no los vea fuera del alcance; la tarjeta los nombra bajo «WORKSPACE DE GO COPIADO» y dice cómo versionarlos. `specty doctor` pide a Vite (`server.watch.ignored`) y a Metro (`resolver.blockList`, también en una app de React Native sin `metro.config.*`) la exclusión de `.worktrees/` anclada a la carpeta de su configuración, y a Vitest configurado en `vite.config.*` la suya en `test.exclude`. ARCHITECTURE y ADR 0018 recogen las mediciones de Vite 8.3.5 y Metro 0.87.2 y la corrección sobre Go. Probado con Go 1.27.3 real: en un workspace de dos módulos con `go.work` sin versionar, `go build` compila dentro de la worktree que crea este `specty`, y `git status` no muestra la copia.

### Desviaciones

- Las comprobaciones de la tarjeta, en español y en inglés, están en el test de la CLI (`worktree-go-work.test.ts`, con un repositorio en inglés) y no en `packages/core/test/cards/new.test.ts`: la verificación de T1 ejecutaba primero el test de core, y su fallo impedía llegar al test nuevo de la CLI, que `propose` exige ver fallar.

### Decisiones

- Para Vite y Metro, `doctor` da la exclusión por buena solo si una línea nombra `.worktrees` junto a `dirname`; para Vitest en `vite.config.*`, si la nombra sin `dirname`. Así una exclusión sin anclar, que rompería Vite y Metro dentro de la worktree, no silencia el aviso.
- `check-ignore` se consulta en la worktree nueva, que es donde `task done` mira los archivos sin seguimiento.

### Pendientes

- Otros servidores de desarrollo (webpack, Next.js, Angular CLI, Parcel) y Metro con Watchman, sin medir.
- La exclusión anclada no coincide si la ruta del proyecto tiene caracteres especiales de glob o de expresiones regulares, o barras invertidas (Windows).
