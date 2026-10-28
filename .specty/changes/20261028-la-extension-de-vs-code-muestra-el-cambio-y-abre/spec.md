---
kind: standard
allowedDependencies:
  - "@types/vscode"
  - "@vscode/vsce"
  - esbuild
  - "@baquia-dev/specty-core"
---

# La extensión de VS Code muestra el cambio y abre la UI

## Objetivo

Quien trabaja en VS Code no ve en qué fase está su cambio ni si le espera una decisión sin abrir una terminal. Una primera extensión, `packages/vscode`, se activa en las carpetas con Specty, muestra en la barra de estado el cambio de la carpeta, su fase y si espera a la persona, y abre la UI de `specty ui` con un clic. Se empaqueta en un `.vsix` que se instala a mano, sin publicarla aún.

## Fuera de alcance

- Que `specty --json status` traiga los cambios como datos: va en su propio cambio rápido, y aquí los tests usan un CLI de prueba que ya los trae.
- Decidir (aprobar, aceptar, cerrar) desde VS Code: llega con la webview de F4, que habla con la UI por `postMessage`.
- Publicar la extensión en el Marketplace de VS Code o en Open VSX.
- Windows: sin shell, Node no lanza los `.cmd` que instala npm.
- Vistas propias (un árbol de cambios, un panel), diagnósticos o CodeLens.

## Supuestos

- A1: La extensión le pregunta el estado al CLI (`specty --json status`, con `changes` y `delegated`) en lugar de leer `.specty/` por su cuenta, porque cuál es el cambio de una carpeta depende de la rama, de los punteros de git y de las worktrees, y esa lógica ya vive en el CLI.
  - impacto: alto
- A2: El servidor que arranca la extensión no tiene terminal, así que la UI queda en solo lectura, como un servidor que arranca un agente, y ya explica que para decidir hay que arrancar `specty ui` en la terminal; así la extensión no abre ninguna vía nueva para conceder permisos.
  - impacto: alto
- A3: La UI se abre en el navegador del sistema (`env.openExternal`) y no en el navegador simple de VS Code, porque dentro de una webview no viajaría la cookie de sesión `SameSite=Strict` del servidor.
  - impacto: medio
- A4: El ajuste `specty.path` (por defecto `specty`) es de máquina (`scope: machine`) y la extensión no se activa en espacios de trabajo no confiables, para que un repositorio no pueda elegir qué programa ejecuta.
- A5: Con varias carpetas abiertas, la extensión usa la primera que tiene `.specty/config.yaml`.
- A6: `engines.vscode` es `^1.90.0`, con `@types/vscode` 1.90.0, para que funcione también en Cursor, Windsurf y Antigravity, que siguen a VS Code con retraso.

## Criterios de aceptación

- AC1: CUANDO se abre en VS Code una carpeta con Specty ENTONCES la barra de estado muestra el cambio de esa carpeta con su fase y si espera a la persona; sin cambio propio, cuántos cambios hay abiertos y cuántos la esperan; y su tooltip lista los cambios abiertos.
- AC2: CUANDO cambia el `state.json` de un cambio de la carpeta, cambia el ajuste `specty.path` o la ventana recupera el foco ENTONCES la barra de estado se actualiza.
- AC3: CUANDO la persona pulsa la barra de estado o ejecuta «Specty: Abrir la UI» ENTONCES la extensión arranca `specty ui` en la carpeta, una sola vez por ventana, y abre su enlace en el navegador; al cerrarse la ventana, lo detiene.
- AC4: CUANDO no se encuentra el comando `specty`, o no da el estado como datos ENTONCES la barra de estado lo avisa, y al pulsarla un aviso dice cómo instalarlo o actualizarlo y ofrece abrir el ajuste `specty.path`.
- AC5: CUANDO se empaqueta la extensión ENTONCES se genera `packages/vscode/dist/specty.vsix` con el bundle, el manifiesto, sus textos, el README y la licencia, sin dependencias ni fuentes.
  - test: manual

## Diseño

