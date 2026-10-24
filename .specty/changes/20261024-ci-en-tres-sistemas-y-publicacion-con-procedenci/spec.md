---
kind: standard
---

# CI en tres sistemas y publicación con procedencia

## Objetivo

Segunda parte del punto «CI en Linux, macOS y Windows, más knip y `npm publish --provenance`»; knip ya está en `pnpm check`. El repositorio no tiene CI: `pnpm check` solo corre en la máquina de quien trabaja, que es macOS, aunque Specty promete Linux, macOS y Windows (a gentle-ai sus usuarios le encontraron cuatro fallos de macOS porque su CI nunca corría allí). Y no hay forma de publicar el paquete que pruebe de dónde sale, aunque Specty instala hooks que se ejecutan en cada acción del agente. Ahora un CI ejecuta `pnpm check` en los tres sistemas, y un workflow publica `@baquia-dev/specty` con `npm publish --provenance` al subir una etiqueta de versión.

## Fuera de alcance

- Arreglar lo que falle en Windows: este cambio lo hace visible.
- Publicar una versión: el workflow queda listo, y la primera publicación la decide la persona.
- `specty ci` como check obligatorio (ARCHITECTURE §10, capa 4).

## Supuestos

- A1: Windows corre el CI entero pero no lo bloquea (`continue-on-error`) hasta que pase una vez, porque aquí no se puede probar; Linux y macOS sí bloquean.
  - impacto: alto
- A2: `@baquia-dev/specty` deja de ser `private` para poder publicarse, con `publishConfig` público y con procedencia; solo el workflow de publicación lo publica, al subir una etiqueta `v<versión>` que coincida con la del paquete, y necesita el secreto `NPM_TOKEN` del repositorio.
  - impacto: alto
- A3: El CI usa Node 22, el mínimo que admite Specty, en los tres sistemas, y Node 24 en Linux; las acciones van por versión mayor (`actions/checkout@v5`, `actions/setup-node@v5`, `pnpm/action-setup@v4`), y pnpm por la versión mayor que pide `devEngines` (11).

## Criterios de aceptación

- AC1: CUANDO llega un push a `main` o una pull request ENTONCES el CI ejecuta `pnpm install --frozen-lockfile` y `pnpm check` en Linux, macOS y Windows con Node 22, y en Linux también con Node 24.
- AC2: CUANDO se sube una etiqueta `v<versión>` ENTONCES el workflow de publicación comprueba que coincide con la versión del paquete, ejecuta `pnpm check` y publica `@baquia-dev/specty` con `npm publish --provenance --access public`, con el permiso `id-token: write`.
- AC3: CUANDO alguien cambia los workflows ENTONCES un test comprueba que siguen cumpliendo AC1 y AC2.

## Diseño

- `.github/workflows/ci.yml`: matriz de sistemas y versiones de Node, pnpm con `pnpm/action-setup`, caché de pnpm en `setup-node`, `pnpm install --frozen-lockfile` y `pnpm check`; Windows con `continue-on-error`.
- `.github/workflows/release.yml`: etiquetas `v*`, permisos `contents: read` e `id-token: write`, la misma instalación, la comprobación de la versión, `pnpm check` y `npm publish --provenance --access public` en `packages/cli`, cuyo `prepack` construye la UI.
- `packages/cli/test/workflows.test.ts` lee los dos workflows con `yaml`.

## Archivos

- crear .github/workflows/ci.yml — `pnpm check` en los tres sistemas
- crear .github/workflows/release.yml — publicación con procedencia
- modificar packages/cli/package.json — publicable, con `publishConfig`
- crear packages/cli/test/workflows.test.ts — los workflows cumplen lo acordado
- modificar docs/ARCHITECTURE.md — CI, knip y publicación (§16)

## Tareas

- [x] T1: El CI en Linux, macOS y Windows
  - files: .github/workflows/ci.yml, packages/cli/test/workflows.test.ts
  - ac: AC1, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/workflows.test.ts
  - type: ci
- [ ] T2: La publicación con procedencia
  - files: .github/workflows/release.yml, packages/cli/package.json, packages/cli/test/workflows.test.ts, docs/ARCHITECTURE.md
  - ac: AC2, AC3
  - verify: pnpm check
  - type: ci

## Riesgos

- R1: Una publicación accidental — solo la hace el workflow, con una etiqueta que coincida con la versión, tras `pnpm check`, y con un secreto que la persona tiene que crear.
- R2: El CI de Windows en rojo desde el primer día — no bloquea (A1), y sus fallos quedan a la vista para arreglarlos aparte.
- R3: Un workflow que no se puede probar aquí — el test fija su forma, y el primer push a `main` lo ejecuta de verdad.
