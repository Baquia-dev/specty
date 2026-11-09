---
kind: standard
---

# La publicación en npm usa la publicación de confianza

## Objetivo

La primera versión (0.1.0, beta pública) de `@baquia-dev/specty` la publica la persona a mano desde su terminal, y después `.github/workflows/release.yml` publica cada versión con la publicación de confianza de npm (OIDC): sin el secreto `NPM_TOKEN`, con un npm que la admita y con la procedencia generada sola. ARCHITECTURE.md explica los tres pasos para que la persona sepa qué hacer la primera vez y en las siguientes.

## Fuera de alcance

- Publicar la 0.1.0, configurar el publicador de confianza en npmjs.com, crear etiquetas o subir `main`: los hace la persona o la sesión principal.
- La publicación por etapas (`npm stage publish`, aprobada con 2FA en npmjs.com): el workflow publica directo con `npm publish`.
- El README: no tiene sección de contribuir ni de publicar, y no se crea.
- Publicar la extensión de VS Code.

## Supuestos

- A1: La publicación de confianza con GitHub Actions pide npm 11.5.1 o posterior, Node 22.14.0 o posterior, un runner alojado por GitHub, el permiso `id-token: write` y que `repository.url` de `package.json` sea el repositorio (ya es `git+https://github.com/Baquia-dev/specty.git`); con ella no hace falta token y npm genera la procedencia sola en un repositorio público, que lo es (docs.npmjs.com/trusted-publishers, consultado el 2026-11-09). El npm de Node 22 es anterior a la 11.5.1, así que el job lo actualiza.
  - impacto: alto
- A2: El publicador de confianza se configura en los ajustes de un paquete que ya existe en npmjs.com (Settings → Trusted publishing), con la organización o el usuario (`Baquia-dev`), el repositorio (`specty`) y el nombre del workflow (`release.yml`); por eso la primera versión se publica a mano. Las configuraciones nuevas permiten siempre `npm stage publish`, y `npm publish` hay que marcarlo, porque el workflow publica directo.
  - impacto: alto
- A3: `publishConfig.provenance: true` hace fallar una publicación desde la terminal («provenance generation requires a supported CI environment»), así que la publicación a mano lleva `--provenance=false`; en el workflow se queda en `true`, y `publishConfig.access: public` sustituye a `--access public`.

## Criterios de aceptación

- AC1: CUANDO se sube una etiqueta `v<versión>` ENTONCES `release.yml` publica `@baquia-dev/specty` con la publicación de confianza: ningún paso usa `NPM_TOKEN` ni `NODE_AUTH_TOKEN`, el workflow tiene `id-token: write`, actualiza npm a la 11.5.1 o posterior antes de publicar, y publica con `npm publish` en `packages/cli` solo tras comprobar que la etiqueta es la versión del paquete y tras `pnpm check`.
- AC2: CUANDO la persona lee en ARCHITECTURE.md cómo se publica ENTONCES encuentra los tres pasos: la primera vez publica a mano en `packages/cli` con `npm publish --provenance=false`, luego configura en npmjs.com el publicador de confianza (Baquia-dev/specty, `release.yml`, con `npm publish` permitido), y después cada versión se publica subiendo la etiqueta `v<versión>`; ya no dice que haga falta `NPM_TOKEN`.
  - test: manual
- AC3: CUANDO se ejecuta `npm publish --dry-run --provenance=false` en `packages/cli`, sin `npm login` ENTONCES el paquete que saldría es `@baquia-dev/specty` 0.1.0 y lleva README, LICENSE, NOTICE, el bundle de `dist` y la UI, sin publicar nada.
  - test: manual

## Diseño

- `release.yml`: tras `actions/setup-node` (Node 22, con `registry-url`, como el ejemplo de npm), un paso ejecuta `npm install -g npm@^11.5.1`; el paso de publicar ejecuta `npm publish` sin `env`, y `publishConfig` del paquete pone el acceso público y la procedencia. Se mantienen la comprobación de la etiqueta y `pnpm check` antes de publicar, y los comentarios dicen que el token es el OIDC de la publicación de confianza.
- `workflows.test.ts`: el test de la publicación comprueba el orden (etiqueta, `pnpm check`, npm 11.5.1 o posterior, `npm publish`), que el archivo no nombra `NPM_TOKEN` ni `NODE_AUTH_TOKEN`, y lo que ya comprobaba de `package.json`.
- ARCHITECTURE.md, párrafo «CI y publicación»: la publicación de confianza y los tres pasos de la persona.

## Archivos

- modificar .github/workflows/release.yml — publicar con la publicación de confianza, sin `NPM_TOKEN` y con npm 11.5.1 o posterior
- modificar packages/cli/test/workflows.test.ts — el workflow de publicación usa la publicación de confianza (AC1)
- modificar docs/ARCHITECTURE.md — los tres pasos de la publicación y la publicación de confianza (AC2)

## Tareas

- [x] T1: `release.yml` publica con la publicación de confianza
  - files: .github/workflows/release.yml, packages/cli/test/workflows.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/workflows.test.ts && pnpm lint
  - type: ci
- [ ] T2: ARCHITECTURE.md explica los pasos de la publicación
  - files: docs/ARCHITECTURE.md
  - ac: AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/workflows.test.ts
  - type: docs

## Riesgos

- R1: La publicación de confianza solo se comprueba de verdad al subir la primera etiqueta tras la 0.1.0. Mitigación: el workflow sigue el ejemplo de la documentación de npm, y si npm responde ENEEDAUTH, su guía de problemas pide revisar el nombre del workflow y el `id-token: write`, que el test fija.