- `src/specty.ts` habla con el CLI sin shell (`execFile` y `spawn`): `readStatus` ejecuta `specty --json status` y valida lo que vuelve (el estado, el comando que falta, o un fallo con su motivo, también con un CLI que no trae `changes`); `startUi` lanza `specty ui`, espera el enlace `http://localhost:<puerto>/?token=…` en su salida durante 20 s como mucho y devuelve el servidor con su enlace y cómo pararlo.
- `src/view.ts` escribe en español o en inglés (según `env.language`) el texto y el tooltip de la barra de estado y los avisos, con el icono y el nombre de cada fase como la UI.
- `src/extension.ts` crea la barra de estado, cuyo clic es `specty.openUi`, registra ese comando, vigila `.specty/changes/*/state.json`, el ajuste y el foco de la ventana, actualiza la barra sin solapar lecturas, reutiliza el servidor mientras viva y lo para al cerrarse.
- Los tests sustituyen el módulo `vscode` con `vi.mock` y el CLI con un script que imita `specty`.
- `build.mjs` empaqueta `src/extension.ts` con esbuild en `dist/extension.cjs` (CommonJS, `vscode` externo); con `--vsix` monta en `dist/vsix` solo lo que se publica (el bundle, el manifiesto, sus textos, el README, `LICENSE` y `NOTICE`) y ejecuta allí `vsce package --no-dependencies`, que deja `dist/specty.vsix`.

## Archivos

- crear packages/vscode/package.json — el manifiesto: activación, comando, ajuste, capacidades y scripts
- crear packages/vscode/package.nls.json — los textos del manifiesto en inglés
- crear packages/vscode/package.nls.es.json — los textos del manifiesto en español
- crear packages/vscode/tsconfig.json — los tipos del código y de los tests: Node y VS Code
- crear packages/vscode/vitest.config.ts — los tests y su cobertura
- crear packages/vscode/src/specty.ts — leer el estado y arrancar la UI con el CLI
- crear packages/vscode/src/view.ts — los textos de la barra de estado y de los avisos
- crear packages/vscode/src/extension.ts — la activación, la barra de estado y el comando
- crear packages/vscode/test/specty.test.ts — el estado, la UI y el comando que falta, con un CLI de prueba
- crear packages/vscode/test/view.test.ts — el texto y el tooltip en cada caso
- crear packages/vscode/test/extension.test.ts — la extensión con un `vscode` de prueba
- crear packages/vscode/build.mjs — el bundle y el `.vsix`
- crear packages/vscode/README.md — qué hace, cómo instalarla, su ajuste y sus límites
- modificar pnpm-lock.yaml — las dependencias nuevas
- modificar docs/ARCHITECTURE.md — la extensión en F4

## Tareas

- [x] T1: El paquete de la extensión y su conversación con el CLI
  - files: packages/vscode/package.json, packages/vscode/tsconfig.json, packages/vscode/vitest.config.ts, packages/vscode/src/specty.ts, packages/vscode/test/specty.test.ts, pnpm-lock.yaml
  - ac: AC3, AC4
  - verify: pnpm exec vitest run --root packages/vscode test/specty.test.ts && pnpm lint
- [x] T2: La barra de estado y el comando que abre la UI
  - files: packages/vscode/src/view.ts, packages/vscode/src/extension.ts, packages/vscode/package.nls.json, packages/vscode/package.nls.es.json, packages/vscode/test/view.test.ts, packages/vscode/test/extension.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm exec vitest run --root packages/vscode --coverage && pnpm --filter specty-vscode typecheck && pnpm lint && pnpm knip
- [ ] T3: Empaquetar la extensión en un `.vsix` y documentarla
  - files: packages/vscode/build.mjs, packages/vscode/README.md, docs/ARCHITECTURE.md
  - ac: AC5
  - verify: pnpm --filter specty-vscode package && unzip -l packages/vscode/dist/specty.vsix && pnpm lint
  - type: build

## Riesgos

- R1: La línea con el enlace de `specty ui` puede cambiar de redacción. Mitigación: la extensión busca solo la URL con su token y, si no llega en 20 s, para el proceso y lo dice.
- R2: Un `specty` anterior no trae `changes` en `--json status`. Mitigación: la barra de estado dice que hay que actualizar Specty en lugar de fallar en silencio.
