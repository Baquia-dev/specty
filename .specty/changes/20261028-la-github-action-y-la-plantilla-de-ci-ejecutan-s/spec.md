---
kind: standard
epic: 20261028-fase-3-auditoria-y-ecosistema
slice: C3
---

# La GitHub Action y la plantilla de CI ejecutan `specty ci`

## Objetivo

`specty ci` ya existe, pero ningún workflow lo ejecuta. Este corte lo lleva a GitHub Actions: `specty ci` deduce del evento (pull request o push) qué commits revisar, una Action en la raíz del repositorio lo ejecuta con la versión exacta del CLI, y la plantilla que escribe `specty check --install` lo añade en los pull requests. El propio repositorio de Specty lo ejecuta en su CI.

## Fuera de alcance

- Comentarios o anotaciones en el pull request.
- Plantillas para otras plataformas de CI.
- Publicar la Action en el Marketplace de GitHub y crear su etiqueta: eso va con el release, que hace la persona.

## Supuestos

- A1: `specty ci` deduce el rango del evento solo si corre en GitHub Actions (`GITHUB_ACTIONS=true`) y no recibe `--base`; así la Action y la plantilla solo ejecutan `specty ci`, y la lógica del evento se prueba en TypeScript. Las opciones explícitas siempre ganan.
  - impacto: alto
- A2: En un pull request, el rango es `origin/<rama base>..HEAD`, el destino es la rama base y `--head-ref` es la rama del pull request. En un push, el rango empieza en `before` del evento y el destino es la rama empujada; si el push crea la rama (`before` son ceros), empieza en `origin/<rama por defecto>` del evento.
  - impacto: alto
- A3: La Action necesita la historia de las ramas: si el clon es superficial, un paso la completa con `git fetch --unshallow` antes de ejecutar `specty ci`; la documentación recomienda `fetch-depth: 0`.
- A4: La versión que ejecuta la Action es su input `version` o, sin él, la de la etiqueta con la que se usa (`uses: Baquia-dev/specty@v0.2.0` → `0.2.0`, por `github.action_ref`). Con otra referencia y sin `version`, la Action falla y pide el input, porque `latest` rompería la promesa de versión exacta.
  - impacto: medio
- A5: El script de la Action es bash, que también existe en los runners de Windows de GitHub.

## Criterios de aceptación

- AC1: CUANDO `specty ci` corre sin `--base` en GitHub Actions por un pull request ENTONCES revisa `origin/<rama base>..HEAD`, con la rama base como destino y la rama del pull request como `--head-ref`.
- AC2: CUANDO corre así por un push ENTONCES revisa desde el `before` del evento hasta `HEAD`, con la rama empujada como destino, o desde `origin/<rama por defecto>` si el push crea la rama; y si recibe `--base`, `--into` o `--head-ref`, esas opciones ganan a lo que da el evento.
- AC3: CUANDO un workflow usa la Action de Specty ENTONCES ejecuta `npx -y @baquia-dev/specty@<versión> ci` con la versión de su input `version` o, sin él, la de su etiqueta, falla con un error que pide el input si no hay ninguna, y el paso falla si falla `specty ci`.
- AC4: CUANDO la persona ejecuta `specty check --install` ENTONCES la plantilla de GitHub Actions ejecuta también `specty ci` en los pull requests, con la misma versión exacta que `specty check`.

## Diseño

- `flow/ci-github.ts` traduce el entorno de GitHub Actions (`GITHUB_EVENT_NAME`, `GITHUB_BASE_REF`, `GITHUB_HEAD_REF`, `GITHUB_REF_NAME` y el JSON de `GITHUB_EVENT_PATH`) a `CiOptions`. `commands/ci.ts` las combina con las de la línea de comando.
- `action.yml`, en la raíz, es una action compuesta con tres pasos:
  - prepara Node 22;
  - completa la historia si el clon es superficial;
  - ejecuta `specty ci` con la versión resuelta en bash.
- La plantilla de `check/ci.ts` añade el paso `specty ci` con `if: github.event_name == 'pull_request'`.
- El job `specty-check` de `.github/workflows/ci.yml` ejecuta también `node packages/cli/dist/specty.mjs ci`.

## Archivos

- crear packages/cli/src/flow/ci-github.ts — el rango, el destino y la rama del pull request desde el evento de GitHub Actions
- modificar packages/cli/src/commands/ci.ts — usar el evento cuando no hay `--base`
- crear packages/cli/test/ci-github.test.ts — `specty ci` en un pull request y en un push simulados
- crear action.yml — la Action de Specty
- modificar packages/cli/src/check/ci.ts — el paso `specty ci` en la plantilla
- modificar .github/workflows/ci.yml — la CI de Specty ejecuta `specty ci`
- crear packages/cli/test/action.test.ts — el script de la Action y la plantilla
- modificar docs/checks.md — la Action y el evento
- modificar docs/checks.en.md — la Action y el evento
- modificar docs/formats.md — la plantilla de `check --install`
- modificar docs/ARCHITECTURE.md — §10: la Action

## Tareas

- [x] T1: `specty ci` lee el evento de GitHub Actions
  - files: packages/cli/src/flow/ci-github.ts, packages/cli/src/commands/ci.ts, packages/cli/test/ci-github.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty typecheck && pnpm --filter @baquia-dev/specty exec vitest run test/ci-github.test.ts test/ci.test.ts
- [x] T2: La Action, la plantilla y la CI de Specty
  - files: action.yml, packages/cli/src/check/ci.ts, .github/workflows/ci.yml, packages/cli/test/action.test.ts
  - ac: AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty typecheck && pnpm --filter @baquia-dev/specty exec vitest run test/action.test.ts test/check-install.test.ts
- [ ] T3: Documentar la Action
  - files: docs/checks.md, docs/checks.en.md, docs/formats.md, docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-docs.test.ts
  - type: docs

## Riesgos

- R1: Con un clon superficial, `origin/<rama base>` o `before` no existen y `git log` falla. Mitigación: la Action completa la historia antes, y `specty ci` falla con el error de git en vez de pasar con un rango vacío.
- R2: La primera versión publicada con la Action aún no tiene etiqueta. Mitigación: hasta el release, se usa con el input `version` o con la plantilla, que ejecuta el CLI de npm.
